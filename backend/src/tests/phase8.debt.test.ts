/**
 * PHASE 8 — technical debt.
 * Guards against the removed dead code creeping back.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const be = (rel: string) => path.join(process.cwd(), rel);
const fe = (rel: string) => path.join(process.cwd(), "..", "frontend", rel);
const strip = (t: string) => t.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

/** Walk a tree and return every .ts/.tsx file. */
function sources(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "dist") continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(e.name)) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

test("TECH: mock data files are gone and nothing imports them", () => {
  for (const p of [
    "src/modules/admin/data/mockData.ts",
    "src/modules/seller/data/mockData.ts",
    "src/modules/seller/data/orderMockData.ts",
    "src/modules/seller/data/productMockData.ts",
    "src/modules/seller/data/categoryMockData.ts",
  ]) {
    assert.ok(!fs.existsSync(fe(p)), `${p} still exists`);
  }

  for (const f of sources(fe("src"))) {
    const src = strip(fs.readFileSync(f, "utf8"));
    assert.ok(
      !/from ["'][^"']*(?:orderMockData|productMockData|categoryMockData|\/data\/mockData)["']/.test(src),
      `${path.relative(fe("src"), f)} still imports mock data`,
    );
  }
});

test("TECH: dead models are gone, live ones are untouched", () => {
  assert.ok(!fs.existsSync(be("src/models/DeliveryArea.ts")), "DeliveryArea still exists");
  assert.ok(!fs.existsSync(be("src/models/index.ts")), "the dead models barrel still exists");

  // Refund and Inventory are in active use and must remain.
  assert.ok(fs.existsSync(be("src/models/Refund.ts")), "Refund was removed but is used by refundService");
  assert.ok(fs.existsSync(be("src/models/Inventory.ts")), "Inventory was removed but is used by adminProductController");
});

test("TECH: frontend service helpers no longer point at non-existent endpoints", () => {
  const deadEndpoints = [
    "/admin/cms/home-sections",
    "/admin/content/notifications",
    "/auth/admin/profile",
    "/customer/payments",
  ];
  for (const f of sources(fe("src"))) {
    const src = strip(fs.readFileSync(f, "utf8"));
    for (const ep of deadEndpoints) {
      assert.ok(!src.includes(ep), `${path.relative(fe("src"), f)} still calls ${ep}`);
    }
  }
});

test("TECH: there is one withdrawal route, not two", () => {
  const dr = strip(fs.readFileSync(be("src/routes/deliveryRoutes.ts"), "utf8"));
  assert.ok(!/router\.post\("\/withdraw"/.test(dr),
    "the duplicate /delivery/withdraw route is back");
  const dwr = strip(fs.readFileSync(be("src/routes/deliveryWalletRoutes.ts"), "utf8"));
  assert.match(dwr, /router\.post\("\/withdraw"/, "the real withdrawal route is missing");
});

test("TECH: unused dependencies and dead config are gone", () => {
  const pkg = JSON.parse(fs.readFileSync(be("package.json"), "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const d of ["node-cron", "@types/node-cron", "csv-parser"]) {
    assert.ok(!deps[d], `${d} is declared but unused`);
  }

  const env = fs.readFileSync(be(".env"), "utf8");
  for (const k of ["JWT_REFRESH_SECRET", "JWT_REFRESH_EXPIRES_IN", "REACT_APP_GOOGLE_MAPS_API_KEY"]) {
    assert.ok(!env.includes(k + "="), `${k} is dead config still present in .env`);
  }
  // NODE_ENV must be set explicitly.
  assert.match(env, /^NODE_ENV=/m, "NODE_ENV is not pinned");
});

test("TECH: ad-hoc scripts that mutated the live database are gone", () => {
  for (const s of [
    "src/scripts/test-auth.ts",
    "src/scripts/test-frontend-backend-auth.ts",
    "src/scripts/test-vendor-approval.ts",
    "src/scripts/testAuth.ts",
    "src/scripts/testOtp.ts",
  ]) {
    assert.ok(!fs.existsSync(be(s)), `${s} still exists — it creates Super Admins in whatever DB is configured`);
  }

  const pkg = JSON.parse(fs.readFileSync(be("package.json"), "utf8"));
  for (const s of ["test:auth", "test:integration", "test:vendor-approval"]) {
    assert.ok(!pkg.scripts[s], `npm script "${s}" still points at a removed script`);
  }
  // The real suite is wired up.
  assert.match(pkg.scripts.test, /src\/tests/, "npm test does not run the test suite");
});

test("TECH: the five admin order pages share one implementation", () => {
  const shared = fe("src/modules/admin/pages/AdminOrdersByStatus.tsx");
  assert.ok(fs.existsSync(shared), "the shared order list component is missing");

  const wrappers = [
    "AdminReceivedOrders",
    "AdminProcessedOrders",
    "AdminOutForDeliveryOrders",
    "AdminDeliveredOrders",
    "AdminCancelledOrders",
  ];
  for (const w of wrappers) {
    const p = fe(`src/modules/admin/pages/${w}.tsx`);
    assert.ok(fs.existsSync(p), `${w} is missing`);
    const src = fs.readFileSync(p, "utf8");
    assert.ok(src.split("\n").length < 12, `${w} is still a full copy (${src.split("\n").length} lines)`);
    assert.match(src, /AdminOrdersByStatus/, `${w} does not delegate to the shared component`);
  }

  // Each wrapper must pass a distinct status.
  const statuses = wrappers.map((w) => {
    const m = fs.readFileSync(fe(`src/modules/admin/pages/${w}.tsx`), "utf8").match(/status="([^"]+)"/);
    return m?.[1];
  });
  assert.equal(new Set(statuses).size, wrappers.length, "wrappers do not pass distinct statuses");
});

test("TECH: no unresolved AI deliberation comments remain in source", () => {
  // Deliberation left behind as guidance. Matched in comments, which is where
  // it lived; a comment that merely *describes* the removed placeholder (e.g.
  // "this used to be an alert(...)") is legitimate documentation, so the mock
  // is matched by its executable form instead.
  const markers = [
    "I am NOT touching",
    "Ah, this chunk",
    "previous developer's logic",
    "I should probably do it right",
    'alert("Add cash collection functionality',
  ];
  for (const root of [be("src"), fe("src")]) {
    for (const f of sources(root)) {
      // The test suite quotes these markers in its assertion messages.
      if (/[\\/]tests[\\/]/.test(f) || /\.test\.tsx?$/.test(f)) continue;
      const src = fs.readFileSync(f, "utf8");
      for (const m of markers) {
        assert.ok(!src.includes(m), `${f} still contains: "${m}"`);
      }
    }
  }
});

test("TECH: the Cloudinary namespace belongs to this product", () => {
  const c = fs.readFileSync(be("src/config/cloudinary.ts"), "utf8");
  assert.ok(!c.includes("dhakadsnazzy"), "another project's namespace is still in use");
});
