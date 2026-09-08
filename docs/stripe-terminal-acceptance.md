# Stripe Terminal acceptance â€” Galaxy Tab + S700

Store hardware kit:

- **Samsung Galaxy Tab** runs Fran POS (cashier catalog, member, cart, receipt)
- **Stripe Reader S700 / S710** sits next to the tab and takes tap / insert / swipe
- **Tap on tablet** is backup only if the S700 is offline (and only on Stripe-attested Galaxy models such as Tab Active5)

Fran POS is wired for Stripe's in-person review on:

- **Stripe Reader S700 / S710** (server-driven from the Galaxy Tab)
- **Tap to Pay on Android** (native Stripe Terminal SDK via `@capgo/capacitor-stripe-terminal`)

The Stripe **secret key never leaves the server**. Connection tokens, PaymentIntents, and S700 `process_payment_intent` all go through `/api/stripe-terminal`.

## What Stripe reviewers can do

| Path | How it collects |
| --- | --- |
| Register â†’ Pay â†’ **Stripe S700** | Creates a `card_present` PaymentIntent, sends it to the registered reader, waits for `reader.action` succeeded |
| Register â†’ Pay â†’ **Tap to Pay** | Same PaymentIntent, then the Android SDK takes over NFC on this device |
| Simulated on | Uses Stripe test helpers (`present_payment_method`) so a sale can complete without hardware |

Sale outcomes are unchanged: member/tourist still required, loyalty still commits after payment, failed Stripe collection does not add a tender.

## Server env (Vercel)

| Variable | Required | Purpose |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | yes | `sk_test_â€¦` for acceptance, `sk_live_â€¦` after go-live |
| `SUPABASE_URL` or `VITE_SUPABASE_URL` | yes | Validates the cashier/HQ JWT |
| `SUPABASE_ANON_KEY` or `VITE_SUPABASE_ANON_KEY` | yes | Same |
| `STRIPE_WEBHOOK_SECRET` | recommended | `whsec_â€¦` for `/api/stripe-webhook` |

Optional: `VITE_STRIPE_API_BASE` if the dashboard is served from a host that cannot reach `/api` on the same origin.

## Stripe Dashboard setup

1. Request **Tap to Pay on Android** for the account (Singapore is supported).
2. Create a Terminal **Location** (Settings â†’ Integrations â†’ Create location, or Stripe Dashboard).
3. Register the S700:
   - Hardware: three-word pairing code from the reader admin menu
   - Simulated: registration code `simulated-wpe`
4. Paste Location ID (`tml_â€¦`) and Reader ID (`tmr_â€¦`) into POS â†’ Settings â†’ Integrations â†’ Stripe Terminal.
5. Enable **Simulated / test mode** for acceptance. Turn it off only on live hardware.
6. Add a webhook endpoint `https://<host>/api/stripe-webhook` for:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `terminal.reader.action_succeeded`
   - `terminal.reader.action_failed`
   - `charge.refunded`

## Acceptance checklist mapped to this app

| Stripe requirement | Fran POS |
| --- | --- |
| Connection tokens from backend | `POST /api/stripe-terminal` action `connection_token` |
| Secret key never in the client | Only `STRIPE_SECRET_KEY` on Vercel |
| Location on token / connect | Location ID saved on the company; passed into token + Tap to Pay discover |
| Simulated reader | Simulated toggle + `present_simulated_method` |
| Capture | PaymentIntents use `capture_method=automatic` |
| Errors / retry | Payment modal shows the Stripe error and keeps the cart; cashier can retry the same amount |
| Cancel mid-collect | Cancel / mark failed cancels the reader action and the PaymentIntent |
| Receipts | Existing POS receipt + email connector after Complete & Print |
| Register readers in the field | Integrations â†’ Register S700 pairing code |
| S700 software updates | Smart readers update themselves when online |
| Tap to Pay device rules | Android 13+, NFC, Play services, not rooted; APK `minSdk` 26, runtime 33+ |

## Android APK

```bash
npm install
npm run build:android:sync
```

The sync pulls `@capgo/capacitor-stripe-terminal` into `android/`. Rebuild the debug APK as usual.

Pay opens on the **S700** by default so the Galaxy Tab never leaves the cashier UI.

Tap on tablet only appears when:

- Stripe Terminal is enabled
- The app is the native Android shell (`com.fran.pos`)
- The Galaxy Tab is on Stripe's Tap to Pay device list (many consumer Tabs are not)

S700 still works from the **web** register as long as the reader is online and registered.

## Local API

Vercel production serves `/api/stripe-terminal`. For local full-stack:

```bash
npx vercel dev
```

Then open the dashboard URL that `vercel dev` prints so `/api` and the SPA share a host.

## After Stripe approves live

1. Replace `STRIPE_SECRET_KEY` with `sk_live_â€¦`
2. Turn **Simulated** off
3. Register the production S700 at the store location
4. Confirm the webhook is on the live endpoint
5. Run one live tap on S700 and one Tap to Pay on a supported Android device

---

## Related

- Dual-tab + 3×S700 roadmap: [docs/SCREEN_A_B_PLAN.md](./SCREEN_A_B_PLAN.md)
