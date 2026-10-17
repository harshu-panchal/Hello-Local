# Advertisement flow changes

Customer, seller, admin and payment code now share the same advertisement lifecycle.

## Customer experience

- Stored `/products?category=...` advertisement links resolve to the existing category page. Direct visits to the old URL are also supported, and unmatched customer routes have a fallback.
- Sellers can set their destination and button text. An empty destination opens that seller's existing store page. Existing ads without a destination fall back to the store directory.
- External HTTP/HTTPS links open in a new tab with `noopener,noreferrer`. Unsafe URL schemes and protocol-relative links are rejected.
- Popup and carousel ads refresh every 15 seconds, with request deduplication and a 10-second client cache. Known expiry is checked every second and again on window focus. Failed requests hide ads rather than insert sample campaigns.
- Hover still pauses the popup's display timer, and carousel autoplay continues after a swipe. Opening chat hides the popup; its normal position leaves room for the collapsed chat button.
- Campaigns remain global, matching the existing business behavior. No category or location targeting was introduced.

## Seller, admin and payments

1. Seller submits content, duration and preferred date. Pending-review dates are provisional.
2. Admin approves the request and confirms the price. Capacity is reserved for approved requests.
3. Seller either uses **Pay Online** or submits UPI/bank payment proof. Selecting a manual payment method does not pretend to launch a gateway.
4. Online payment is verified against the issued Razorpay intent, captured amount and currency. A webhook can recover payment when browser verification never arrives. Replay and duplicate-payment protections remain in place.
5. Admin reviews a `PaymentPending` or paid `PaymentVerified` request and activates it. Repeated activation returns the same linked ad.
6. The resulting state is `Scheduled` or `Live`; later it becomes `Expired`. Disabling/deleting the ad updates the seller to `Paused`/`Removed`, preserving payment history. Management reads reconcile older inconsistent linked records using optimistic update guards.

## Scheduling and data integrity

- Advertising dates use the India calendar, independent of the server timezone. End dates are exclusive.
- Delayed approval/activation moves the window forward and preserves the purchased number of calendar days.
- Capacity-changing writes and ad-payment capture use MongoDB transactions with a shared schedule-lock document. This serializes competing requests across backend processes and rolls back partial activation.
- Cosmetic edits preserve dates. Re-enabling a future campaign preserves its duration. Expired ads require explicit new dates before renewal.
- Legacy normalization never extends an existing expiry. It runs only within management write transactions. The public active-ad endpoint performs no database writes and returns only public content fields.
- Duration is bounded to 1–365 whole days and invalid dates/unsafe destinations are rejected.

## Verification and rollout

Verification completed: **480 tests passed, 0 failed**; frontend and backend TypeScript checks passed; the production frontend build passed. Tests cover scheduling, competing bookings, duplicate activation, online payment recovery, financial field/schema regressions, public-field projection, legacy links, refreshed/expired ads, popup timers and carousel behavior. Concurrency and database behavior are tested with isolated mocks; a real replica-set deployment remains part of staging verification.

Deploy backend and frontend together because the UI recognizes the additional lifecycle states. MongoDB must support transactions (a replica set or sharded deployment), as the existing gateway-payment code already requires. No database seed/reset script is needed for legacy links or status reconciliation.

No production database writes, real Razorpay charges, SMS sends or production deployment were performed during this implementation. A staging smoke test with a real browser, a replica-set database and Razorpay test credentials remains necessary before release. Existing overbooked historical campaigns should be reviewed in the admin calendar; customer reads no longer silently move their paid schedules.
