# Fran POS Tap to Pay debrief

**Date:** 2026-08-19  
**Repo:** `C:\Users\Jeremy Tan\CodeProjects\fran-pos`  
**Goal:** Real NFC Tap to Pay on an Oppo Find N3 that creates a **Stripe Test mode** charge (not the silent 4242 helper, not live money).  
**Last user state:** Stuck on payment spinner **2/5 Requesting a Stripe connection token**.

Pass this file to the next agent. Do not restart from “enable location” or “add a logout button” — those are already done.

---

## RESOLVED 2026-08-19 (afternoon session)

**Root cause of every “stuck at 2/5 / 3/5” hang:** the Capacitor plugin proxy is a
fake thenable. `registerPlugin`’s Proxy fabricates a method for *every* property —
including `then` (`node_modules/@capacitor/core/dist/index.js`, the proxy `get`
only special-cases `$$typeof` / `toJSON` / `addListener` / `removeListener`). Our
`terminalApi()` was an async function that returned the proxy, so the promise
resolution procedure called `StripeTerminal.then(resolve, reject)` as a native
bridge method, which never invokes either callback → the `await` hung forever with
no error, while timers kept running. `initTapToPay` / `ensureTapToPayReady` also
returned the proxy through async functions (same trap, three more copies).

**Fix (JS-only, deployed to Vercel — no APK rebuild needed):**
- `terminalApi()` is now synchronous; nothing awaits it and no async function
  returns the proxy. Regression assertions in `tests/stripe-terminal.test.mjs`.
- Dynamic `import('@capgo/capacitor-stripe-terminal')` replaced by a static import.
- Server-side breadcrumbs: `logTapToPayTrace()` posts `client_log` notes to
  `/api/stripe-terminal`; every step, watchdog firing, and error message shows in
  `npx vercel logs` — no logcat or screen transcription needed.
- Payment-modal setup watchdog raised 18s → 60s so per-step errors surface.
- `collectTapToPay` no longer re-runs `ensureTapToPayReady` (was a full
  disconnect + re-discover + re-connect, ~10s wasted per charge).

**Confirmed working:** real NFC tap on the Find N3 (signed release APK, Developer
options off) — token → initialize → discover → connect → tap collected → Stripe
responded. The tap declined with “Your request used a real card while testing”,
which is test mode working as designed. Note: test mode does NOT support Apple/
Google Pay wallets, real cards always decline, and Stripe physical test cards only
work with pre-certified readers (S700), not phone Tap to Pay. A successful
end-to-end tap therefore requires live mode (small charge + refund); the test-mode
decline is the maximum proof available on the phone.

---

## What we are building

Capacitor 8 Android shell `com.fran.pos` wraps the Vite React dashboard. Store APKs load **https://fran-pos.vercel.app** (`android/app/src/main/assets/capacitor.config.json` `server.url`). Web deploys change POS behaviour without a new APK. Native Stripe Terminal (`@capgo/capacitor-stripe-terminal`) only changes when you rebuild the APK.

Stripe secret stays on the server (`api/stripe-terminal.ts`). Health check:

```text
POST https://fran-pos.vercel.app/api/stripe-terminal
{"action":"health"}
→ {"ok":true,"livemode":false,"simulated_ready":true}
```

Vercel is on `sk_test_`. All in-person intents are `card_present`.

---

## Hardware and accounts

| Item | Value |
| --- | --- |
| Phone | Oppo Find N3, model **CPH2499**, serial **e3f84ff9** |
| NFC coil | **Back / camera side**, not the inner fold screen |
| Find N3 | On Stripe’s supported Tap to Pay Android list |
| Tester Google | `variants.app@gmail.com` (new Fran workspace created mid-session) |
| Earlier Google | Already signed in; lock terminal did not sign out Google |
| Stripe location | User set Terminal location to **252 Onan Road** in Stripe Dashboard |
| USB ADB | ColorOS `adb install` hangs; use `adb push` + `pm install -r` |
| Wireless ADB | Port changes every toggle. Last live port: **192.168.0.208:43453**. Previous: `:42419`, `:37519` |
| USB “File transfer / Android Auto” | MTP only. **Does not give ADB.** Need USB debugging or wireless debugging |

---

## Constraints the user already set

- Do not change POS user-flow outcomes for visual work.
- Stripe secret never in the client.
- Store / Galaxy Tab prefers **S700**; phone is Tap to Pay backup.
- Do not bake a live PC URL into store APKs.
- Do not commit `.env.local` / secrets / the release keystore.
- Debug APK + Developer options **block real** Tap to Pay (Stripe rule).
- User wants a **real NFC tap** that lands as a **test charge**, not simulated 4242.

---

## Current install on the phone

Signed **release** APK installed **2026-08-19 02:36:36**.

- Path on PC: `dist/android/fran-pos-release.apk`
- `pkgFlags` do **not** include `DEBUGGABLE`
- Signed with a **new Fran POS keystore** (not the Android debug cert)
- Previous debug-signed release was uninstalled first (signature change). User had to Google-login again.

Keystore (gitignored):

- `android/keystore/fran-pos-release.jks`
- `android/key.properties`
- Alias: `fran-pos`
- SHA-256: `AA:FD:B4:E9:5A:8B:EE:C4:30:C8:21:C2:BD:C0:ED:1D:82:31:86:2A:1A:BE:23:74:F7:A7:CC:18:C6:3A:82:3F`
- SHA-1: `4E:24:32:C8:83:AA:0B:C7:AB:E6:96:BE:22:C5:28:7F:3C:54:DB:F1`

`android/app/build.gradle` release signing reads `android/key.properties`. `*.jks`, `android/key.properties`, and `android/keystore/` are gitignored.

---

## Production web

Latest relevant alias: **https://fran-pos.vercel.app**  
Last deploy in this session used hashed bundle `index-CfqszYgM.js` (token-first 2/5 split). Confirm current hash from `https://fran-pos.vercel.app/` if you need to know what the phone loaded.

APK does not need rebuild for JS-only POS changes. User must **fully close and reopen** Fran POS so the WebView drops the old bundle.

---

## How the tap path works now

Payment: native Credit/Debit → `stripe_tap` (`payment-modal.tsx`).

`collectStripeInPerson` (`dashboard/src/pos/lib/stripe-collect.ts`):

1. For tap: `ensureTapToPayReady` **before** creating a PaymentIntent.
2. Then create PI (`create_payment_intent`).
3. Then `collectTapToPay` (collect + confirm).

`initTapToPay` / `ensureTapToPayReady` (`dashboard/src/pos/lib/stripe-tap-to-pay.ts`) after the last deploy:

1. **2/5** `createStripeConnectionToken` (HTTP only — plugin not loaded yet).
2. **3/5** load `@capgo/capacitor-stripe-terminal` (8s timeout), attach token listener, `initialize({ isTest: false })`, UX config.
3. Disconnect any existing reader.
4. **4/5** discover Tap to Pay readers (15s, event + promise).
5. **5/5** `connectReader`.

**Critical:** plugin `isTest` is **`TapToPayDiscoveryConfiguration(isSimulated)`**, not Stripe test/live. Stripe test/live is the server `sk_test_` / `sk_live_` key.

- `isTest: true` → simulated reader, **no real NFC tap**.
- `isTest: false` → real NFC. Required for the user’s test.

We currently ship `initialize({ isTest: false })`.

`callStripeTerminal` (`dashboard/src/pos/lib/stripe-terminal-api.ts`): caches JWT 30s, `Promise.race` 12s fetch timeout (do not rely on `AbortController` alone — Android WebView abort is flaky).

POS Live login has **Use another Google account** (`dashboard/src/pos/pages/pos-login.tsx`). Lock terminal still only clears staff PIN, not Google.

---

## Chronology — what we tried, what it actually was

### 1. Unfolded N3 could not tap Tourist / Close

Dialog overlay, `fran-overlay-root` pointer-events, `min-h-dvh`, member-rewards Dialog after Tourist, product input `autoFocus` + keyboard/inert.

**Fix:** in-flow full-page member lookup (not Dialog). Tourist/Non-member on strip with `stopPropagation`. Sale page inert while lookup open. Product autofocus removed.

**Result:** user could add product and proceed.

### 2. Credit/Debit was fake card, not Stripe Tap to Pay

`visiblePaymentModes` hid `stripe_tap` unless HQ Stripe was on.

**Fix:** native Android shows `stripe_tap` even if HQ Stripe connector is off. Fake `card` only if neither Stripe nor tap.

### 3. `cannot read properties of undefined`

Unguarded `readers` / `locations` / plugin.

**Fix:** array guards in tap-to-pay + API helpers.

### 4. User saw Oppo NFC sheet + iPhone ready

`collectPaymentMethod` **did start** at least once (earlier in the session, likely while `isTest` / discover still produced a reader). NFC is on the **back**.

### 5. “Test transaction” vs “tap as a test”

First implementation used Stripe test helper / `simulated-wpe` / 4242-style silent present.

User rejected that. They want **real NFC** + **test-mode charge**.

### 6. Spinner stuck: Opening / Location / PaymentIntent

Stacked hangs:

- ColorOS `geolocation.getCurrentPosition` hung → `requestLocationForTapToPay` made a no-op; `MainActivity` still requests CAMERA + FINE/COARSE on launch.
- `initialize({ isTest: false })` on **debug** APK hung or never discovered (Stripe: non-simulated TTP forbids debuggable apps **and** Developer options).
- We then set `isTest: true` so initialize would complete. That is **simulated hardware**. Collect then waited forever for a tap that never comes. UI still said “Creating PaymentIntent” because status was not updated until after init.
- `create_payment_intent` fetch had no timeout; later added 12s race.
- Dialog waiting UI had a **static** “if this sits more than 15 seconds…” line. Spinner never stopped. User thought a timeout had fired.

**Fixes:** status updates; payment-modal watchdog (18s setup / 90s while “Hold the…”); `chargeGen` so a late success cannot commit after cancel; `waitElapsed` seconds on spinner.

### 7. No way to redo Google login (Live)

`lockTerminal` only `setUser(null)`. Live login showed company + PIN, no sign-out.

**Fix:** **Use another Google account** on Live (and Demo connected). `signInWithGoogle` already has `prompt: select_account`. `signOut` clears `pos_active_company` + Stripe auth cache.

User logged out, created workspace with `variants.app@gmail.com`. Still hung on PaymentIntent / later 15s discover.

### 8. Vercel logs after every later Charge

Almost every attempt after the numbered-step work:

```text
POST /api/stripe-terminal  200  {"stripe_terminal_action":"list_locations"}
```

**Never** (in the later window):

- `connection_token`
- `create_payment_intent`

So the client dies **after** `resolveTapToPayConfig` → `list_locations` and **before** a token or PI is created.

That is why 2/5 was the last visible step: the UI set “Requesting token” then called `initTapToPay`, which **loaded the native plugin first**, then fetched the token. Hang on plugin import / native `initialize` looks like “stuck on 2/5” and produces **no** `connection_token` log.

Last JS deploy moved token fetch **before** plugin load and retitled:

- 2/5 = HTTP `connection_token` only  
- 3/5 = load plugin + `initialize({ isTest: false })`  
- 4/5 = discover  
- 5/5 = connect  

**User has not confirmed a Charge after that last deploy.** Next agent should ask which numbered line they stop on **after** a full app kill + reopen.

### 9. “Location is allowed, 15s test failed”

Stripe docs (connect-reader, Tap to Pay Android):

- Discover checks NFC, Android 13+, hardware keystore, **app not debuggable**.
- You **cannot** use non-simulated TTP with a **debuggable app** or with **Developer options enabled**.
- To test integration on a debug build, set `isSimulated: true`. Real tap requires release + Developer options **off**.
- Connect also checks: not rooted, security patch in last 12 months, GMS + Play Store, unmodified OEM OS, **Developer options disabled**.

Find N3 is supported. Location permission was a red herring once it was granted.

### 10. Release APK, still 15s fail

First “release” APK was `debuggable=false` but **signed with `signingConfigs.debug`**. Stripe / Play Integrity still treats debug-cert sideloads as insecure.

Rebuilt with real keystore, uninstalled old app, installed signed APK, launched.

### 11. USB debugging vs Developer options

User turned off USB debugging but left **Developer options + wireless debugging ON**. Confirmed via:

```text
development_settings_enabled=1
adb_enabled=0
adb_wifi_enabled=1
NFC mState=on
```

Wireless ADB still connected. Stripe treats that as Developer options on.

User then turned Developer options off, restarted, still same 15s / later 2/5.

### 12. Native plugin swallows discover failure

`node_modules/@capgo/capacitor-stripe-terminal/.../StripeTerminal.kt` `onDiscoverReaders` `onFailure` only `Log.d`. JS never got the Stripe error code (attestation, insecure environment, etc.). Discovery promise is `RETURN_CALLBACK` and may never settle if no readers.

**Patched in node_modules** (will be lost on `npm install` unless re-applied):

- `onFailure` → `call.reject(code + message)`
- `onSuccess` with empty list → reject

This patch is in the **signed APK already on the phone**. Re-apply after any `npm install` / `cap sync` before the next APK.

---

## Files that matter (uncommitted unless someone committed)

POS / Stripe JS:

- `dashboard/src/pos/lib/stripe-tap-to-pay.ts`
- `dashboard/src/pos/lib/stripe-collect.ts`
- `dashboard/src/pos/lib/stripe-terminal-api.ts`
- `dashboard/src/pos/lib/stripe-connector.ts`
- `dashboard/src/pos/components/payment-modal.tsx`
- `dashboard/src/pos/pages/pos-login.tsx`
- `dashboard/src/providers/auth-provider.tsx` (`clearStripeAuthCache` on signOut)
- `dashboard/src/lib/native-oauth.ts`
- `api/stripe-terminal.ts` (logs `{ stripe_terminal_action }`)

Android:

- `android/app/build.gradle` (release signing)
- `android/app/src/main/java/com/fran/pos/MainActivity.java` (CAMERA + location on launch)
- `android/app/src/main/AndroidManifest.xml` (NFC, location, BT)
- `android/app/src/main/assets/capacitor.config.json` (live URL to Vercel)
- Patched plugin: `node_modules/@capgo/capacitor-stripe-terminal/android/src/main/java/app/capgo/stripe/terminal/StripeTerminal.kt`

Tests:

- `tests/stripe-terminal.test.mjs`
- `tests/live-demo-mode.test.mjs`

Member lookup (earlier, working):

- `dashboard/src/pos/fran/components/fran-customer-modal.tsx`
- `dashboard/src/pos/fran/components/fran-member-strip.tsx`
- `dashboard/src/pos/pages/sale.tsx`
- `dashboard/src/components/ui/dialog.tsx`

---

## Commands that work on this machine

```powershell
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

# JS only (phone picks up after force-close)
npx vercel --prod --yes

# Native APK
npm run android:assemble:release
# → dist/android/fran-pos-release.apk

# ColorOS install (wireless or USB ADB)
adb connect 192.168.0.208:<PORT_FROM_PHONE>
adb -s 192.168.0.208:<PORT> push dist\android\fran-pos-release.apk /data/local/tmp/fran-pos-release.apk
adb -s 192.168.0.208:<PORT> shell pm install -r /data/local/tmp/fran-pos-release.apk
adb -s 192.168.0.208:<PORT> shell am start -n com.fran.pos/.MainActivity

# Logs
npx vercel logs --environment production --no-follow --no-branch --since 1h --json
```

Wireless port is on the phone: Settings → Developer options → Wireless debugging → **IP address & port**. Scanning 30000–50000 found `43453` (ADB) and `46888` (often pairing / not ADB).

`adb install` on ColorOS often hangs. Prefer `push` + `pm install`.

After a **keystore change**, `pm install -r` fails; `adb uninstall com.fran.pos` first. User must Google login again.

---

## What is actually still broken

**Real Tap to Pay discover/connect has not succeeded on the signed release with Developer options off.**

Strongest remaining hypotheses (in order):

1. **Stuck in native plugin load / `initialize({ isTest: false })`** after `list_locations`, before or instead of `connection_token`. Last 2/5 report matches “plugin first, token second” (now inverted in JS). Confirm with a new Charge + Vercel log: if `connection_token` appears, 2/5 is fixed and the hang moved to 3/5+.

2. **Connection token listener never feeds Stripe.** Native `TokenProvider` emits `terminalRequestedConnectionToken`; JS must `setConnectionToken`. If the event is missed, discover hangs. Prefetch stores a secret in JS; listener should pass it through. `setConnectionToken` **rejects** if Stripe has no pending callback (`Stripe Terminal do not pending fetchConnectionToken`).

3. **Play Integrity / sideload attestation.** Even a non-debug, custom-keystore sideload can fail TTP. Stripe may require Play distribution or registering package `com.fran.pos` + SHA-256 in their TTP onboarding. Plugin used to swallow `onFailure`, so this would look like a 15s timeout.

4. **ColorOS contactless default.** Settings → Connection & sharing → NFC → Contactless payments must not be locked to Wallet only. Other apps need NFC.

5. **Security patch older than 12 months** (Stripe connect-time check).

6. **Stripe account Tap to Pay not enabled** for the test account (historically “account not enabled for tap on mobile”). Would show in native reject now that `onFailure` rejects.

7. **Stale WebView JS.** User must force-close the app after every Vercel deploy.

Do **not** switch back to `isTest: true` unless the user agrees to a simulated tap. They already rejected that.

---

## What the next agent should do first

1. Ask the user to **force-close Fran POS**, reopen, Charge once, and report the last `1/5`–`5/5` line **and** any red error under the spinner.
2. Pull `npx vercel logs --environment production --no-follow --no-branch --since 30m --json`.
   - Only `list_locations` → still dying before token (auth, plugin import, or they did not reload JS).
   - `list_locations` + `connection_token` → token works; hang is native initialize/discover.
   - `create_payment_intent` → reader connected; hang is collect/confirm.
3. If you need logcat: user must briefly turn **Wireless debugging** on, `adb connect`, `adb logcat` filter `Stripe` / `TapToPay` / `TerminalException` / `Capacitor`. Then they must turn **Developer options off** again before a real tap.
4. Re-apply the Kotlin `onFailure` patch if `node_modules` was reinstalled, then rebuild **release** with the Fran keystore (not debug).
5. If native error is attestation / insecure environment: either Play internal testing track or Stripe TTP app registration with `com.fran.pos` + SHA-256 above. Sideload + debug cert is already ruled out.
6. Confirm ColorOS NFC contactless payments allows third-party apps.
7. Do not spend time on Tourist hit-testing, logout, or 4242 helpers unless the user asks.

---

## Useful Stripe doc quotes

From [Connect to a reader — Tap to Pay Android](https://docs.stripe.com/terminal/payments/connect-reader?terminal-sdk-platform=android&reader-type=tap-to-pay):

- Discover: NFC, ARM, Android 13+, hardware keystore, **application isn’t debuggable**.
- App must be in the **foreground**.
- “You can’t use the non-simulated, production version of the Tap to Pay reader with debuggable applications or with the device’s developer options enabled.”
- Official sample sets `isSimulated = isApplicationDebuggable`.
- Connect: not rooted, security update &lt; 12 months, GMS + Play Store, stable internet, unmodified OS, SDK 2.20+, **Developer options disabled** for non-simulated.

---

## Do not commit

- `android/key.properties`
- `android/keystore/fran-pos-release.jks`
- `.env.local` / Stripe / Supabase secrets
- Optional: ask the user before committing the large POS/Stripe JS + Android gradle change set
