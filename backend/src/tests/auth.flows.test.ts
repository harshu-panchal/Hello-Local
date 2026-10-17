import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import Otp from '../models/Otp';
import SignupProof from '../models/SignupProof';
import RevokedToken from '../models/RevokedToken';
import Seller from '../models/Seller';
import Delivery from '../models/Delivery';
import Customer from '../models/Customer';
import Admin from '../models/Admin';
import Notification from '../models/Notification';
import jsonwebtoken from 'jsonwebtoken';
import { sendSmsOtp, sendOTP, verifySmsOtp, verifyOTP, verifySignupOtp } from '../services/otpService';
import { issueSignupProof, consumeSignupProof, createVerifiedSignup } from '../services/signupService';

// The database/provider boundaries are in memory; the real services, route
// handlers, OTP queries and JWT validation run without touching live accounts.
function matches(record: any, query: any): boolean {
  return Object.entries(query).every(([key, condition]: any) => {
    if (key === '$or') return condition.some((q: any) => matches(record, q));
    const value = record[key];
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      return Object.entries(condition).every(([operator, expected]: any) => {
        if (operator === '$exists') return (value !== undefined) === expected;
        if (operator === '$ne') return String(value) !== String(expected);
        if (operator === '$lt') return value < expected;
        if (operator === '$lte') return value <= expected;
        if (operator === '$gt') return value > expected;
        if (operator === '$gte') return value >= expected;
        return false;
      });
    }
    return String(value) === String(condition);
  });
}
function result(value: any): any {
  const promise: any = Promise.resolve(value ? { ...value } : value);
  promise.sort = () => promise;
  promise.select = () => promise;
  promise.lean = () => promise;
  return promise;
}
const restores: Array<() => void> = [];
function patch(object: any, key: string, value: any) {
  const previous = object[key]; object[key] = value;
  restores.push(() => { object[key] = previous; });
}
function memoryModel(model: any) {
  const records = new Map<string, any>();
  const find = (query: any) => [...records.values()].find(r => matches(r, query));
  patch(model, 'findOne', (query: any) => result(find(query)));
  patch(model, 'exists', async (query: any) => Boolean(find(query)));
  patch(model, 'findOneAndUpdate', async (query: any, update: any, options: any = {}) => {
    let record = find(query);
    if (!record && options.upsert) {
      record = { _id: query._id, ...update.$setOnInsert };
      records.set(String(record._id), record);
    }
    if (!record) return null;
    if (update.$set) Object.assign(record, update.$set);
    for (const [key, value] of Object.entries(update.$inc || {})) record[key] = (record[key] || 0) + Number(value);
    return { ...record };
  });
  patch(model, 'updateOne', async (query: any, update: any, options: any = {}) => {
    let record = find(query);
    if (!record && options.upsert) {
      record = { _id: query._id, ...update.$setOnInsert };
      records.set(String(record._id), record);
    }
    if (record && update.$set) Object.assign(record, update.$set);
    return { modifiedCount: record ? 1 : 0 };
  });
  patch(model, 'findOneAndDelete', async (query: any) => {
    const record = find(query);
    if (record) records.delete(String(record._id));
    return record ? { ...record } : null;
  });
  patch(model, 'deleteOne', async (query: any) => {
    const record = find(query);
    if (record) records.delete(String(record._id));
    return { deletedCount: record ? 1 : 0 };
  });
  patch(model, 'deleteMany', async (query: any) => {
    for (const record of records.values()) if (matches(record, query)) records.delete(String(record._id));
    return {};
  });
  return records;
}
function invoke(handler: any, body: any = {}, extras: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const res: any = { code: 200, status(code: number) { this.code = code; return this; },
      json(data: any) { resolve({ status: this.code, ...data }); return this; } };
    handler({ body, app: { get: () => undefined }, ...extras }, res, reject);
  });
}
let codes: Map<string, any>, proofs: Map<string, any>, revoked: Map<string, any>;
let sellerController: any, deliveryController: any, handlers: any, sessions: any, jwt: any, middleware: any;
const sent: any[] = [];
const statuses: Record<string, string> = {};
const versions: Record<string, number> = {};
const created: any[] = [];
let failCreate = false;
const accountId = '507f1f77bcf86cd799439011';
const originalEnv = { ...process.env };

before(async () => {
  process.env.JWT_SECRET = 'auth-flow-test-secret-no-live-access';
  process.env.SMS_INDIA_HUB_API_KEY = 'fake-api-key';
  process.env.USE_MOCK_OTP = 'false';
  process.env.TEST_PHONE = '9999999999';
  codes = memoryModel(Otp); proofs = memoryModel(SignupProof); revoked = memoryModel(RevokedToken);
  patch(axios, 'get', async (url: string, options: any) => {
    sent.push({ url, ...options });
    return { data: { ErrorCode: '000', ErrorMessage: 'Success', JobId: 'test-job' } };
  });
  for (const [role, model] of Object.entries({ Seller, Delivery, Customer, Admin })) {
    patch(model, 'findById', () => result(statuses[role] ? { _id: accountId, status: statuses[role], role: 'Admin', authVersion: versions[role] || 0 } : null));
  }
  for (const [role, model] of Object.entries({ Seller, Delivery })) {
    patch(model, 'exists', async () => false);
    patch(model, 'findOne', () => result(null));
    patch(model, 'create', async (data: any) => {
      if (failCreate) throw new Error('Temporary database failure');
      const record = { ...data, _id: accountId }; created.push({ role, ...record }); return record;
    });
  }
  patch(Admin, 'find', () => result([]));
  patch(Notification, 'create', async () => ({ _id: accountId }));
  sellerController = await import('../modules/seller/controllers/sellerAuthController');
  deliveryController = await import('../modules/delivery/controllers/deliveryAuthController');
  handlers = (await import('../modules/auth/controllers/onboardingController')).signupOtpHandlers;
  sessions = await import('../services/authSessionService');
  jwt = await import('../services/jwtService');
  middleware = await import('../middleware/auth');
});
beforeEach(() => {
  codes.clear(); proofs.clear(); revoked.clear(); sent.length = 0; created.length = 0; failCreate = false;
  for (const role of ['Customer', 'Delivery', 'Admin']) statuses[role] = 'Active';
  statuses.Seller = 'Approved';
  for (const role of ['Customer', 'Seller', 'Delivery', 'Admin']) versions[role] = 0;
});
after(() => {
  restores.reverse().forEach(restore => restore());
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});

for (const role of ['Seller', 'Delivery'] as const) {
  test(`${role}: new applicant verifies before account creation and can register once`, async () => {
    const flow = handlers(role), mobile = '9876543210';
    const initiated = await invoke(flow.send, { mobile });
    assert.equal(initiated.success, true); assert.equal(created.length, 0); assert.equal(sent.length, 1);
    const code = [...codes.values()][0];
    assert.equal(code.purpose, 'signup');
    assert.equal(await verifyOTP(mobile, code.otp, role), false, 'signup code must not authenticate a login');
    const verified = await invoke(flow.verify, { mobile, otp: code.otp, sessionId: initiated.sessionId });
    const registrationToken = verified.data.registrationToken;
    assert.match(registrationToken, /^[a-f0-9]{64}$/);
    const body = role === 'Seller'
      ? { mobile, registrationToken, sellerName: 'Shop owner', email: 'test@example.test', storeName: 'Shop', category: 'Grocery' }
      : { mobile, registrationToken, name: 'Courier', email: 'test@example.test', password: 'test-password', address: 'Street', city: 'Mumbai',
          drivingLicense: 'https://example.test/licence.pdf', nationalIdentityCard: 'https://example.test/id.pdf' };
    const controller = role === 'Seller' ? sellerController.register : deliveryController.register;
    const registered = await invoke(controller, body);
    assert.equal(registered.status, 201); assert.equal(created.length, 1);
    assert.equal(created[0].status, role === 'Seller' ? 'Pending' : 'Inactive');
    if (role === 'Seller') assert.ok(registered.data.token);
    else {
      assert.equal(registered.data.token, undefined, 'approval is required before courier login');
      assert.equal(created[0].drivingLicense, 'https://example.test/licence.pdf');
      assert.equal(created[0].nationalIdentityCard, 'https://example.test/id.pdf');
    }
    await assert.rejects(invoke(controller, body), /Verify your mobile/);
  });
  test(`${role}: direct registration without phone proof cannot reserve an account`, async () => {
    const body = role === 'Seller'
      ? { mobile: '9876543210', sellerName: 'Owner', email: 'test@example.test', storeName: 'Shop', category: 'Grocery' }
      : { mobile: '9876543210', name: 'Courier', email: 'test@example.test', password: 'test-password' };
    await assert.rejects(invoke(role === 'Seller' ? sellerController.register : deliveryController.register, body), /Verify your mobile/);
    assert.equal(created.length, 0);
  });
}

test('signup grants are role/phone bound, expire, and survive a failed account write', async () => {
  const mobile = '9876543210';
  const token = await issueSignupProof(mobile, 'Seller');
  assert.equal(await consumeSignupProof('9876543211', 'Seller', token), false);
  assert.equal(await consumeSignupProof(mobile, 'Delivery', token), false);
  await assert.rejects(createVerifiedSignup(mobile, 'Seller', token, async () => { throw new Error('write failed'); }), /write failed/);
  assert.equal(await consumeSignupProof(mobile, 'Seller', token), true);
  const expired = await issueSignupProof(mobile, 'Seller');
  proofs.get(`Seller:${mobile}`).expiresAt = new Date(0);
  assert.equal(await consumeSignupProof(mobile, 'Seller', expired), false);
});

test('OTP: one successful consumption under concurrent verification', async () => {
  const initiated = await sendSmsOtp('9876543210', 'Customer');
  const code = [...codes.values()][0].otp;
  const results = await Promise.all(Array.from({ length: 10 }, () => verifySmsOtp(initiated.sessionId!, code, '9876543210', 'Customer')));
  assert.equal(results.filter(Boolean).length, 1);
});
test('OTP: concurrent resends leave one challenge and reject an old session id', async () => {
  const old = await sendSmsOtp('9876543210', 'Customer');
  await Promise.all([sendSmsOtp('9876543210', 'Customer'), sendSmsOtp('9876543210', 'Customer')]);
  assert.equal(codes.size, 1);
  const current = [...codes.values()][0];
  assert.equal(await verifySmsOtp(old.sessionId!, current.otp, '9876543210', 'Customer'), false);
  assert.equal(await verifySmsOtp(current.challengeId, current.otp, '9876543210', 'Customer'), true);
});
test('OTP: concurrent wrong attempts exhaust the cap without allowing a later correct guess', async () => {
  const initiated = await sendSmsOtp('9876543210', 'Customer');
  const code = [...codes.values()][0].otp, wrong = code === '0000' ? '1111' : '0000';
  await Promise.all(Array.from({ length: 8 }, () => verifySmsOtp(initiated.sessionId!, wrong, '9876543210', 'Customer')));
  assert.equal(await verifySmsOtp(initiated.sessionId!, code, '9876543210', 'Customer'), false);
});
test('OTP: expiry, wrong role, wrong phone/session, and signup challenge substitution are rejected', async () => {
  const initiated = await sendSmsOtp('9876543210', 'Delivery');
  const code = [...codes.values()][0];
  assert.equal(await verifySmsOtp(initiated.sessionId!, code.otp, '9876543210', 'Customer'), false);
  assert.equal(await verifySignupOtp('9876543210', code.otp, 'Delivery', initiated.sessionId!), false);
  assert.equal(await verifySmsOtp('DB_VERIFIED_9876543211', code.otp, '9876543210', 'Delivery'), false);
  code.expiresAt = new Date(0);
  assert.equal(await verifySmsOtp(initiated.sessionId!, code.otp, '9876543210', 'Delivery'), false);
});
test('OTP: legacy login records remain usable once; explicit fixed test behavior is preserved', async () => {
  codes.set('legacy', { _id: 'legacy', mobile: '9876543210', userType: 'Seller', otp: '5829', expiresAt: new Date(Date.now() + 60000) });
  assert.equal(await verifyOTP('9876543210', '5829', 'Seller'), true);
  for (const role of ['Customer', 'Seller', 'Delivery'] as const) assert.equal(await verifyOTP('9999999999', '1234', role), true);
});

test('sessions: existing tokens work, logout revokes only that token, and new logins get distinct tokens', async () => {
  const first = jwt.generateToken(accountId, 'Customer'), second = jwt.generateToken(accountId, 'Customer');
  assert.notEqual(first, second);
  assert.equal((await sessions.validateSession(first)).userType, 'Customer');
  await sessions.revokeSession(first);
  await assert.rejects(sessions.validateSession(first), /logged out/);
  assert.equal((await sessions.validateSession(second)).userType, 'Customer');
});
test('sessions: suspended/deleted accounts are rejected on existing JWTs for all roles', async () => {
  for (const role of ['Customer', 'Seller', 'Delivery'] as const) {
    const token = jwt.generateToken(accountId, role);
    statuses[role] = role === 'Seller' ? 'Rejected' : 'Inactive';
    await assert.rejects(sessions.validateSession(token), /not active/);
    delete statuses[role];
    await assert.rejects(sessions.validateSession(token), /no longer exists/);
  }
});
test('sessions: disabling permanently invalidates older tokens even after account reactivation', async () => {
  for (const role of ['Customer', 'Seller', 'Delivery'] as const) {
    const old = jwt.generateToken(accountId, role);
    versions[role] = 1;
    statuses[role] = role === 'Seller' ? 'Approved' : 'Active';
    await assert.rejects(sessions.validateSession(old), /invalidated/);
    const fresh = jwt.generateToken(accountId, role, undefined, 1);
    assert.equal((await sessions.validateSession(fresh)).userType, role);
  }
  const legacy = jsonwebtoken.sign({ userId: accountId, userType: 'Admin' }, process.env.JWT_SECRET!, { expiresIn: '1h' });
  assert.equal((await sessions.validateSession(legacy)).userType, 'Admin', 'pre-upgrade JWTs remain compatible');
});

test('account models: save/query status changes advance session versions, ordinary profile edits do not', async () => {
  const insert = (Seller.collection as any).insertOne, update = (Seller.collection as any).updateOne;
  const findUpdate = (Seller.collection as any).findOneAndUpdate;
  let written: any;
  (Seller.collection as any).insertOne = async () => ({ acknowledged: true, insertedId: accountId });
  (Seller.collection as any).updateOne = async () => ({ acknowledged: true, modifiedCount: 1 });
  (Seller.collection as any).findOneAndUpdate = async (_filter: any, change: any) => {
    written = change; return null;
  };
  try {
    const seller = new Seller({ sellerName: 'Owner', mobile: '9876543210', email: 'owner@example.test', storeName: 'Shop', category: 'Grocery', status: 'Approved' });
    await seller.save();
    assert.equal((seller as any).authVersion, 0);
    seller.status = 'Rejected'; await seller.save();
    assert.equal((seller as any).authVersion, 1);
    seller.status = 'Approved'; await seller.save();
    assert.equal((seller as any).authVersion, 1);
    seller.sellerName = 'Updated owner'; await seller.save();
    assert.equal((seller as any).authVersion, 1);
    // Call through a query rather than the patched model method from other tests.
    await Seller.where({ _id: accountId }).findOneAndUpdate({ status: 'Rejected' });
    assert.equal(written.$inc.authVersion, 1);
    await Seller.where({ _id: accountId }).findOneAndUpdate({ storeName: 'New name' });
    assert.equal(written.$inc, undefined);
  } finally {
    (Seller.collection as any).insertOne = insert;
    (Seller.collection as any).updateOne = update;
    (Seller.collection as any).findOneAndUpdate = findUpdate;
  }
});
test('sessions: pending seller can review profile, but cannot access dashboard or wallet', async () => {
  statuses.Seller = 'Pending';
  const token = jwt.generateToken(accountId, 'Seller');
  async function request(url: string) {
    let allowed = false, status = 200;
    await middleware.authenticate({ headers: { authorization: `Bearer ${token}` }, originalUrl: url },
      { status(value: number) { status = value; return this; }, json() {} }, () => { allowed = true; });
    return { allowed, status };
  }
  assert.deepEqual(await request('/api/v1/auth/seller/profile'), { allowed: true, status: 200 });
  for (const url of ['/api/v1/seller/dashboard/stats', '/api/v1/seller/wallet/withdraw']) {
    assert.deepEqual(await request(url), { allowed: false, status: 403 });
  }
});
test('sessions: database outages surface as server failures, not invalid-login responses', async () => {
  const original = Customer.findById;
  (Customer as any).findById = () => { throw new Error('database unavailable'); };
  try {
    let failure: any;
    await middleware.authenticate({ headers: { authorization: `Bearer ${jwt.generateToken(accountId, 'Customer')}` } },
      { status() { throw new Error('should not report a credential error'); } }, (error: any) => { failure = error; });
    assert.match(failure.message, /database unavailable/);
  } finally { Customer.findById = original; }
});
