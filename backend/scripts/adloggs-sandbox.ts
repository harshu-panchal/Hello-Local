/**
 * Adloggs DEVELOPMENT sandbox harness (Phase 6). Inactive until invoked.
 *
 * Safety:
 *  - Refuses to run unless ADLOGGS_ENVIRONMENT=development (host fixed to https://dev.adloggs.com).
 *  - No database, Razorpay, Firebase or app server: it never imports them.
 *  - Output is redacted (no API key, phones masked, OTPs dropped).
 *  - "book" and "cancel" need an explicit confirmation phrase; a create request is
 *    sent at most once per invocation and never retried.
 *
 * Usage (from backend/, with the dev key in the environment — never in this file):
 *   ADLOGGS_ENVIRONMENT=development ADLOGGS_INTEGRATION_ENABLED=true ADLOGGS_API_KEY=<dev key> \
 *     npx tsx scripts/adloggs-sandbox.ts <operation> [options]
 *
 * Operations:
 *   config                                   validate configuration (no network)
 *   wallet                                   POST /aa/oporder/wallet/balance
 *   serviceability --routes <file.json>      POST /aa/oporder/v1.2/service/availability for each route
 *   book --payload <file.json> --confirm I-UNDERSTAND-THIS-CREATES-A-SANDBOX-ORDER
 *                                            POST /aa/oporder/v2/create (ONE synthetic Online order)
 *   status --uuid <order_uuid>               POST /aa/oporder/getcurrentstatus
 *   cancel --uuid <order_uuid> --confirm CANCEL-SANDBOX-ORDER
 *                                            POST /aa/oporder/v1.2/cancel (before pickup only)
 *   fixtures                                 offline: documented webhook flows, duplicates, RTO, multi-seller
 */
import fs from "fs";
import { AdloggsClient, axiosTransport } from "../src/services/adloggs/adloggsClient";
import { adloggsCapabilities, loadAdloggsConfig, adloggsAuthHeader, ADLOGGS_PATHS } from "../src/services/adloggs/adloggsConfig";
import { AdloggsError } from "../src/services/adloggs/adloggsErrors";
import { ADLOGGS_STATUS_BY_CODE, judgeProviderTransition } from "../src/services/adloggs/adloggsStatus";
import { parseWebhookPayload } from "../src/services/adloggs/adloggsWebhookService";
import { summarizeShipments } from "../src/services/shipmentService";

const args = process.argv.slice(2);
const op = args[0];
const option = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const redact = (value: unknown) => JSON.stringify(value, (key, v) => {
  if (/otp/i.test(key)) return undefined;
  if (typeof v === "string" && /^\+?\d{10,13}$/.test(v)) return `${v.slice(0, 2)}******${v.slice(-2)}`;
  if (typeof v === "number" && /phone|contact_no/i.test(key)) return "**********";
  return v;
}, 2);
const out = (label: string, value: unknown) => console.log(`${label}:\n${redact(value)}`);
const fail = (message: string): never => { console.error(`Refused: ${message}`); process.exit(1); };

async function main() {
  const config = loadAdloggsConfig();
  if (config.environment !== "development") fail("ADLOGGS_ENVIRONMENT must be 'development' for the sandbox harness.");
  const caps = adloggsCapabilities(config);
  const client = new AdloggsClient();
  const readJson = (file?: string) => (file ? JSON.parse(fs.readFileSync(file, "utf8")) : fail("missing JSON file argument"));

  switch (op) {
    case "config":
      out("Configuration (no secrets)", { environment: config.environment, baseUrl: config.baseUrl, apiKeyConfigured: config.hasApiKey,
        apiAccessAllowed: caps.apiAccessAllowed, bookingReady: caps.bookingReady, blockers: caps.blockers });
      return;
    case "wallet":
      out("Wallet", await client.getWalletBalance());
      return;
    case "serviceability": {
      const routes = readJson(option("routes"));
      if (!Array.isArray(routes) || routes.length > 10) fail("routes file must be an array of at most 10 synthetic routes");
      for (const route of routes) out(`Route ${route.partner_order_id}`, await client.checkServiceAvailability(route));
      return;
    }
    case "book": {
      if (option("confirm") !== "I-UNDERSTAND-THIS-CREATES-A-SANDBOX-ORDER") fail("booking needs --confirm I-UNDERSTAND-THIS-CREATES-A-SANDBOX-ORDER");
      const payload = readJson(option("payload"));
      const onlineOk = payload.payment_type === "Online" && payload.collectible_amount === 0;
      const codOk = payload.payment_type === "COD" && typeof payload.collectible_amount === "number" && payload.collectible_amount >= 0 && caps.codReady;
      if (!onlineOk && !codOk) fail("only synthetic Online orders (collectible 0) or COD orders with COD enabled are allowed");
      try {
        out("Created (record the order_uuid; this is NOT retried)", await client.createOrder(payload));
      } catch (error) {
        if (error instanceof AdloggsError && error.mayHaveReachedProvider && !error.definitive) {
          console.error("Outcome UNKNOWN: the order may exist at Adloggs. Do not re-run; check the Adloggs dashboard for partner_order_id", payload.partner_order_id);
        }
        throw error;
      }
      return;
    }
    case "status":
      out("Status", await client.getCurrentStatus(option("uuid") || fail("--uuid required")));
      return;
    case "cancel":
      if (option("confirm") !== "CANCEL-SANDBOX-ORDER") fail("cancel needs --confirm CANCEL-SANDBOX-ORDER");
      out("Cancel", await client.cancelOrder(option("uuid") || fail("--uuid required"), "Sandbox test cancellation"));
      return;
    case "probe": {
      // Raw-structure probe for contract verification: HTTP status, envelope
      // status/code/message, and the TYPE of every data field. Values are shown
      // only for non-sensitive numeric routing fields. Read-only endpoints only.
      const target = option("endpoint");
      const allowed: Record<string, string> = { wallet: ADLOGGS_PATHS.walletBalance, serviceability: ADLOGGS_PATHS.serviceAvailability, status: ADLOGGS_PATHS.currentStatus };
      if (!target || !allowed[target]) fail("--endpoint must be wallet, serviceability or status (read-only)");
      if (!config.baseUrl || config.environment !== "development") fail("development host only");
      const header = adloggsAuthHeader();
      if (!header) fail("API key not configured");
      const body = target === "wallet" ? {} : target === "status" ? { order_uuid: option("uuid") || fail("--uuid required") } : readJson(option("request"));
      const SHOW = new Set(["status", "code", "message", "estimated_price", "distance", "eta_min", "service_available", "service_availability", "order_status_id", "is_return"]);
      const shape = (value: any, key = ""): any => {
        if (value === null) return "null";
        if (Array.isArray(value)) return value.length ? [shape(value[0])] : [];
        if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v, k)]));
        return SHOW.has(key) ? `${typeof value}: ${JSON.stringify(value)}` : typeof value;
      };
      try {
        const response = await axiosTransport({ url: `${config.baseUrl}${allowed[target]}`, headers: header!, body, timeoutMs: config.requestTimeoutMs, maxResponseBytes: 256 * 1024 });
        console.log(JSON.stringify({ endpoint: allowed[target], httpStatus: response.httpStatus, body: shape(response.body) }, null, 2));
      } catch (error) {
        console.log(JSON.stringify({ endpoint: allowed[target], transportError: error instanceof AdloggsError ? `${error.kind}: ${error.message}` : "unknown" }));
      }
      return;
    }
    case "fixtures": {
      // Documented flows (doc V2 §7) replayed through the real parser and transition model, offline.
      const flows: Record<string, number[]> = { delivered: [3, 4, 5], cancelled: [3, 6], rto: [3, 4, 13, 14], duplicateAndLate: [3, 4, 4, 3, 5] };
      for (const [name, codes] of Object.entries(flows)) {
        let current: any = null;
        const verdicts = codes.map(code => {
          const parsed = parseWebhookPayload({ order_uuid: "fixture-uuid", order_status_id: code, partner_order_id: "FIXTURE-S1", otps: { delivery_otp: "0000" } })!;
          const verdict = judgeProviderTransition(current, ADLOGGS_STATUS_BY_CODE[parsed.code]);
          if (verdict === "APPLY") current = ADLOGGS_STATUS_BY_CODE[parsed.code];
          return `${code}:${verdict}`;
        });
        out(`Flow ${name}`, { verdicts, final: current });
      }
      out("Multi-seller summary (delivered + RTO + preparing)", summarizeShipments([{ status: "DELIVERED" }, { status: "RETURNED_TO_ORIGIN" }, { status: "PREPARING" }]));
      return;
    }
    default:
      fail("unknown operation; see the header of scripts/adloggs-sandbox.ts");
  }
}

main().catch(error => {
  console.error(error instanceof AdloggsError ? `${error.kind}: ${error.message}` : "Sandbox run failed.");
  process.exit(1);
});
