/**
 * FINAL REMEDIATION AUDIT.
 *
 * Sweeps the CURRENT repository for every vulnerable pattern the original audit
 * identified, independently of the per-phase tests. Anything that reappears
 * anywhere — including in code written after remediation — fails here.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const BE = path.join(process.cwd(), "src");
const FE = path.join(process.cwd(), "..", "frontend", "src");

function sources(root: string, opts: { skipTests?: boolean } = {}): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (["node_modules", "dist", "assets"].includes(e.name)) continue;
        if (opts.skipTests && e.name === "tests") continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(e.name)) {
        if (opts.skipTests && /\.test\.tsx?$/.test(e.name)) continue;
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

const stripComments = (t: string) =>
  t.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

/** Scan every source file's executable code for a pattern. */
function scan(roots: string[], pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const root of roots) {
    for (const f of sources(root, { skipTests: true })) {
      const code = stripComments(fs.readFileSync(f, "utf8"));
      if (pattern.test(code)) {
        hits.push(path.relative(path.join(process.cwd(), ".."), f));
      }
    }
  }
  return hits;
}

// ===========================================================================
test("FINAL: no authentication backdoors anywhere", () => {
  assert.deepEqual(scan([BE, FE], /9111966732/), [], "hardcoded backdoor identity");
  assert.deepEqual(scan([BE, FE], /\bisBypass\b/), [], "auth bypass flag");
  assert.deepEqual(scan([BE], /bypassAllowed/), [], "payment bypass flag");
  assert.deepEqual(
    scan([BE], /otp\s*===\s*['"]9999['"]|['"]9999['"]\s*===\s*otp/),
    [],
    "hardcoded master OTP",
  );
  assert.deepEqual(
    scan([BE], /startsWith\(['"]mock_['"]\)/),
    [],
    "mock payment-id bypass",
  );
});

test("FINAL: no client-controlled financial amount can create money", () => {
  // The settlement amount must never come from the request body.
  const settle = stripComments(
    fs.readFileSync(path.join(BE, "modules/delivery/controllers/deliveryWalletController.ts"), "utf8"),
  );
  const verify = settle.slice(settle.indexOf("export const verifyAdminPayout"));
  assert.ok(!/req\.body\.amount/.test(verify), "courier payout still trusts a client amount");
  assert.match(verify, /assertion\.amount/, "settlement amount is not gateway-derived");

  // Checkout must not take fees from the client.
  const checkout = stripComments(
    fs.readFileSync(path.join(BE, "modules/customer/controllers/customerOrderController.ts"), "utf8"),
  );
  assert.ok(!/fees\?\.(deliveryFee|platformFee)/.test(checkout), "checkout trusts client fees");
});

test("FINAL: payment ownership and binding are enforced", () => {
  const routes = stripComments(fs.readFileSync(path.join(BE, "routes/paymentRoutes.ts"), "utf8"));
  for (const ep of ["'/create-order'", "'/verify'"]) {
    const i = routes.indexOf(ep);
    assert.ok(i > 0, `${ep} missing`);
    const block = routes.slice(i, i + 1500);
    assert.match(block, /authenticate/, `${ep} is unauthenticated`);
    assert.match(block, /loadOwnedPayable\(/, `${ep} does not check ownership`);
  }
});

test("FINAL: no missing ownership checks on per-resource reads", () => {
  // Courier order reads must be scoped.
  const d = stripComments(
    fs.readFileSync(path.join(BE, "modules/delivery/controllers/deliveryOrderController.ts"), "utf8"),
  );
  const detail = d.slice(d.indexOf("export const getOrderDetails"), d.indexOf("export const updateOrderStatus"));
  assert.match(detail, /deliveryBoy: deliveryId/, "courier order detail is unscoped (IDOR)");

  // Customer order reads must be scoped.
  const c = stripComments(
    fs.readFileSync(path.join(BE, "modules/customer/controllers/customerOrderController.ts"), "utf8"),
  );
  assert.match(c, /Order\.findOne\(\{ _id: id, customer: userId \}\)/, "customer order read is unscoped");
});

test("FINAL: sockets are authenticated and authorised", () => {
  const c = stripComments(fs.readFileSync(path.join(BE, "socket/socketService.ts"), "utf8"));
  assert.ok(!/if \(!token\) \{\s*return next\(\);/.test(c), "anonymous sockets admitted");
  assert.match(c, /Authentication required/, "handshake does not reject tokenless clients");
  assert.ok(!/String\(data\.deliveryBoyId\)/.test(c), "client identity still trusted");
});

test("FINAL: no invalid order state transition is reachable", async () => {
  const { validateTransition, ORDER_STATUSES, TERMINAL_STATUSES } =
    await import("../services/orderStatusService");

  // Exhaustive: nothing may leave a terminal state except Delivered -> Returned.
  for (const from of TERMINAL_STATUSES) {
    for (const to of ORDER_STATUSES) {
      for (const actor of ["customer", "seller", "delivery", "admin", "system"] as const) {
        const r = validateTransition(from, to, actor);
        assert.equal(r.valid, false, `${from} -> ${to} as ${actor} must be refused`);
      }
    }
  }

  // No actor except system/admin may reach Delivered.
  for (const from of ORDER_STATUSES) {
    for (const actor of ["customer", "seller", "delivery"] as const) {
      const r = validateTransition(from, "Delivered", actor);
      assert.equal(r.valid, false, `${actor} reached Delivered from ${from}`);
    }
  }
});

test("FINAL: inventory cannot leak or go negative", () => {
  const s = stripComments(fs.readFileSync(path.join(BE, "services/stockService.ts"), "utf8"));
  assert.match(s, /\$elemMatch/, "variation decrement is not element-scoped");
  assert.match(s, /\$gte: qty/, "decrement is not guarded by availability");
  assert.match(s, /taken\.reverse\(\)/, "partial reservations are not compensated");

  // No controller may decrement stock outside the service.
  const offenders = scan(
    [path.join(BE, "modules")],
    /\$inc:\s*\{[^}]*\bstock:\s*-/,
  );
  assert.deepEqual(offenders, [], "stock is decremented outside stockService");
});

test("FINAL: uploads are gated and type-verified", () => {
  const c = stripComments(fs.readFileSync(path.join(BE, "routes/uploadRoutes.ts"), "utf8"));
  assert.match(c, /assertRealFileType\(/, "uploads trust the declared MIME type");
  assert.match(c, /onboardingUploadLimiter/, "public uploads are unlimited");
  assert.match(c, /ALLOWED_FOLDERS/, "the upload folder is client-controlled");
  const del = c.slice(c.indexOf("router.delete("));
  assert.match(del, /You can only delete images attached to your own listings/,
    "asset deletion has no ownership check");
});

test("FINAL: no unbounded query reaches the database", () => {
  const s = stripComments(fs.readFileSync(path.join(BE, "server.ts"), "utf8"));
  assert.match(s, /clampPagination/, "pagination is not clamped globally");
  assert.match(s, /generalRateLimiter/, "there is no general rate limit");
});

test("FINAL: no secret is hardcoded in source", () => {
  const patterns: Array<[string, RegExp]> = [
    ["mongodb connection string", /mongodb(\+srv)?:\/\/[^"'\s]*:[^"'\s]*@/],
    ["razorpay live key", /rzp_live_[A-Za-z0-9]+/],
    ["private key block", /-----BEGIN (RSA )?PRIVATE KEY-----/],
    ["hardcoded jwt secret", /JWT_SECRET\s*=\s*["'][^"']{8,}["']/],
  ];
  for (const [label, re] of patterns) {
    assert.deepEqual(scan([BE, FE], re), [], `hardcoded ${label}`);
  }
});

test("FINAL: no frontend service calls a route that does not exist", () => {
  // Collect every literal API path the frontend requests.
  const called = new Set<string>();
  for (const f of sources(FE, { skipTests: true })) {
    const code = stripComments(fs.readFileSync(f, "utf8"));
    for (const m of code.matchAll(/api\.(?:get|post|put|patch|delete)\s*(?:<[^>]*>)?\s*\(\s*[`'"]([^`'"$]+)/g)) {
      called.add(m[1].split("?")[0].replace(/\/$/, ""));
    }
  }

  // Collect every path fragment the backend mounts.
  let mounted = "";
  for (const f of sources(path.join(BE, "routes"))) {
    mounted += fs.readFileSync(f, "utf8");
  }
  for (const f of sources(path.join(BE, "modules"))) {
    if (f.includes("routes")) mounted += fs.readFileSync(f, "utf8");
  }

  const unmatched: string[] = [];
  for (const p of called) {
    const segments = p.split("/").filter(Boolean);
    // Check the most specific static segment appears somewhere in the routers.
    const distinctive = segments.filter((s) => !s.startsWith("$")).slice(-2).join("/");
    const needle = segments[segments.length - 1];
    if (!needle) continue;
    if (!mounted.includes(needle) && !mounted.includes(distinctive)) {
      unmatched.push(p);
    }
  }

  assert.deepEqual(unmatched, [], `frontend calls unmounted endpoints: ${unmatched.join(", ")}`);
});

test("FINAL: financial logic is not duplicated", () => {
  // Exactly one wallet debit implementation.
  const debitImpls = scan([BE], /export const debitWallet\s*=/);
  assert.equal(debitImpls.length, 1, `debitWallet is implemented ${debitImpls.length} times`);

  // Exactly one COD settlement implementation.
  const settleImpls = scan([BE], /export async function settleCourierCodDebt/);
  assert.equal(settleImpls.length, 1, `COD settlement implemented ${settleImpls.length} times`);

  // Exactly one withdrawal creation path.
  const wdr = scan([BE], /WithdrawRequest\.create\(/);
  assert.equal(wdr.length, 1, `withdrawal requests created in ${wdr.length} places: ${wdr.join(", ")}`);

  // Exactly one order-status transition table.
  const tables = scan([BE], /const TRANSITIONS: Record<OrderStatus/);
  assert.equal(tables.length, 1, "more than one transition table");
});

test("FINAL: the audit's mock/placeholder markers are gone from shipped code", () => {
  const markers: Array<[string, RegExp]> = [
    ["placeholder push notification", /placeholder for actual push notification/i],
    ["unimplemented alert", /would be implemented here/],
    ["dummy razorpay order", /rzp_test_dummy_key/],
  ];
  for (const [label, re] of markers) {
    assert.deepEqual(scan([BE, FE], re), [], label);
  }
});
