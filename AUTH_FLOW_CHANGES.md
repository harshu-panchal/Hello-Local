# Authentication changes

Deploy the frontend and backend together: signup now requires verified phone
ownership through the new signup OTP endpoints.

## Signup

- Seller and delivery: `POST /auth/{role}/send-signup-otp` returns a session ID.
- `POST /auth/{role}/verify-signup-otp` returns a 15-minute registration token.
- Include `registrationToken` in the existing `/register` request. It is bound
  to that phone and role, consumed once, and restored if the account write fails.
- Sellers receive their pending-account session and see the approval screen.
- Delivery applicants see a submission confirmation. Admin activation is still
  required before OTP login. Uploaded documents retain their existing fields.
- Customer signup/login continues through the existing SMS OTP flow.

Login and signup OTPs are separate. Resends replace one challenge atomically;
verification consumes it once and enforces the failed-attempt budget. Legacy
login OTP records and session IDs remain supported during their normal expiry.
The explicitly excluded fixed test OTP behavior remains in place.

## Sessions

- Protected requests validate the token, account existence/status, session
  version, and per-token logout revocation. Pending sellers can access their
  profile, session check, push registration/removal, and logout.
- `GET /auth/session` validates the session and returns current approval status.
- `POST /auth/logout` revokes that token and disconnects its socket room.
- Disabling an account advances its session version. Re-enabling it does not
  restore earlier sessions. Normal profile changes do not advance the version.
- Sockets validate at connection, before incoming events, at token expiry,
  and every 30 seconds while idle to stop stale broadcast subscriptions.
- Each browser portal has independent reactive session state. Navigation and
  cross-tab changes update it. Late unauthorized responses cannot clear a newer
  login or another portal's credentials.
- Logout clears local state immediately; server revocation needs a successful
  network request. A stalled push cleanup does not indefinitely delay revocation.

New `SignupProof` and `RevokedToken` collections use expiry indexes. Account
session versions default to zero, so existing active accounts/JWTs remain
compatible. No account deletion, data rewrite, or unique-index migration is
required.

## Verification

From `backend`, run `npm test` and `npx tsc --noEmit`. From `frontend`, run
`npx tsc --noEmit` and `npx vite build`.

The auth tests exercise the actual UI handlers, services, controllers, model
hooks, and middleware with mocked database/provider boundaries. They cover
signup order, documents, retries, single-use grants/OTPs, concurrent resends and
guesses, account status/reactivation, token revocation, legacy compatibility,
portal navigation, cross-tab notifications, and preserved HTTP errors.

Before deployment, verify real SMS delivery and browser interactions on staging:

1. Register a new seller; verify its OTP; check the pending screen; approve it;
   reload and confirm normal panel access.
2. Register a courier with documents; verify its OTP; confirm the pending message;
   activate it and log in through the normal OTP flow.
3. Log in as a customer, seller, and courier in separate tabs. Switch portals,
   refresh, and log out one portal while the others remain signed in.
4. Disable a signed-in account and confirm API/socket access stops; re-enable it
   and confirm a fresh OTP login is required. Check logout with the old token.
5. Exercise wrong/expired codes, resend cooldowns, provider errors, and retrying
   registration after a failed request.
