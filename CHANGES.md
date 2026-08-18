# Changes

## 2026-08-18 Update

### Summary

Tightened the phone / portrait register so member status and sale type sit in one icon row, made scan vs add vs catalog obvious, and fixed Android debug camera (permission + a dedicated live-reload port).

### What Changed Today

- Portrait register collapses “Fran member required”, Find member, and the five sale-type chips into one icon toolbar. Wide / landscape still uses the full labels.
- Product entry is one row: type SKU in the field, camera icon in the field to scan, yellow + to add the typed code, bag to browse catalog.
- Android asks for Camera at launch so Tap / barcode `getUserMedia` can run after the cashier allows it.
- Debug live-reload uses `CAP_LIVE_URL` (default `http://127.0.0.1:5180`) so it does not collide with sibling Vite apps on 5173. `npm run android:live` bakes that URL; store APKs still omit it and serve bundled HTTPS assets.
- Local Vite `/api` proxies to production so a phone on the live server can reach Stripe Terminal routes.

### Why

The Find N3 vertical register spent most of the screen on member copy and sale-type tags, and Camera / Add / Catalog competed. Debug installs also failed to open the camera or the page when another app held 5173 or Android resolved `localhost` over IPv6.

### Verification

- Portrait and desktop register screenshots via headless Chrome after demo PIN login.
- `tests/live-demo-mode.test.mjs` and `tests/stripe-terminal.test.mjs` passed.
- Live debug APK installed on the Find N3 with `adb reverse tcp:5180`.

### Deployment

- Production app: `https://fran-pos.vercel.app`
- Store / Galaxy Tab APKs: run `npm run cap:sync` without `CAP_LIVE_URL` before assemble so they ship bundled files, not the PC live URL.

---

## 2026-08-14 Update

### Summary

Wired Fran POS for Stripe in-person acceptance on the store kit: Samsung Galaxy Tab as the cashier register, Stripe S700 as the customer card reader, and Tap to Pay on tablet as backup only.

### What Changed Today

- Added server-side Stripe Terminal routes at `/api/stripe-terminal` and `/api/stripe-webhook`. Connection tokens, PaymentIntents, S700 `process_payment_intent`, reader register/status, and cancel stay on the server. The Stripe secret key is never sent to the tablet.
- Added Settings → Integrations → Stripe Terminal so a store can enable Terminal, set a location, register an S700 pairing code, and health-check the backend.
- Pay on the register now offers **S700 reader** first. The Galaxy Tab stays on the cashier UI while the customer taps, inserts, or swipes on the S700.
- Added **Tap on tablet** as a backup path through the native Android Terminal SDK (`@capgo/capacitor-stripe-terminal`). It only appears inside the Fran POS APK on a Stripe-attested device.
- Simulated mode uses Stripe test helpers so Stripe review can finish a sale without hardware.
- POS header shows **S700 ready / offline** so cashiers see the reader before they charge.
- Galaxy Tab APK keeps the screen awake on the counter, allows large/xlarge screens, and includes NFC plus Bluetooth permissions for Terminal.
- Documented the store kit and Stripe checklist in `docs/stripe-terminal-acceptance.md`.

### Why

Stores will run Fran POS on Galaxy Tabs next to an S700. Cards should be taken on the reader, not on the tablet screen. Stripe acceptance also needs a real connection-token and PaymentIntent path, a simulated reader, cancel/retry, and field registration.

### Verification

- Dashboard production build passed locally.
- Stripe unit tests passed: 6/6 (`tests/stripe-terminal.test.mjs`).
- Capacitor Android sync picked up `@capgo/capacitor-stripe-terminal@8.0.3`.

### Deployment

- Production app: `https://fran-pos.vercel.app`
- After deploy, set `STRIPE_SECRET_KEY` (`sk_test_…` for review) and optionally `STRIPE_WEBHOOK_SECRET` on Vercel. Pair the store S700 in Settings → Integrations.

---

# Changes - Week Ending 2026-05-28

## 2026-05-28 Update

### Summary

Prepared POS for the LISE demo path where staff can sign in with Google, read sellable catalog data from SKUMS, and send completed SKUMS-backed sales back to the SKUMS API.

### What Changed Today

- Connected POS catalog loading to SKUMS through `GET /api/v1/pos/catalog`.
- Added SKUMS sale write-back through `POST /api/v1/pos/sales` for SKUMS-backed carts.
- Reworked the SKUMS connector so each POS company stores its own SKUMS API URL and account key in company settings.
- Added a SKUMS Connector setup flow in Products and Settings, so users can paste the SKUMS URL/key before importing.
- Kept the mock catalog fallback so POS can still run when a company has not connected SKUMS.
- Added Google SSO to the POS login and registration screens.
- Added `/auth/callback` to complete Supabase Google OAuth redirects.
- Added `/onboarding` so a Google-authenticated POS user without a company/profile can create the POS company, owner profile, settings row, and default cash payment method.
- Updated protected routing so authenticated users without a company are sent to onboarding instead of landing on a broken dashboard state.

### Why

POS needs to be usable by staff without manual account-password setup, while still keeping SKUMS as the product source of truth. Google SSO handles staff access to POS; the SKUMS connector key handles product/catalog integration for the demo.

### Verification

- POS tests passed: 9/9.
- POS production build passed locally.
- Latest pushed POS app commit before this changelog: `befb3ad Add POS Google SSO onboarding`.

### Deployment

- Production app: `https://pos-alpha-eight.vercel.app`
- The deployment step should use a clean checkout because the local working tree currently has an unrelated uncommitted dashboard-page edit.

## Summary

This week moved the POS app from a standalone demo checkout toward a SKUMS-compatible checkout surface. POS can still run with mock products, but it now has the code path needed to read sellable products from SKUMS and write completed sales back to SKUMS.

## Why

LISE Beauty needs staff to upload product spreadsheets in SKUMS and then see those products available for checkout in POS. Product master data should live in SKUMS, not be duplicated manually inside POS. POS should remain focused on register operations, cart handling, payments, receipts, returns, stock views, and sales workflows.

## SKUMS Catalog Loading

- Added `listSkumsPosCatalog()` to the SKUMS client.
- POS now calls `GET /api/v1/pos/catalog` using the SKUMS API URL and account key saved on the POS company settings.
- Catalog products are converted into POS product cards with:
  - SKU
  - display name
  - category
  - list/unit price
  - stock quantity
  - SKUMS graph references
- POS keeps the existing mock catalog fallback when SKUMS connector settings are absent or the SKUMS catalog is unavailable.

## SKUMS Sale Write-Back

- Completed sales created from a SKUMS-backed catalog are sent to `POST /api/v1/pos/sales`.
- Cart lines carry optional SKUMS graph references so sales can reference:
  - product identity
  - trade unit
  - listing
  - channel
  - SKU assignment
  - identifier
  - product and variant IDs
- Existing mock POS behavior remains intact for local/demo mode.

## Shared Types And Tests

- Added shared POS catalog response types.
- Extended contract tests to cover:
  - catalog client route
  - shared catalog item types
  - sale adapter behavior
  - POS page loading SKUMS catalog while retaining mock fallback

## Google Account / Database Migration Prep

- Added Supabase replication/bootstrap notes for preparing a POS database under another Google account.
- These files support a future account/database migration but do not change runtime POS behavior.

## Verification

- POS tests passed: 5/5.
- POS production build passed on Vercel.
- Production deployment completed:
  - `https://pos-alpha-eight.vercel.app`
  - latest deployment `https://pos-b900pmok3-wytanjs-projects.vercel.app`

## Known Follow-Ups

- SKUMS account keys are currently stored in POS company settings and used by the browser. This is acceptable for the demo but should become backend-mediated, session-bound, or device/register-scoped before production use with real customers.
- POS still reports npm audit vulnerabilities during install.
- POS still has large bundle warnings from the production build.
