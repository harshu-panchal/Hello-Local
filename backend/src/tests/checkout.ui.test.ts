import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

// Render the actual checkout component with a minimal hook host and a fake SDK.
// No browser, payment API, or network credentials are used.
function checkoutHost() {
  let hookIndex = 0;
  const hooks: any[] = [];
  const effects: Array<() => void> = [];
  let options: any, intents = 0, opens = 0, closes = 0, verifications = 0;
  const react = {
    createElement: (...args: any[]) => args,
    useRef: (initial: any) => hooks[hookIndex++] ||= { current: initial },
    useEffect: (work: any, deps: any[]) => {
      const index = hookIndex++;
      const previous = hooks[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
        previous?.cleanup?.();
        hooks[index] = { deps };
        effects.push(() => { hooks[index].cleanup = work(); });
      }
    },
  };
  const sdk = function(this: any, supplied: any) {
    options = supplied;
    this.open = () => { opens++; };
    this.close = () => { closes++; options.modal.ondismiss(); };
  };
  const source = fs.readFileSync(path.join(process.cwd(), "../frontend/src/components/RazorpayCheckout.tsx"), "utf8")
    .replaceAll("import.meta.env", "({ DEV: false })");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as any };
  vm.runInNewContext(js, { module, exports: module.exports, console, window: { Razorpay: sdk },
    require: (name: string) => {
      if (name === "react") return react;
      if (name.endsWith("paymentService")) return {
        createRazorpayOrder: async () => { intents++; return { success: true, data: { razorpayOrderId: "order_gateway", razorpayKey: "test_key", amount: 12345 } }; },
        verifyPayment: async () => { verifications++; return { success: true }; },
      };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return {
    render(props: any) { hookIndex = 0; module.exports.default(props); effects.splice(0).forEach(effect => effect()); },
    unmount() { for (const hook of hooks) hook?.cleanup?.(); },
    get options() { return options; }, get intents() { return intents; }, get opens() { return opens; }, get closes() { return closes; }, get verifications() { return verifications; },
  };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const props = () => ({ orderId: "order_app", amount: 999, type: "Order", customerDetails: { name: "Customer", email: "test@example.com", phone: "9000000000" }, onSuccess: (_id: string) => {}, onFailure: (_message: string) => {} });

test("checkout opens once across parent rerenders and uses the gateway's authoritative amount", async () => {
  const host = checkoutHost();
  host.render(props()); await flush();
  host.render(props()); await flush();
  assert.equal(host.intents, 1);
  assert.equal(host.opens, 1);
  assert.equal(host.options.amount, 12345);
  host.unmount();
});

test("checkout uses latest callbacks and ignores dismiss while verifying a captured payment", async () => {
  const host = checkoutHost();
  let oldSuccess = 0, success = 0, failure = 0;
  host.render({ ...props(), onSuccess: () => { oldSuccess++; } }); await flush();
  host.render({ ...props(), onSuccess: () => { success++; }, onFailure: () => { failure++; } });
  const payment = { razorpay_payment_id: "pay_gateway", razorpay_order_id: "order_gateway", razorpay_signature: "signature" };
  const first = host.options.handler(payment);
  const duplicate = host.options.handler(payment);
  host.options.modal.ondismiss();
  await Promise.all([first, duplicate]);
  assert.equal(host.verifications, 1);
  assert.equal(oldSuccess, 0);
  assert.equal(success, 1);
  assert.equal(failure, 0);
  host.unmount();
  assert.equal(failure, 0);
});

test("Strict Mode setup/cleanup replay cannot launch a stale checkout", async () => {
  const host = checkoutHost();
  let failure = 0;
  host.render({ ...props(), onFailure: () => { failure++; } });
  host.unmount();
  await flush();
  assert.equal(host.opens, 0);
  assert.equal(host.intents, 0);
  assert.equal(failure, 0);
});
