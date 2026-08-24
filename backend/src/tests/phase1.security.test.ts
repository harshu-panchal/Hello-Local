/**
 * PHASE 1 security tests — authentication & authorization.
 * No database connection; every assertion exercises real production code.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_for_harness";

const srcPath = (rel: string) => path.join(process.cwd(), "src", rel);
const read = (rel: string) => fs.readFileSync(srcPath(rel), "utf8");
/** Source with comments removed, so explanatory notes cannot satisfy assertions. */
const code = (rel: string) =>
  read(rel).replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

// ===========================================================================
// C-05 / H-33 — RBAC is enforced, not merely defined
// ===========================================================================
test("C-05: system-user routes require Super Admin", () => {
  const routes = code("routes/adminRoutes.ts");

  assert.match(routes, /authorize\(["']Super Admin["']\)/,
    "authorize('Super Admin') must be mounted");

  // Every system-user route must carry the guard.
  const lines = routes.split("\n").filter((l) => l.includes('"/system-users'));
  assert.ok(lines.length >= 5, `expected system-user routes, found ${lines.length}`);
  for (const l of lines) {
    assert.match(l, /superAdminOnly/, `unguarded system-user route: ${l.trim()}`);
  }
});

test("C-05: authorize() rejects a plain Admin and admits a Super Admin", async () => {
  const { authorize } = await import("../middleware/auth");
  const mw = authorize("Super Admin");

  const call = (user: any) => {
    let status = 0; let body: any = null; let nexted = false;
    const res: any = {
      status(c: number) { status = c; return this; },
      json(b: any) { body = b; return this; },
    };
    mw({ user } as any, res, () => { nexted = true; });
    return { status, body, nexted };
  };

  // Plain Admin — this is the privilege-escalation path. (#C-05)
  const admin = call({ userId: "1", userType: "Admin", role: "Admin" });
  assert.equal(admin.nexted, false, "a plain Admin must not pass");
  assert.equal(admin.status, 403);

  // Unauthenticated.
  const anon = call(undefined);
  assert.equal(anon.nexted, false);
  assert.equal(anon.status, 401);

  // No role claim at all.
  const noRole = call({ userId: "1", userType: "Admin" });
  assert.equal(noRole.nexted, false);
  assert.equal(noRole.status, 403);

  // POSITIVE: a real Super Admin passes.
  const su = call({ userId: "1", userType: "Admin", role: "Super Admin" });
  assert.equal(su.nexted, true, "a Super Admin must pass");
});

test("C-05: self-promotion, peer password reset and last-Super-Admin demotion are blocked", () => {
  const c = code("modules/admin/controllers/adminSystemUserController.ts");
  assert.match(c, /You cannot change your own role/i, "self-role-change guard missing");
  assert.match(c, /cannot set another admin's password/i, "peer password guard missing");
  assert.match(c, /Cannot demote the last Super Admin/i, "last-Super-Admin guard missing");
  assert.match(c, /isSelf/, "self-identification missing");
});

// ===========================================================================
// H-13 — tax writes are Admin-only
// ===========================================================================
test("H-13: tax mutations require Admin", () => {
  const c = code("routes/taxRoutes.ts");
  const post = c.split("\n").find((l) => l.includes("router.post"));
  const patch = c.split("\n").find((l) => l.includes("router.patch"));
  assert.ok(post && /requireUserType\('Admin'\)/.test(post), `POST /taxes unguarded: ${post}`);
  assert.ok(patch && /requireUserType\('Admin'\)/.test(patch), `PATCH status unguarded: ${patch}`);
  // Reads stay available to sellers.
  const active = c.split("\n").find((l) => l.includes("'/active'"));
  assert.ok(active && /Seller/.test(active), "sellers must still read the tax list");
});

// ===========================================================================
// H-15 — courier order detail is scoped to the assignee
// ===========================================================================
test("H-15: getOrderDetails is scoped to the assigned courier", () => {
  const c = code("modules/delivery/controllers/deliveryOrderController.ts");
  const fn = c.slice(c.indexOf("export const getOrderDetails"), c.indexOf("export const updateOrderStatus"));
  assert.match(fn, /deliveryBoy:\s*deliveryId/, "order lookup is not scoped to the courier");
  assert.ok(!/Order\.findById\(id\)\.populate/.test(fn),
    "unscoped Order.findById still present");
});

// ===========================================================================
// H-16 — OTP brute force
// ===========================================================================
test("H-16: login OTP has an attempt cap and does not log secrets", () => {
  const c = code("services/otpService.ts");
  assert.match(c, /MAX_OTP_ATTEMPTS/, "no attempt cap");
  assert.match(c, /\$inc:\s*\{\s*attempts:\s*1\s*\}/, "failed attempts are not counted");
  assert.match(c, /timingSafeEqual/, "OTP comparison is not timing-safe");
  assert.match(c, /crypto\.randomInt/, "OTP generation still uses Math.random");
  // The lookup must not key on the submitted OTP, or failures cannot be counted.
  assert.ok(!/findOne\(\{\s*\n?\s*mobile: normalizedMobile,\s*\n?\s*userType,\s*\n?\s*otp:/.test(c),
    "OTP lookup still matches on the submitted value");
  // Secrets must not reach the log.
  assert.ok(!/availableRecords/.test(c), "outstanding OTPs are still logged");
});

test("H-16: delivery OTP is attempt-capped and rotated after use", () => {
  const c = code("services/deliveryOtpService.ts");
  assert.match(c, /MAX_DELIVERY_OTP_ATTEMPTS/, "no delivery OTP attempt cap");
  assert.match(c, /deliveryOtpAttempts/, "attempts are not tracked");
  assert.match(c, /Customer\.updateOne/, "customer OTP is not rotated after delivery");
  assert.match(c, /crypto\.randomInt/, "rotation does not use a secure generator");
});

// ===========================================================================
// H-17 — account status is enforced at login on all four portals
// ===========================================================================
test("H-17: every portal blocks non-active accounts at login", () => {
  const cases: Array<[string, string, RegExp]> = [
    ["admin", "modules/admin/controllers/adminAuthController.ts", /admin\.status !== "Active"/],
    ["seller", "modules/seller/controllers/sellerAuthController.ts", /seller\.status === "Rejected"/],
    ["customer", "modules/customer/controllers/customerAuthController.ts", /customer\.status !== "Active"/],
    ["delivery", "modules/delivery/controllers/deliveryAuthController.ts", /delivery\.status !== "Active"/],
  ];
  for (const [portal, file, re] of cases) {
    const c = code(file);
    assert.match(c, re, `${portal} login does not check account status`);
    // The check must precede token issuance.
    const gate = c.search(re);
    const issue = c.indexOf("generateToken(");
    assert.ok(gate >= 0 && gate < issue,
      `${portal}: status check must run before generateToken`);
  }
});

test("H-17: Admin model has a status field", () => {
  const c = code("models/Admin.ts");
  assert.match(c, /status:\s*\{[\s\S]{0,120}enum:\s*\['Active',\s*'Inactive'\]/,
    "Admin.status enum missing");
});

// ===========================================================================
// H-23 — seller approval gate covers every product write path
// ===========================================================================
test("H-23: all seller product mutations are behind the approval gate", () => {
  const c = code("modules/seller/controllers/productController.ts");
  const guarded = [
    "createProduct",
    "updateProduct",
    "deleteProduct",
    "updateProductStatus",
    "bulkUpdateStock",
  ];
  const exported = [...c.matchAll(/export const (\w+) = asyncHandler/g)].map((m) => m[1]);
  for (const fn of guarded) {
    assert.ok(exported.includes(fn), `${fn} not found`);
    const start = c.indexOf(`export const ${fn} =`);
    const nextIdx = exported
      .map((e) => c.indexOf(`export const ${e} =`))
      .filter((i) => i > start)
      .sort((a, b) => a - b)[0];
    const body = c.slice(start, nextIdx === undefined ? c.length : nextIdx);
    assert.match(body, /ensureSellerApproved/,
      `${fn} is not behind ensureSellerApproved`);
  }
});

// ===========================================================================
// M-03 / M-05 — account enumeration
// ===========================================================================
test("M-03: OTP dispatch does not disclose whether an account exists", () => {
  for (const file of [
    "modules/admin/controllers/adminAuthController.ts",
    "modules/seller/controllers/sellerAuthController.ts",
    "modules/delivery/controllers/deliveryAuthController.ts",
  ]) {
    const c = code(file);
    assert.match(c, /If an account exists for this number/,
      `${file} still reveals account existence`);
    assert.ok(!/not found with this mobile number/i.test(c),
      `${file} still returns a distinguishing "not found" message`);
  }
});

test("M-05: existence lookups return a bare boolean and are rate limited", () => {
  // Public admin lookup is gone entirely.
  const adminRoutes = code("routes/adminAuthRoutes.ts");
  assert.ok(!/check-existence/.test(adminRoutes),
    "public admin check-existence route still mounted");

  // Seller/delivery lookups are rate limited.
  for (const f of ["routes/sellerAuthRoutes.ts", "routes/deliveryAuthRoutes.ts"]) {
    const c = code(f);
    for (const line of c.split("\n").filter((l) => l.includes("check-exist"))) {
      assert.match(line, /loginRateLimiter/, `unlimited existence lookup: ${line.trim()}`);
    }
  }

  // No field echo in the responses.
  for (const f of [
    "modules/seller/controllers/sellerAuthController.ts",
    "modules/delivery/controllers/deliveryAuthController.ts",
  ]) {
    const c = code(f);
    assert.ok(!/conflictField/.test(c), `${f} still echoes which field matched`);
  }
});

// ===========================================================================
// H-27 — portal sessions do not collide
// ===========================================================================
test("H-27: no portal writes the shared legacy keys any more", () => {
  const feRoot = path.join(process.cwd(), "..", "frontend", "src");
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx)$/.test(e.name)) continue;
      if (full.endsWith(`session.ts`)) continue; // the module that owns migration
      const src = fs.readFileSync(full, "utf8").replace(/\/\/.*$/gm, "");
      if (/localStorage\.(setItem|getItem|removeItem)\(\s*["'](authToken|userData)["']/.test(src)) {
        offenders.push(path.relative(feRoot, full));
      }
    }
  };
  walk(feRoot);
  assert.deepEqual(offenders, [], `these files still use the shared session keys: ${offenders.join(", ")}`);
});

test("H-27: session module scopes keys by portal and migrates legacy sessions", () => {
  const p = path.join(process.cwd(), "..", "frontend", "src", "services", "api", "session.ts");
  const c = fs.readFileSync(p, "utf8");
  assert.match(c, /hl\.\$\{portal\}\.token/, "token key is not portal-scoped");
  assert.match(c, /hl\.\$\{portal\}\.user/, "user key is not portal-scoped");
  assert.match(c, /migrateLegacySession/, "no migration for existing sessions");
  assert.match(c, /currentPortal/, "portal is not derived from the URL");
});

// ===========================================================================
// H-26 — no debug push on login (fixed alongside the session work)
// ===========================================================================
test("H-26: login no longer fires a test push notification", () => {
  const p = path.join(process.cwd(), "..", "frontend", "src", "context", "AuthContext.tsx");
  const c = fs.readFileSync(p, "utf8").replace(/\/\/.*$/gm, "");
  assert.ok(!/fcm-tokens\/test/.test(c), "login still calls the test-notification endpoint");
});
