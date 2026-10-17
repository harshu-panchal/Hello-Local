import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve("../frontend/src");
function load(file: string, dependencies: any = {}, globals: any = {}) {
  const module = { exports: {} as any };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, URL, Intl, Date, console,
    require(name: string) { if (!(name in dependencies)) throw new Error(`Unmocked dependency: ${name}`); return dependencies[name]; }, ...globals });
  return module.exports;
}
const jsx = { jsx: (type: any, props: any) => ({ type, props }), jsxs: (type: any, props: any) => ({ type, props }) };
const tick = () => new Promise(resolve => setImmediate(resolve));

// Executes React hooks and effect cleanup with a deterministic clock. No browser,
// API, credentials, network requests, or production data are involved.
function browser() {
  let now = Date.parse("2026-10-15T12:00:00Z");
  let timerId = 0;
  const timers = new Map<number, { at: number; callback: () => any; interval?: number }>();
  const eventHandlers = new Map<string, () => any>();
  const schedule = (callback: () => any, delay: number, interval?: number) => {
    const id = ++timerId; timers.set(id, { callback, at: now + delay, interval }); return id;
  };
  const globals: any = {
    Date: class extends Date { static now() { return now; } },
    setTimeout: (callback: () => any, delay: number) => schedule(callback, delay),
    clearTimeout: (id: number) => timers.delete(id),
    clearInterval: (id: number) => timers.delete(id),
    window: { setInterval: (callback: () => any, interval: number) => schedule(callback, interval, interval),
      addEventListener: (name: string, callback: () => any) => eventHandlers.set(name, callback),
      removeEventListener: (name: string) => eventHandlers.delete(name), open() {} },
  };
  globals.setInterval = globals.window.setInterval;
  return { globals, now: () => now, timers, eventHandlers,
    async advance(ms: number, render = async () => {}) {
      const end = now + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, timer] = next; now = timer.at;
        if (timer.interval) timer.at += timer.interval; else timers.delete(id);
        await timer.callback(); await render();
      }
      now = end; await render();
    },
  };
}
function hooks() {
  const slots: any[] = [];
  const effects: Array<() => void> = [];
  let index = 0;
  let dirty = true;
  let component: any;
  let props: any;
  let output: any;
  const changed = (a: any[], b?: any[]) => !b || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]));
  const react: any = {
    useState(initial: any) {
      const key = index++;
      if (!(key in slots)) slots[key] = typeof initial === "function" ? initial() : initial;
      return [slots[key], (input: any) => { const value = typeof input === "function" ? input(slots[key]) : input;
        if (!Object.is(slots[key], value)) { slots[key] = value; dirty = true; } }];
    },
    useRef(initial: any) { const key = index++; return slots[key] ?? (slots[key] = { current: initial }); },
    useEffect(effect: any, dependencies: any[]) {
      const key = index++;
      if (changed(dependencies, slots[key]?.dependencies)) effects.push(() => {
        slots[key]?.cleanup?.(); slots[key] = { dependencies, cleanup: effect() };
      });
    },
    useMemo(factory: any, dependencies: any[]) {
      const key = index++;
      if (changed(dependencies, slots[key]?.dependencies)) slots[key] = { dependencies, value: factory() };
      return slots[key].value;
    },
    useCallback(callback: any, dependencies: any[]) { return react.useMemo(() => callback, dependencies); },
  };
  function render() {
    let loops = 0;
    while (dirty) {
      if (++loops > 30) throw new Error("Hook render loop");
      dirty = false; index = 0; output = component(props);
      effects.splice(0).forEach(effect => effect());
    }
    return output;
  }
  return { react, mount(fn: any, initialProps = {}) { component = fn; props = initialProps; return render(); },
    update(newProps = props) { props = newProps; dirty = true; return render(); },
    value: () => output,
    async flush() { await tick(); return render(); },
    cleanup() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}
function ad(id = "one", overrides = {}): any {
  return { _id: id, shopName: id, tagline: "Local products", isActive: true, imageUrl: "https://example.com/ad.jpg", ctaLink: "/categories", ...overrides };
}
function find(node: any, predicate: (node: any) => boolean): any {
  if (!node || typeof node !== "object") return undefined;
  if (predicate(node)) return node;
  const children = Array.isArray(node) ? node : node.props?.children;
  return (Array.isArray(children) ? children : [children]).map(child => find(child, predicate)).find(Boolean);
}

test("legacy advertisement destinations resolve to the category page", () => {
  const utils = load("utils/shopAds.ts");
  assert.equal(utils.adDestination("/products?category=fruits-vegetables"), "/category/fruits-vegetables");
  assert.equal(utils.adDestination("/products?category=bakery-cakes&subcategory=bread"), "/category/bakery-cakes?subcategory=bread");
  assert.equal(utils.adDestination("/products?q=milk"), "/search?q=milk");
  assert.equal(utils.adDestination("javascript:alert(1)"), "/shop-by-stores");
  assert.equal(utils.adCalendarDate("2026-10-15T18:30:00Z"), "2026-10-16");
});
test("external ads open safely in a new tab while internal ads navigate", () => {
  const opened: any[] = []; const navigated: any[] = [];
  const utils = load("utils/shopAds.ts", {}, { window: { open: (...args: any[]) => opened.push(args) } });
  utils.openAd("https://example.com/offer", (link: string) => navigated.push(link));
  utils.openAd("/products?category=beauty", (link: string) => navigated.push(link));
  assert.deepEqual(opened, [["https://example.com/offer", "_blank", "noopener,noreferrer"]]);
  assert.deepEqual(navigated, ["/category/beauty"]);
});
test("active ad refresh removes disabled ads and enforces expiry without reloading", async () => {
  const clock = browser(); const runner = hooks(); const utils = load("utils/shopAds.ts");
  let response = [ad("short", { expiresAt: new Date(clock.now() + 1000).toISOString() }), ad("long")];
  let calls = 0;
  const { useActiveShopAds } = load("hooks/useActiveShopAds.ts", { react: runner.react,
    "../utils/shopAds": utils, "../services/api/admin/adminShopAdService": { getActiveShopAds: async () => { calls++; return { success: true, data: response }; } } }, clock.globals);
  runner.mount(useActiveShopAds); await runner.flush();
  assert.equal(runner.value().ads.length, 2);
  await clock.advance(1000, runner.flush);
  assert.equal(runner.value().ads.length, 1);
  response = [];
  await clock.advance(14000, runner.flush);
  assert.equal(runner.value().ads.length, 0);
  assert.equal(calls, 2);
  runner.cleanup(); assert.equal(clock.timers.size, 0);
});
test("failed ad refresh suppresses cached ads rather than displaying samples", async () => {
  const clock = browser(); const runner = hooks(); const utils = load("utils/shopAds.ts");
  let fail = false;
  const { useActiveShopAds } = load("hooks/useActiveShopAds.ts", { react: runner.react,
    "../utils/shopAds": utils, "../services/api/admin/adminShopAdService": { getActiveShopAds: async () => {
      if (fail) throw new Error("offline"); return { success: true, data: [ad()] };
    } } }, clock.globals);
  runner.mount(useActiveShopAds); await runner.flush(); assert.equal(runner.value().ads.length, 1);
  fail = true; await clock.advance(15000, runner.flush); assert.equal(runner.value().ads.length, 0);
  runner.cleanup();
});
function popup() {
  const clock = browser(); const runner = hooks();
  let ads = [ad()];
  const widget = load("modules/user/components/AdPopupAutoWidget.tsx", {
    react: runner.react, "react/jsx-runtime": jsx,
    "framer-motion": { AnimatePresence: "presence", motion: { aside: "aside" } },
    "react-router-dom": { useLocation: () => ({ pathname: "/" }), useNavigate: () => () => {} },
    "../../../hooks/useActiveShopAds": { useActiveShopAds: () => ({ ads, loading: false }) },
    "../../../utils/shopAds": { openAd() {} },
  }, clock.globals).default;
  runner.mount(widget);
  return { clock, runner, visible: () => find(runner.value(), node => node.type === "aside"), remove() { ads = []; runner.update(); } };
}
test("popup hover pauses its timer and leaving resumes the remaining time", async () => {
  const { clock, runner, visible } = popup();
  await clock.advance(50000, runner.flush); assert.ok(visible());
  await clock.advance(2000, runner.flush); visible().props.onMouseEnter(); await runner.flush();
  await clock.advance(20000, runner.flush); assert.ok(visible());
  visible().props.onMouseLeave(); await runner.flush();
  await clock.advance(6999, runner.flush); assert.ok(visible());
  await clock.advance(1, runner.flush); assert.equal(visible(), undefined);
  runner.cleanup();
});
test("opening chat suppresses a visible popup and expired ads disappear while hovered", async () => {
  const state = popup();
  await state.clock.advance(50000, state.runner.flush); assert.ok(state.visible());
  state.runner.update({ suppressed: true }); assert.equal(state.visible(), undefined);
  state.runner.update({ suppressed: false });
  await state.clock.advance(50000, state.runner.flush); assert.ok(state.visible());
  state.visible().props.onMouseEnter(); await state.runner.flush(); state.remove();
  assert.equal(state.visible(), undefined); state.runner.cleanup();
});
test("carousel continues autoplay after a swipe and renders nothing with no ads", async () => {
  const clock = browser(); const runner = hooks(); let ads = [ad("one"), ad("two")];
  const carousel = load("modules/user/components/ShopAdCarousel.tsx", {
    react: runner.react, "react/jsx-runtime": jsx,
    "framer-motion": { AnimatePresence: "presence", motion: { div: "motion" } },
    "react-router-dom": { useNavigate: () => () => {} },
    "../../../hooks/useActiveShopAds": { useActiveShopAds: () => ({ ads, loading: false }) },
    "../../../utils/shopAds": { openAd() {} },
  }, clock.globals).default;
  runner.mount(carousel);
  const card = () => find(runner.value(), node => node.type === "motion");
  assert.match(card().props["aria-label"], /one/);
  card().props.onDragStart(); card().props.onDragEnd(null, { offset: { x: -100 }, velocity: { x: -1000 } }); await runner.flush();
  assert.match(card().props["aria-label"], /two/);
  await clock.advance(6000, runner.flush); assert.match(card().props["aria-label"], /one/);
  ads = []; runner.update(); assert.equal(runner.value(), null); runner.cleanup();
});
