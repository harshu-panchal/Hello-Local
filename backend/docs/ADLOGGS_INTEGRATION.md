# Adloggs integration (Phase 6, hardened in Phase 7)

Source of truth: **"Adloggs Ordering Partner API Doc V2"** (16 pages). Anything not in that document is listed under *Open questions* and is not implemented as fact.

Status legend: **Implemented & tested locally (mocked)** · **Implemented, disabled** · **Awaiting sandbox verification** · **Blocked by missing provider contract** · **Requires business approval**.

> Adloggs is **not** available for live customer orders. `ADDLOGS_INTEGRATION_AVAILABLE = false` and `ADLOGGS_PRODUCTION_ACTIVATION_ALLOWED = false` are code constants; no env value or API key changes them. The internal provider id stays `ADDLOGS` (stored data); user-facing labels say "Adloggs".

## 1. Architecture

| Piece | File | Status |
|---|---|---|
| Config, host map, capability gates | `src/services/adloggs/adloggsConfig.ts` | Implemented & tested |
| Typed client (5 endpoints) | `src/services/adloggs/adloggsClient.ts` | Implemented & tested (mocked) · awaiting sandbox |
| Errors / redaction | `src/services/adloggs/adloggsErrors.ts` | Implemented & tested |
| Status model, tracking-URL allow-list | `src/services/adloggs/adloggsStatus.ts` | Implemented & tested |
| Shipment payload builder | `src/services/adloggs/adloggsPayload.ts` | Implemented & tested · awaiting sandbox |
| Checkout serviceability | `src/services/adloggs/adloggsServiceability.ts`, `checkoutService.ts` | Implemented, dormant (Adloggs unselectable) |
| Booking worker + unknown-outcome resolution | `src/services/adloggs/adloggsBookingService.ts` | Implemented, disabled |
| Status application + polling | `src/services/adloggs/adloggsTrackingService.ts` | Implemented, disabled |
| Webhook (receipt, dedupe, replay) | `src/services/adloggs/adloggsWebhookService.ts`, `models/AdloggsWebhookEvent.ts` | Pipeline tested; **auth blocked by missing contract** |
| External cancellation worker | `src/services/adloggs/adloggsCancellationService.ts` | Implemented, disabled |
| Admin status / wallet / seller profile | `src/services/adloggs/adloggsAdminService.ts`, `modules/admin/controllers/adminAdloggsController.ts` | Implemented & tested |
| Sandbox harness | `scripts/adloggs-sandbox.ts` | Implemented, not run against Adloggs |

All HTTP lives in `adloggsClient.ts`. No network call runs inside a MongoDB transaction.

## 2. API contract matrix (doc V2)

All requests: `POST`, header `x-api-key: <key>`, hosts `https://dev.adloggs.com` / `https://app.adloggs.com`. Envelope: `{ status, code, message, data }` — business success is `status: true`, failures use `status: false` with `code` 202 or 400. HTTP status alone is never trusted.

| Endpoint | Mandatory request fields | Optional | Success data | Documented errors | Our data source |
|---|---|---|---|---|---|
| `/aa/oporder/v2/create` | partner_order_id, pickup_contact_name/no, pickup_address, pickup_address_details{city_name,state_name,country_name,pincode}, pickup_date_time, pickup_lat/long, delivery_contact_no, delivery_address, delivery_address_details{…}, delivery_lat/long, order_category, order_total_price, order_total_weight_in_kg, items[{name,quantity,price}], utc_offset, payment_type*, collectible_amount* | partner_merchant_id, partner_reference_id, emails, door_no, street_name, district_name, pickup/delivery/return OTP, order_description, delivery_contact_name (table says optional) | order_uuid, trackUrl, partner_order_id, partner_merchant_id, fee, distance, meta_data | validation (202), auth (400 "Auth Error"), "Riders not available" (202) | Shipment.shipmentNumber; Seller (storeName, mobile, address, city, **pickupState, pickupPincode, adloggsOrderCategory**, location); Order (customerName/Phone, deliveryAddress); OrderItem (productName, quantity, total); **Product.shippingWeightKg**; config `ADLOGGS_PICKUP_WINDOW_MINUTES` |
| `/aa/oporder/v1.2/service/availability` | partner_order_id, pickup_lat/long/pincode, delivery_lat/long/pincode, utc_offset, payment_type | partner_merchant_id | service_available, to_pickup.eta_min, distance, estimated_price | "currently_service_not_available", "distance_too_long" (202) | Seller location + pickupPincode; checkout address |
| `/aa/oporder/getcurrentstatus` | order_uuid | — | order_uuid, order_status_id, is_return, deliveryStaffDetails{name, phone, currentLocation} | — (none documented) | Shipment.adloggs.orderUuid |
| `/aa/oporder/v1.2/cancel` | order_uuid, order_cancel_description | — | `{}` | "Order already picked up.", "Order already delivered.", "Invalid order uuid" (202) | Shipment.adloggs.orderUuid |
| `/aa/oporder/wallet/balance` | — | partner_merchant_id | wallet_balance (string) | "Wallet not enabled" (`status: true`, `data.code: wallet_not_enabled`) | — |
| Webhook → our URL | — | — | order_uuid, order_status_id, partner_order_id, deliveryStaffDetails, eta, rider_platform, reason, otps | auth: "client authentication" only | Shipment.adloggs.orderUuid / partnerOrderId |

\* `payment_type` is mandatory for COD orders; we always send it. `collectible_amount` = 0 for Online.

### Inconsistencies in the PDF (not silently resolved)

| Issue | What we do | Verify in sandbox |
|---|---|---|
| `partner_order_id` described as INTEGER, samples are strings (`"10012458t"`) | Send our stable string `ORDER-S<n>` (shipmentNumber) | Accepted format/length/charset |
| Phones/coordinates: tables say STRING, samples are numbers | Follow the JSON samples (numbers) | Both accepted? |
| `service_available` vs `service_availability` | Read both | Which one is real |
| `delivery_long` row labelled `pickup_long` | Send `delivery_long` (as in the sample) | — |
| `pickup_date_time` = "time before which the pickup should be collected" | No policy assumed: booking blocked until `ADLOGGS_PICKUP_WINDOW_MINUTES` is set | Semantics, past/near-future limits |
| `delivery_contact_name` optional in the table, present in the sample | Sent when known | — |
| Webhook auth "client authentication" only | Webhooks rejected (fail closed) | Mechanism, secret, replay window, ack, retries |
| No idempotency guarantee, no lookup by partner_order_id | Ambiguous creates are never retried (see §5) | Whether duplicates are rejected |
| No event id or timestamp in webhooks | Dedupe key = sha256(order_uuid, status, partner_order_id); times are "received at" | Ordering/retry behaviour |
| Wallet "not enabled" returned with `status: true` | Treated as its own state, not zero | — |

## 3. Configuration (`backend/.env.example`)

`ADLOGGS_ENVIRONMENT` (`development` | `production`), `ADLOGGS_API_KEY`, `ADLOGGS_INTEGRATION_ENABLED`, `ADLOGGS_BOOKING_WORKER_ENABLED`, `ADLOGGS_STATUS_POLLING_ENABLED`, `ADLOGGS_CANCELLATION_WORKER_ENABLED`, `ADLOGGS_WEBHOOK_ENABLED`, `ADLOGGS_COD_ENABLED` (ignored), `ADLOGGS_PICKUP_WINDOW_MINUTES`, `ADLOGGS_REQUEST_TIMEOUT_MS`, `ADLOGGS_STATUS_POLL_INTERVAL_SECONDS`.

Rules: default off; exact environment value; hosts from a fixed map (no URL variable); production fails closed in Phase 6; a key alone enables nothing; the key is only read by the client's header builder and never returned, logged or sent to the frontend.

## 4. Data requirements

Added (optional, no defaults, nothing back-filled or inferred): `Seller.pickupPincode`, `Seller.pickupState`, `Seller.adloggsOrderCategory` (Food and Beverage | Grocery — set by an admin via `PUT /api/v1/admin/delivery-providers/adloggs/sellers/:sellerId/profile`), `Product.shippingWeightKg` (per unit; `pack` text is never parsed). Missing data blocks only the affected booking, with the reason recorded on the intent. `country_name` is "India" (platform is India-only: INR, +91, 6-digit pincodes). Customer pincode `000000` (legacy default) is rejected. Pickup data is frozen on the shipment (`adloggs.pickupSnapshot`) at the first booking attempt and reused on retries.

## 5. Booking lifecycle and unknown outcomes

`PENDING → CLAIMED → SUBMITTING → BOOKED` (verified `order_uuid`, matching `partner_order_id`). Failures: definitive provider rejection → `RETRYABLE_FAILURE` (riders unavailable, auth) or `FAILED` (validation); connection refused → retryable (nothing sent). **Timeout, dropped connection, malformed success, mismatched partner id, or a crash after `SUBMITTING` → `OUTCOME_UNKNOWN`** — never re-claimed. Leaving it requires an audited admin action (`POST /api/v1/admin/shipments/:id/adloggs/resolve-outcome`, Phase 7) with a written reason; **no typed phrase authorises anything**:
- `VERIFY_PROVIDER_ORDER` with an `order_uuid` is accepted only when provider evidence **correlates** it with this shipment's `partner_order_id`: a create response that matched but could not be saved (`adloggs.createEvidence`), an authenticated webhook carrying our partner id, or a status response carrying it. The documented status response has **no** `partner_order_id`, so a successful status call alone proves nothing: the shipment stays `OUTCOME_UNKNOWN` (`UNCORRELATED`) and the admin escalates to Adloggs. Foreign, conflicting or already-owned uuids are refused.
- Rebooking is dual control: `REQUEST_REBOOK` (reference of Adloggs' **written** confirmation that no order exists) then `APPROVE_REBOOK` by a **different** admin. Refused while any provider evidence exists. The retry uses a **new** `partner_order_id` (`<shipment>-R2`, ...); the old one is retired, so a late success for it is kept as `foreignOrderEvidence` and flagged as a possible duplicate, never bound.
- `RECORD_INVESTIGATION` adds an audit note only.
Every call (refused ones too) is stored in `adloggs.adminActions` with admin, reason, evidence and outcome. A create response for a different partner id is stored as `foreignOrderEvidence` (never as this shipment's `orderUuid`). Stale workers cannot overwrite verified outcomes (all writes are conditional on state + lease token). Exactly-once external execution is **not** claimed.

Before sending, the worker re-checks readiness, payment (Online, Paid), payload validity and serviceability (storing `estimated_price`). Unique partial indexes on `adloggs.orderUuid` and `adloggs.partnerOrderId`.

## 6. Status mapping

| Code | Provider status | Shipment effect |
|---|---|---|
| 2 | Pending | none |
| 3 | Assigned | rider name stored |
| 11 | Arrived at pickup | none |
| 4 | Picked up | → PICKED_UP |
| 9 | Out for delivery | (PICKED_UP) |
| 8 | Arrived at delivery | (PICKED_UP) |
| 5 | Delivered | → DELIVERED (this shipment only) |
| 6 | Cancelled | attention; no local cancel/refund |
| 13 | Return initiated | rto=INITIATED, attention |
| 14 | RTO delivered | → RETURNED_TO_ORIGIN (never "delivered") |

Explicit transition model (numeric codes are not ordered); duplicates and late events are ignored; contradictions and unknown codes are flagged for admins. Only rider **name** is stored — no phone, location, ETA or OTP. Polling is leased, bounded and backed off.

**Authority boundary**: seller readiness/preparation stay authoritative for fulfilment; verified Adloggs events for transport. External deliveries do **not** change the parent order status, create courier assignments, touch in-house pickup records/OTP, or trigger settlement (see §9).

## 7. Cancellation and RTO

**Phase 7: provider first, then local cancellation and refund.** When a shipment's provider order exists or may exist (intent `SUBMITTING`, `OUTCOME_UNKNOWN` or `BOOKED`), any cancellation (customer, seller, admin) is **deferred** (`adloggs.pendingLocalCancellation = AWAITING_PROVIDER`): its items stay active and nothing is refunded. Booked shipments get `adloggs.cancellation = REQUESTED`; unknown/in-flight ones get `cancellationRequired`. Other sellers in the same request are cancelled and refunded immediately, **for their own items only** (refund key `<order>:cancel:sellers:<ids>`).

The deferred cancellation completes (seller-scoped `cancelOrderLifecycle` with the internal `externalCancellationConfirmed` flag, existing refund keys, `refundOrder` caps at the refundable remainder, so no double refund) only on verified evidence: cancellation `CONFIRMED`, verified provider status `CANCELLED`, or a dual-control close of an unknown booking. Rejection or pickup → `BLOCKED` + attention, **no refund**. Triggers: cancellation worker, status apply, dual-control close, and a 60 s database-only sweep.

Admin escalation (`POST /api/v1/admin/shipments/:id/adloggs/cancellation`, audited, reason required): `ACCEPT_PROVIDER_CANCELLATION` (Adloggs cancelled on its own → cancel + refund that seller only, idempotent), `REBOOK_AFTER_PROVIDER_CANCELLATION` (keep items; new partner id; old order kept in `supersededOrders`), `RETRY_PROVIDER_CANCELLATION`, `WITHDRAW_CANCELLATION_REQUEST`. Customers see "waiting for the delivery partner to confirm; refund follows" (or "support will contact you" when blocked). Customers and sellers still cannot cancel items once Adloggs has collected them. RTO is tracked separately; no restock, refund or settlement happens automatically.

## 8. OTPs

None are generated or sent (all optional in the doc). Webhook `otps` are never stored or logged. The in-house single customer OTP is unchanged. Ownership/verification of provider OTPs is an open question.

## 9. Financial reconciliation and COD

`ShipmentReconciliation` per external shipment: `estimatedProviderCost` (serviceability estimate), `providerBookingFee` (create `fee`), `providerDistanceKm`, `providerCost` (final invoice — null), adjustments/credits/settlement reference (null). Customer delivery charge stays once per order (`Order.shipping`). No GST, cancellation charge, wallet deduction or margin is computed.

**COD is blocked** (`ADLOGGS_COD_ALLOWED = false`; checkout refuses Adloggs COD; payload builder refuses COD). **Allocation proposal (Phase 7 Task 13; proposal only, not implemented):**
1. Per shipment `s`: `items_s` = sum of that seller's active `OrderItem.total`; `discount_s` = that seller's `discountAmount` share (coupon split pro rata to `items_s` when the coupon is order-level).
2. Order-level charges (`shipping`, `platformFee`, `tipAmount`) are split pro rata to `items_s - discount_s`, computed in paise with largest-remainder rounding so `sum(collectible_s) == order.total` exactly.
3. `collectible_amount_s = items_s - discount_s + charges_s` (rupees, 2 dp), frozen on the shipment at booking.
4. Partial cancellation before pickup: re-allocate only the remaining shipments; a booked shipment's collectible cannot change after booking (Adloggs has no update endpoint), so its cancellation must be provider-first (as above).
5. Remittance: Adloggs collects and remits; Hello Local records per-shipment `collected`/`remitted` from Adloggs statements; seller settlement waits for remittance. Never uses `processCODOrderDelivery` or courier cash flows.
Open questions: remittance schedule/statements, failed or partial collection, COD charges, RTO of a COD shipment.

**Parent order outcome (Phase 7, `adloggsOrderOutcomeService`)**: derived from verified shipment outcomes only, stored in `Order.externalDeliveryOutcome`: `ALL_DELIVERED`, `PARTIALLY_DELIVERED` (delivered + active), `DELIVERED_AND_CANCELLED`, `ALL_CANCELLED`, `DELIVERED_AND_RTO`, `ALL_RTO`, `IN_PROGRESS`, `UNRESOLVED` (unknown booking, blocked/unknown cancellation, provider cancellation without a decision). `ALL_DELIVERED`/`DELIVERED_AND_CANCELLED` (Online, paid) → order `Delivered`, remaining items `Delivered`; **no courier, no OTP, no `deliveryBoy` fields**. RTO and unresolved states only get an attention note.

**Seller settlement (Phase 7)**: completion queues ONE `ExternalSettlement` effect (`<order>:external-settlement`). The worker now branches explicitly: `ExternalSettlement` is **Held** while `ADLOGGS_EXTERNAL_SETTLEMENT_ALLOWED = false`; when approved it runs the same calculation and timing as in-house Online settlement (`processOrderStatusTransition` → commissions on delivery), with no courier earnings. A plain `Settlement` for an Adloggs order is Held; **unknown kinds are Held, never treated as Settlement**; `recoverOrderEffects` excludes Adloggs orders. No payout or transfer is executed.

Decided (see §13): order-level settlement timing is kept; Hello Local bears delivery and RTO costs, never deducted from sellers; RTO shipments are resolved by audited refund under existing rules, after which the delivered rest settles. Remaining before enabling: verification and approval of the settlement run itself, and reconciliation against Adloggs invoices.

## 10. Sandbox (development key)

**Phase 7 real development results (2026-11-25, `https://dev.adloggs.com`, key from `ADLOGGS_API_KEY` only; nothing printed):**
- Wallet: HTTP 200, `status: true`, `code: 200`, `message: "Wallet not enabled"`, `data.code: "wallet_not_enabled"`: authentication works; matches the PDF and the client mapping.
- Serviceability with the PDF sample route (641654 → 641654): HTTP 200, `status: false`, `code: 202`, `data.service_available: false`, `data.code: "currently_service_not_available"` (also with string coordinates). A long synthetic route: same envelope, `data.code: "distance_too_long"`, message "Distance is higher than 15.00km." The client returns `available: false` and now keeps the `data.code` reason (it was dropped before).
- No serviceable development area is known yet, so a positive serviceability response, booking, status and cancellation were **not** exercised. No booking was sent (needs explicit approval and a serviceable synthetic route).
- Dashboard inspection: not possible (no browser access and no dashboard credentials in this environment).

`probe --endpoint wallet|serviceability|status` prints only HTTP status, envelope status/code/message and field **types** (read-only endpoints only).

```
cd backend
export ADLOGGS_ENVIRONMENT=development ADLOGGS_INTEGRATION_ENABLED=true ADLOGGS_API_KEY=<dev key>
npx tsx scripts/adloggs-sandbox.ts config
npx tsx scripts/adloggs-sandbox.ts wallet
npx tsx scripts/adloggs-sandbox.ts serviceability --routes routes.json
npx tsx scripts/adloggs-sandbox.ts book --payload synthetic-order.json --confirm I-UNDERSTAND-THIS-CREATES-A-SANDBOX-ORDER
npx tsx scripts/adloggs-sandbox.ts status --uuid <order_uuid>
npx tsx scripts/adloggs-sandbox.ts cancel --uuid <order_uuid> --confirm CANCEL-SANDBOX-ORDER
npx tsx scripts/adloggs-sandbox.ts fixtures     # offline
```
Mocked tests: `npx tsx --test src/tests/adloggs.integration.test.ts`.

## 11. Production activation checklist (simultaneous Online + COD launch)

Approved: Online and COD launch **together**, for **all eligible sellers at once** (no pilot), only after both are fully verified. Online and COD keep independent internal gates (`ADLOGGS_COD_ALLOWED`, booking/worker flags) for testing and emergency stop, but live activation is blocked until **every** requirement below is met. They are enforced in code as `ADLOGGS_ACTIVATION_REQUIREMENTS` (scope ONLINE/COD/BOTH); each unmet item is a capability blocker, and a test keeps `ADDLOGS_INTEGRATION_AVAILABLE` false while any is unmet.

Both payment methods:
1. Real sandbox booking succeeded and the response was validated; status tracking verified; cancellation before pickup verified.
2. `pickup_date_time` semantics confirmed by Adloggs (`ADLOGGS_PICKUP_SEMANTICS_CONFIRMED`). The 30-minute window is approved and is the default, but **no real create request can be sent** until then (client, worker and scheduler gates).
3. Merchant, category and weight requirements confirmed; every eligible seller has pickup pincode/state/category and every product a shipping weight. Ineligible sellers/products are refused at checkout (`adloggsIneligibleStores`) and by the booking payload; no bypass.
4. Unknown-outcome recovery approved (duplicate behaviour and lookup by partner id confirmed).
5. Cancellation and refund handling verified end to end (provider-first cancellation, no premature or duplicate refunds).
6. External seller settlement verified, approved and enabled (`ADLOGGS_EXTERNAL_SETTLEMENT_ALLOWED`); existing commission, earnings and timing unchanged.
7. Operational RTO resolution process approved (evidence, preview, audited decision, escalation).
8. Authenticated webhooks, or an approved polling-only alternative.
9. Database and concurrency verification on a dedicated test database.

COD (in addition):
10. `ADLOGGS_COD_ALLOWED` enabled in a reviewed change; COD is never enabled just because the payload supports it.
11. Per-shipment collectible allocation approved (§9), summing exactly to the customer payable.
12. Real sandbox COD booking verified.
13. Collection confirmation, remittance schedule/statements/deductions, failed and partial collection, RTO of COD shipments: documented by Adloggs, implemented and reconciled.
14. Seller settlement for Adloggs COD approved and tested (never the in-house courier cash flow).

Then: flip `ADLOGGS_PRODUCTION_ACTIVATION_ALLOWED` and `ADDLOGS_INTEGRATION_AVAILABLE` in one reviewed change, enable workers, switch the active provider. Rollback: switch the active provider back to `IN_HOUSE` (new orders only); existing Adloggs orders keep their provider and their tracking, cancellation, reconciliation and approved settlement continue; no in-house rider is assigned to them.

## 12. Open questions for Adloggs

1. Accepted `partner_order_id` format (integer vs string, length, charset). — blocks booking go-live
2. Duplicate-booking guarantees for a repeated `partner_order_id`. — blocks automatic recovery of unknown outcomes
3. Lookup by `partner_order_id` after a lost create response. — same
4. Webhook authentication mechanism. — blocks webhooks
5. Webhook retry / acknowledgement contract, event ids, timestamps. — blocks webhooks
6. Seller merchant registration (`partner_merchant_id`) requirements. — optional field unused
7. Supported product categories beyond "Food and Beverage", "Grocery". — category mapping
8. Weight requirements and limits. — booking
9. `pickup_date_time` semantics (requested pickup time? earliest? deadline?), timezone (we send IST `YYYY-MM-DD HH:mm`), allowed lead time, behaviour when it passes. — **blocks booking**: `ADLOGGS_PICKUP_WINDOW_MINUTES` stays unset until answered and approved
10. Rate limits. — polling/serviceability tuning
11. Sandbox simulation procedure (moving test orders through statuses). — sandbox tests
12. OTP ownership and verification. — OTP features
13. Cancellation charges. — reconciliation
14. RTO charges and policies. — RTO finance
15. GST and final billing/invoices. — reconciliation (`providerCost`)
16. COD remittance schedule, statements, deductions, failed/partial collection. — COD
17. Wallet funding requirements (does low balance block bookings?). — operations
18. Independent bookings for several sellers under one customer order: commercially and operationally supported? — multi-seller go-live

## 13. Approved business decisions and financial safeguards

Approved (supersede earlier proposals):
1. Hello Local bears actual Adloggs delivery costs **and** RTO charges. Recorded per shipment in `ShipmentReconciliation` (`costBearer: "PLATFORM"`), kept separate: `estimatedProviderCost`, `providerBookingFee`, `providerCost` (final, verified), `providerRtoCharge`. Unknown stays `null`, never 0. Never deducted from seller earnings (commissions use item totals only; a test checks no provider-cost field is read by commission or pricing code).
2. Customer delivery pricing unchanged.
3. Pickup window 30 minutes (`ADLOGGS_APPROVED_PICKUP_WINDOW_MINUTES`), subject to Adloggs confirming `pickup_date_time` semantics. Booking blocked until then.
4. Online and COD launch together after both are verified (§11).
5. All eligible sellers go live together.
6. Seller commission calculations, earnings and settlement timing unchanged.
7. Refund eligibility and calculations unchanged; no new fee, penalty or reason-based deduction.

**Expense accounting:** inspected. `PlatformWallet` holds aggregate earning counters (non-negative, no per-entry records), `WalletTransaction` covers sellers and couriers only, `Settlement` covers payouts. There is no expense ledger, so no accounting subsystem was added; `ShipmentReconciliation` remains the per-shipment record of provider costs for finance. Posting verified provider expenses to a ledger is a future decision.

**RTO resolution:** a verified `RTO_DELIVERED` opens `rto.resolution = PENDING_DECISION`. Before confirming, the admin sees (`GET /api/v1/admin/shipments/:id/adloggs/rto-preview`, read-only) the verified return events, the return reason (the documented status API reports none, so this is shown as "not reported"), and the refund the **existing** rules produce. Other items still active: those items' totals net of discount. Last active items: remaining refundable balance including delivery, platform fee and tip, shown with components. The preview and the lifecycle share `sellerCancellationRefundAmount`. Audited decision: refund with or without restock. A resolved RTO counts as cancelled; RTO never counts as delivery.

**Known limitation (approved to keep):** settlement stays order-level. A multi-seller order settles only after every shipment is resolved, so an undecided RTO delays the other sellers' payout. It is never silent: the RTO raises an attention note saying the order's settlement waits, appears in Shipment Operations (attention / RTO filters), and is escalated again after 24 h.

**COD allocation proposal (review; not approved, COD stays disabled):** in Hello Local, `OrderItem.total` already includes tax (tax is informational: `order.total = Σ item totals + shipping + platformFee − discount + tip`). There is **no COD fee** in the platform today; any Adloggs COD charge is a provider cost borne by Hello Local, not added to the customer. For each seller shipment s with active (non-cancelled) items:
- `items_s = Σ active item.total` (tax-inclusive)
- `discount_s` = that seller's item discounts, plus a pro-rata share of any order-level coupon by `items_s`
- `charges_s` = pro-rata share of `shipping + platformFee + tip` by `items_s − discount_s`
- All in paise, largest-remainder rounding, so `Σ collectible_s == order.total` exactly (the customer payable after cancellations)
Cancelled items are excluded before allocation; a partial cancellation re-allocates only unbooked shipments (a booked shipment's amount cannot change; its cancellation is provider-first). Partial delivery: each shipment collects only its own amount; an RTO collects nothing. Open for approval: how order-level charges are split, and how a later cancellation re-splits them. Remittance, settlement APIs, deductions, failed collection, RTO collection and reconciliation formats await Adloggs' COD documentation and are not assumed.

**RTO resolution, escalation, traceability, rollback:** unchanged from the final validation: 30 min escalation of pending cancellations, 24 h escalation of undecided RTOs, `attemptHistory` for every retired partner id, and rollback affecting new orders only.

## 14. Adloggs call answers and real development validation (2026-11-26)

**Answers from the Adloggs call (verbal; ask them to confirm in writing):**
1. Test locations: any location may be used. On the dev API, Bangalore routes are serviceable; Tiruppur, Chennai, Coimbatore, Hyderabad and Madurai returned `currently_service_not_available`.
2. `pickup_date_time`: rider arrival is typically 15-30 minutes, "not a hardcoded rule". The doc defines it as "time before which the pickup should be collected". We send booking time + 30 min (IST). `ADLOGGS_PICKUP_SEMANTICS_CONFIRMED = true`.
3. Webhook: we register our URL in the Adloggs dashboard. The authentication header/secret is still unspecified, so webhooks stay disabled; status comes from polling.
4. Duplicates: "the same id is enough". No lookup by `partner_order_id` was offered, so unknown booking outcomes keep the evidence-based admin process.
5. Multi-vendor: send each seller's pickup location with each order (one account, no per-seller merchant ID required).
6. Categories and weight: "any legal category and weight". The API enum still lists only "Food and Beverage" and "Grocery", so the code keeps that list until Adloggs documents more values.
7. COD: "it will be handled". No technical COD documentation was given, so COD stays disabled.
8. OTPs: Hello Local creates them and sends them. Implemented: three random 4-digit codes per shipment (pickup, delivery, return), created once and reused on retries, sent as integers. The customer sees only the delivery code, and the seller only the pickup code (and the return code during a return). Admins and couriers see none. They are never stored in webhook receipts or status history.
9. Rate limits and polling: "according to us". We use a 2-minute poll, a 10 s timeout and backoff.
10. Production key: issued after Adloggs verifies our test orders on their panel.

**Real development results (synthetic data only; contact numbers are the Adloggs doc samples):**
- Serviceability, Bangalore documented route: available, 3 km, ETA 1 min, estimated ₹60. An 8 km Bangalore route: ₹125.
- Booking built by the production payload builder (Online, collectible 0, 0.5 kg, OTPs included): `status: true`. `order_uuid` was returned in the form `<random>||<suffix of our partner id>`, `partner_order_id` was echoed exactly (string with letters and dash accepted), `trackUrl` was `https://dev.adloggs.com/to/<code>`, fee ₹73 (estimate ₹60), distance 3.203 km.
- Status: `order_status_id` 2 (Pending), `is_return: false`, no rider yet, no `partner_order_id` in the response (matches the doc).
- Cancel before pickup: `cancelled: true`; status then 6 (Cancelled).
- Observed: a second cancel of an already-cancelled order got **no response** (timeout). The cancellation worker now checks the verified status after a failed or timed-out cancel and treats status 6 as confirmed.

**Still open:** webhook authentication (dashboard registration, done by Hello Local), COD documentation, written confirmation of the call answers, cost and invoice terms, the production key, and the remaining activation requirements (§11).

### COD enablement and scenario orders (2026-11-26, later the same day)

- **COD is now enabled in our code** (`ADLOGGS_COD_ALLOWED = true`, `ADLOGGS_COD_ENABLED=true` in dev). Adloggs collects the cash and settles it on its platform (dashboard: Receivables > COD Settlement).
  - **COD amount per shipment:** `allocateCodCollectible`. Each seller's active items count net of their discounts, plus a proportional share of delivery, platform fee and tip, rounded in paise so the shipments always sum exactly to the order total. Cancelled items are excluded. The amount is fixed at booking and stored as `adloggs.codCollectibleAmount`.
  - **On delivery:** a COD order is marked Paid.
  - **Seller payout:** stays **held** for Adloggs COD. The existing COD payout assumes our own courier collected the cash, and Adloggs COD must first be reconciled with their COD Settlement report.
- **Real dev API result:** a COD serviceability check returned `status:false` with **"Cod is not allowed for this merchant, Please contact support."** COD must be enabled for the Hello Local merchant account by Adloggs before any COD booking. Checkout shows customers "Cash on delivery isn't available with our delivery partner right now. Please pay online." for this case.
- **Scenario orders created on dev and left open for Adloggs to verify** (all status 2 Pending):
  - Online, single seller: `HLT5003701-S1` (fee ₹73, 3.2 km).
  - Multi-seller order (one customer, two shops, two pickup addresses): `HLT5003703-S1` (Indiranagar, ₹73, 3.2 km) and `HLT5003703-S2` (MG Road, ₹125, 7.1 km). This confirms per-seller pickup addresses under one account.
  - Earlier: `HLTEST063988-S1`, Online, cancelled before pickup.
- **Prepared but not sent** (needs COD enabled by Adloggs): a single-seller COD order (collect ₹185), a multi-seller COD order (₹112.50 + ₹202.50 = ₹315.00 order total), and a COD cancel-before-pickup test.

### Webhook for the Adloggs Go-Live validation (4 test cases)

Adloggs' "Integration & Go-Live Guide" requires a webhook registered in their dashboard (Webhook section, with a "Test Webhook" tool) and four validated cases: happy flow, cancel from our side, cancel from the Adloggs dashboard, and RTO. Adloggs specifies no webhook signature or header, so Hello Local uses its own secret:
- `ADLOGGS_WEBHOOK_TOKEN`: at least 32 URL-safe characters (for example `openssl rand -hex 32`), stored only in the server `.env`.
- URL to register: `https://api.hellolocal.in/api/v1/webhooks/adloggs/<ADLOGGS_WEBHOOK_TOKEN>`. The `x-hellolocal-webhook-token` header is also accepted if Adloggs lets us add headers.
- Token comparison is constant-time. A wrong or missing token returns 401 and writes nothing. With the switch off, or no valid token, the endpoint returns 404.
- Receiving webhooks needs only `ADLOGGS_WEBHOOK_ENABLED=true` and the token, not the API key. The live server can receive the test events while the rest of the integration stays off.
- Status codes may arrive as numbers or numeric strings. Events for orders not in our database (API-created test orders) are stored as `UNMATCHED` and acknowledged with HTTP 200.
- Admins see the latest events under Adloggs Integration > "Recent webhook events" (`GET /api/v1/admin/delivery-providers/adloggs/webhook-events`). OTPs, phones and locations are never stored.
- The status model accepts all four Go-Live sequences: skipped intermediate statuses move forward, "Arrived at delivery" -> "RTO Delivered" is applied, and RTO never counts as delivered.
- Note: the token appears in the server's nginx access log (URL). Keep the logs root-only, or ask Adloggs for header support.
