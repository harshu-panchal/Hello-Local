# Product, checkout and delivery repairs

The changes cover seller/admin product entry, customer checkout, seller preparation, courier acceptance and pickup, delivery OTP verification, cancellation, refunds and settlement.

## Customer-visible behavior

- A selected variant uses its own selling price. Another variant's discount no longer overrides it.
- Product drafts stay unpublished. Admins explicitly choose the seller/pickup store; new products no longer create a store with a hardcoded location and password.
- Checkout validates seller approval, delivery coverage, variant availability and coupon restrictions. Applying a coupon now uses the same server quote as placement.
- A changed final price or rejected coupon is presented for confirmation before placement. The payment SDK uses the amount issued by the backend.
- Checkout blocks double submission and persists an attempt key for retries. An existing paid order does not open payment again. A payment awaiting confirmation is left for reconciliation instead of being automatically cancelled.
- Sellers prepare their own items independently. The overall preparation stage follows the least advanced active seller.
- Couriers cannot accept terminal/unpaid orders, bypass seller pickup, or complete delivery through the generic status endpoint. Declining an offer does not cancel the customer's purchase.
- Pickup checks seller membership, preparation, assigned courier and proximity. Pickup progress survives refresh. Customers can refresh a locked delivery OTP.
- Partial COD cancellation reduces cash due. Repeated cancellation does not restore stock or queue the same refund twice. Prepaid cancellation includes the sole-seller path.

## Data and financial consistency

- Placement writes stock reservations, order items, the order and coupon consumption in a MongoDB transaction. Per-customer checkout locks and order attempt keys prevent duplicate creation.
- Per-order transactional locks serialize seller/courier/cancellation/OTP mutations across API processes. Product version checks reject stale edits after stock changes.
- Cancellation/return queues durable refund and commission reversal tasks. Delivery completion queues settlement in the same transaction as completion.
- A background worker retries failed financial tasks. A per-order lease prevents concurrent workers from processing the same order's financial tasks.
- Late captured payments for closed orders queue a refund and do not announce a new confirmed purchase. Recovery also scans for interrupted capture/queue operations.
- Refund retries check gateway refunds for the same operation key and recover an interrupted acknowledgement. Local completed partial-refund checks happen before validating a new amount.
- Missing seller commission records can be repaired individually. New pending commission IDs are deterministic per item. COD settlement excludes cancelled items and respects seller-funded discounts.
- Seller invoices use stored tax snapshots and label tax as included in selling prices. Customer tracking reads GeoJSON store coordinates as well as legacy coordinates.

## Compatibility and deployment

- Existing orders without per-item preparation stages retain a fallback to their saved global stage. Older orders without order-specific delivery OTPs retain the customer OTP fallback until refreshed.
- Existing clients can omit checkout attempt keys and expected totals; the updated UI supplies both. Existing admin assignment/reassignment remains available before pickup.
- The existing production auth test-OTP exception is unchanged.
- MongoDB must support transactions (replica set/Atlas). The codebase already uses transactions for payments and wallets. New collections are `OrderOperationLock`, `OrderEffect` and `OrderFinanceLease`; `Order` gains a partial unique customer/checkout-key index. No destructive data migration is included.
- Retry processing runs in the backend server process every minute and on affected requests. Deploy the backend and frontend together so quote and lifecycle UI changes are available together.
- No production database, payment, SMS or FCM requests were used for validation. Automated tests simulate database transactions and gateways; real replica-set concurrency and a sandbox payment/pickup/delivery run remain deployment checks.

## Verification

- Full regression suite: 510 tests passed, zero failures.
- Latest focused service and payment-component checks: 31 tests passed, including four added cases covering admin preparation, assignment/reassignment, final remaining pickup and customer cancellation after partial pickup.
- Backend and frontend TypeScript checks and frontend Vite production build passed. A final frontend type check was repeated after the order-detail compatibility adjustment.
- `git diff --check` passed. Tests do not connect to production services; transaction/assignment concurrency is exercised through a serialized in-memory harness rather than a real MongoDB replica set.
