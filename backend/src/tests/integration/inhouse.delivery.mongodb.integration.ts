/**
 * REAL-MongoDB verification of the in-house delivery gate (Phase 1.1) and
 * recovery. OPT-IN ONLY — this file is outside the `npm test` glob.
 *
 * Safety (all enforced below; the run aborts otherwise):
 *  - Never reads `.env` or MONGODB_URI. The target comes only from
 *    HELLO_LOCAL_IT_MONGODB_URI, which you must point at a dedicated test
 *    cluster/database that holds no production data.
 *  - HELLO_LOCAL_IT_CONFIRM_ISOLATED must equal "I-CONFIRM-THIS-IS-NOT-PRODUCTION".
 *  - Writes only to a brand-new database named `hello_local_it_<timestamp>_<random>`
 *    and refuses to continue if that database already contains collections.
 *  - Requires a replica set (transactions). Never prints the URI.
 *  - Synthetic records only; no server, sockets, Firebase, Razorpay or
 *    workers are started. Offer dispatch is a recording stub.
 *  - Deletes nothing. Drop the printed database yourself when done.
 *
 * Run:
 *   HELLO_LOCAL_IT_MONGODB_URI="<test cluster uri>" \
 *   HELLO_LOCAL_IT_CONFIRM_ISOLATED="I-CONFIRM-THIS-IS-NOT-PRODUCTION" \
 *   npx tsx --test src/tests/integration/inhouse.delivery.mongodb.integration.ts
 */
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import mongoose from "mongoose";
import AppSettings from "../../models/AppSettings";
import Order from "../../models/Order";
import Delivery from "../../models/Delivery";
import DeliveryAssignment from "../../models/DeliveryAssignment";
import { acceptDeliveryOrder } from "../../services/orderLifecycleService";
import { setInHouseDeliveryEnabled } from "../../services/inHouseDeliveryService";
import { runInHouseDeliveryRecovery } from "../../services/inHouseDeliveryRecoveryService";

const URI = process.env.HELLO_LOCAL_IT_MONGODB_URI;
const CONFIRMED = process.env.HELLO_LOCAL_IT_CONFIRM_ISOLATED === "I-CONFIRM-THIS-IS-NOT-PRODUCTION";
const RACE_ITERATIONS = Math.min(Number(process.env.HELLO_LOCAL_IT_ITERATIONS) || 10, 25); // bounded
const DB_NAME = `hello_local_it_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
const ADMIN = new mongoose.Types.ObjectId().toString();
const fakeIo: any = { to: () => ({ emit: () => undefined }), sockets: { adapter: { rooms: new Map() }, sockets: new Map() } };

const skip = !URI || !CONFIRMED
  ? "Set HELLO_LOCAL_IT_MONGODB_URI (a dedicated test database) and HELLO_LOCAL_IT_CONFIRM_ISOLATED to run."
  : false;

before(async () => {
  if (skip) return;
  await mongoose.connect(URI!, { dbName: DB_NAME, serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db!;
  const existing = await db.listCollections().toArray();
  if (existing.length) throw new Error(`Refusing to run: database ${DB_NAME} is not empty.`);
  const hello: any = await db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== "isdbgrid") throw new Error("Refusing to run: transactions need a replica set or sharded cluster.");
  // Collections must exist before use inside transactions.
  await Promise.all([AppSettings, Order, Delivery, DeliveryAssignment, mongoose.models.OrderOperationLock].map(model => model.createCollection().catch(() => undefined)));
  await AppSettings.create({ contactEmail: "it@example.invalid", contactPhone: "0000000000", inHouseDelivery: { enabled: true } });
  console.log(`Integration database: ${DB_NAME} (drop it manually when finished)`);
});

after(async () => { if (!skip) await mongoose.disconnect(); });

let seq = 0;
async function courier() {
  seq++;
  return Delivery.create({ name: `IT Courier ${seq}`, mobile: String(9000000000 + seq + Math.floor(Math.random() * 1e5)).slice(0, 10),
    email: `it-courier-${DB_NAME}-${seq}@example.invalid`, password: crypto.randomBytes(12).toString("hex"), status: "Active", isOnline: false });
}
async function order(overrides: any = {}) {
  return Order.create({ customer: new mongoose.Types.ObjectId(), customerName: "IT Customer", customerEmail: "it@example.invalid",
    customerPhone: "0000000000", deliveryAddress: { address: "Synthetic", city: "Synthetic", pincode: "000000", latitude: 0, longitude: 0 },
    subtotal: 100, total: 100, paymentMethod: "COD", status: "Accepted", ...overrides });
}
async function setEnabled(enabled: boolean) {
  await setInHouseDeliveryEnabled(enabled, ADMIN);
}
const settings = () => AppSettings.findOne({}).lean() as any;

test("D: an assignment transaction blocks a concurrent disable until it commits (assignment first)", { skip }, async () => {
  await setEnabled(true);
  const o = await order();
  const c = await courier();
  const session = await mongoose.startSession();
  session.startTransaction();
  // Hold the gate write open, exactly as acceptDeliveryOrder does mid-transaction.
  await AppSettings.updateOne({ "inHouseDelivery.enabled": { $ne: false } }, { $inc: { "inHouseDelivery.assignmentSeq": 1 } }, { session });
  await Order.updateOne({ _id: o._id }, { $set: { deliveryBoy: c._id, deliveryBoyStatus: "Assigned" } }, { session });
  let disableDone = false;
  const disable = setEnabled(false).then(() => { disableDone = true; });
  await new Promise(resolve => setTimeout(resolve, 750));
  assert.equal(disableDone, false, "the disable could not commit while the assignment held the settings document");
  await session.commitTransaction();
  await session.endSession();
  await disable;
  assert.equal((await settings()).inHouseDelivery.enabled, false);
  assert.equal(String((await Order.findById(o._id))!.deliveryBoy), String(c._id), "the earlier assignment stands (drain work)");
});

test("A/D: a disable in flight makes the courier accept retry and then refuse (disable first)", { skip }, async () => {
  await setEnabled(true);
  const o = await order();
  const c = await courier();
  const session = await mongoose.startSession();
  session.startTransaction();
  await AppSettings.updateOne({}, { $set: { "inHouseDelivery.enabled": false } }, { session }); // admin disable, uncommitted
  const accept = acceptDeliveryOrder(String(o._id), String(c._id)).then(() => "assigned", (error: any) => error.reason || error.message);
  await new Promise(resolve => setTimeout(resolve, 750));
  await session.commitTransaction();
  await session.endSession();
  assert.equal(await accept, "IN_HOUSE_DELIVERY_DISABLED", "the retried accept saw the committed OFF and refused");
  assert.equal((await Order.findById(o._id))!.deliveryBoy, undefined);
  assert.equal(await DeliveryAssignment.countDocuments({ order: o._id }), 0);
});

test("B: manual admin assignment racing a disable never commits after the disable", { skip }, async () => {
  for (let i = 0; i < RACE_ITERATIONS; i++) {
    await setEnabled(true);
    const o = await order({ status: "Received" });
    const c = await courier();
    const before = (await settings()).inHouseDelivery.assignmentSeq || 0;
    const [assign] = await Promise.allSettled([
      acceptDeliveryOrder(String(o._id), String(c._id), { allowReassignment: true, assignedBy: ADMIN }),
      setEnabled(false),
    ]);
    const after = (await settings()).inHouseDelivery.assignmentSeq || 0;
    const assigned = !!(await Order.findById(o._id))!.deliveryBoy;
    assert.equal(assigned, assign.status === "fulfilled");
    assert.equal(after - before, assigned ? 1 : 0, "a committed assignment always passed the gate write");
    // Once OFF has committed, nothing new can be assigned.
    const late = await courier();
    await assert.rejects(acceptDeliveryOrder(String((await order())._id), String(late._id)), (e: any) => e.reason === "IN_HOUSE_DELIVERY_DISABLED");
  }
});

test("A: courier accepts racing a disable — same guarantees over repeated runs", { skip }, async () => {
  for (let i = 0; i < RACE_ITERATIONS; i++) {
    await setEnabled(true);
    const o = await order();
    const c = await courier();
    const [accept] = await Promise.allSettled([acceptDeliveryOrder(String(o._id), String(c._id)), setEnabled(false)]);
    const doc = await Order.findById(o._id);
    if (accept.status === "rejected") {
      assert.equal((accept.reason as any).reason, "IN_HOUSE_DELIVERY_DISABLED");
      assert.equal(doc!.deliveryBoy, undefined);
    } else {
      assert.equal(String(doc!.deliveryBoy), String(c._id));
    }
    assert.equal((await settings()).inHouseDelivery.enabled, false);
  }
});

test("C: many couriers accepting one order produce exactly one assignment", { skip }, async () => {
  await setEnabled(true);
  const o = await order();
  const couriers = await Promise.all(Array.from({ length: 5 }, () => courier()));
  const results = await Promise.allSettled(couriers.map(c => acceptDeliveryOrder(String(o._id), String(c._id))));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(await DeliveryAssignment.countDocuments({ order: o._id }), 1);
  const winner = couriers[results.findIndex(r => r.status === "fulfilled")];
  assert.equal(String((await Order.findById(o._id))!.deliveryBoy), String(winner._id));
});

test("E: recovery interrupted by OFF offers nothing further and nothing can be assigned", { skip }, async () => {
  await setEnabled(false);
  const waiting = await Promise.all([order(), order(), order()]);
  await setEnabled(true); // requests recovery
  const dispatched: string[] = [];
  const c = await courier();
  const result = await runInHouseDeliveryRecovery(fakeIo, {
    trigger: "integration",
    dispatch: async (_io, o) => {
      dispatched.push(String(o._id));
      await setEnabled(false); // admin switches OFF during the run
      await assert.rejects(acceptDeliveryOrder(String(o._id), String(c._id)), (e: any) => e.reason === "IN_HOUSE_DELIVERY_DISABLED");
      return "offered";
    },
  });
  assert.equal(result.status, "aborted");
  assert.equal(dispatched.length, 1);
  for (const w of waiting) assert.equal((await Order.findById(w._id))!.deliveryBoy, undefined);
});

test("F: re-enable recovery reconsiders waiting orders once, with no duplicate runs or assignments", { skip }, async () => {
  await setEnabled(false);
  const waiting = await Promise.all([order(), order()]);
  const assigned = await order({ deliveryBoy: (await courier())._id });
  await setEnabled(true);
  const dispatched: string[] = [];
  const dispatch = async (_io: any, o: any) => { dispatched.push(String(o._id)); await new Promise(r => setTimeout(r, 200)); return "offered" as const; };
  const [first, second] = await Promise.all([
    runInHouseDeliveryRecovery(fakeIo, { trigger: "integration-a", dispatch }),
    runInHouseDeliveryRecovery(fakeIo, { trigger: "integration-b", dispatch }),
  ]);
  assert.deepEqual([first.status, second.status].sort(), ["completed", "skipped"], "the lease admits exactly one runner");
  for (const w of waiting) assert.equal(dispatched.filter(id => id === String(w._id)).length, 1, "each waiting order offered once");
  assert.equal(dispatched.includes(String(assigned._id)), false, "assigned orders are untouched");
  assert.equal((await settings()).inHouseDelivery.recovery.pending, false);
  assert.equal((await runInHouseDeliveryRecovery(fakeIo, { dispatch })).status, "skipped", "nothing left pending");
  const c = await courier();
  await acceptDeliveryOrder(String(waiting[0]._id), String(c._id));
  assert.equal(await DeliveryAssignment.countDocuments({ order: waiting[0]._id }), 1);
});
