# Fran POS mobile — resume later

Written 2026-08-18 before the Oppo Find N3 was unplugged. Use this instead of re-discovering the last two days of ADB / Stripe / Google SSO.

## Device

- **Phone:** Oppo Find N3 (`CPH2499`, serial `e3f84ff9`)
- **Package:** `com.fran.pos`
- **Last debug APK path:** `dist/android/fran-pos-debug.apk`
- **What that APK loads:** `https://fran-pos.vercel.app` (not this PC). Unplugging USB does **not** blank the register.
- **Do not** reinstall a `CAP_LIVE_URL=http://127.0.0.1:5180` build unless you want live-reload again. That build dies without USB + `adb reverse`.

## Done

- Portrait register: icon member bar + sale-type icons; scan field = type SKU, camera in-field, yellow `+`, bag = catalog.
- Android asks for **Camera** on launch (`MainActivity`).
- Stripe **test** secret is on Vercel as `STRIPE_SECRET_KEY` (Production + Development). Health: `ok`, `livemode: false`, `simulated_ready: true`.
- `.env.local` has `STRIPE_TEST_*` plus a `STRIPE_SECRET_KEY=` alias. **Gitignored. Never commit.**
- Production: `https://fran-pos.vercel.app`
- Google SSO native return path is wired:
  - Redirect: `com.fran.pos://auth/callback` (also keep `https://fran-pos.vercel.app/auth/callback`)
  - Custom Tab for Google (required for 2-step / “yes it’s me” on the same phone)
  - Intent-filter on `com.fran.pos://`
  - `@capacitor/app` + `@capacitor/browser`
- Supabase redirect URLs were saved by Jeremy (confirm they still include the custom scheme).

## Not done / blocked

1. **Prove Google SSO round-trip on the N3**
   - Live mode → Connect Account → Custom Tab → approve phone prompt → must return to Fran POS, not stay in Chrome, not Google 400.
   - If Android asks “Open with”, pick **Fran POS** + Always.
   - In-app WebView Google login **will 400** after the on-device verification notification. Do not “fix” that by stuffing OAuth back into the WebView.

2. **HQ Stripe Terminal settings** (web, signed-in Google)
   - Settings → Integrations → Stripe Terminal
   - Enable
   - Simulated / test mode **ON**
   - Default reader: **Tap on tablet**
   - Paste the sandbox **Location** (`tml_…`) or use **Create location**
   - Save
   - **Check Stripe backend** should say test-mode secret is ready

3. **First test tap on the N3**
   - Native Fran POS only (not Chrome)
   - Must have a **Supabase session** (Google Connect Account). PIN-only Tiffany cannot call `/api/stripe-terminal`.
   - Member or tourist → add a line → Pay → **Tap on tablet**
   - Stripe Tap to Pay **production** reader refuses debug APKs and **Developer options ON**. This debug build **must** stay on **Simulated**.
   - Find N3 is on Stripe’s Tap to Pay device list. There is **no** Sandbox dashboard toggle to “enable Tap to Pay”.

4. **Store / Galaxy Tab APK**
   - Before a counter install: `npm run cap:sync` **without** `CAP_LIVE_URL`, then assemble.
   - That ships bundled HTTPS assets, not Vercel and not this PC.

5. **Optional later**
   - Commit the uncommitted mobile/SSO work if it is still dirty (`capacitor.config.ts` allowNavigation, native OAuth, plugins, manifest).
   - Leave untracked: `.env.vercel.pull`, `scripts/_run_00014_now.mjs`.
   - Webhook `STRIPE_WEBHOOK_SECRET` still unset.
   - ColorOS will not `pm grant` camera without **USB debugging (Security settings)**.

## Resume commands

```powershell
# Device
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"
& $adb devices -l
# Wireless last worked: 192.168.0.208:<port from Developer options → Wireless debugging>
# USB often shows e3f84ff9 offline until the cable + “Allow USB debugging”

# Live-reload (UI only — not for Stripe tap)
# Vite is port 5180 (5173 is fran-web / SUNFALL)
npm run dev
& $adb reverse tcp:5180 tcp:5180
# CAP_LIVE_URL=http://127.0.0.1:5180  (never localhost — Android IPv6)

# Production-loading debug APK (current phone build)
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot"
$env:CAP_LIVE_URL = "https://fran-pos.vercel.app"
npx cap sync android
node scripts/android-gradle.mjs assembleDebug
& $adb push dist/android/fran-pos-debug.apk /data/local/tmp/fran-pos-debug.apk
& $adb shell pm install -r -t /data/local/tmp/fran-pos-debug.apk
& $adb shell am force-stop com.fran.pos
& $adb shell am start -n com.fran.pos/.MainActivity

# Stripe health (no secret printed)
# POST https://fran-pos.vercel.app/api/stripe-terminal  {"action":"health"}
```

`adb install` often hangs on ColorOS. `pm install` from `/data/local/tmp` works. Killing the adb daemon drops `reverse`.

## Files that matter

| Path | Why |
| --- | --- |
| `capacitor.config.ts` | `CAP_LIVE_URL`, https vs http, `allowNavigation` for Google |
| `scripts/android-live.mjs` | `npm run android:live` — 127.0.0.1:5180 + reverse |
| `dashboard/src/lib/native-oauth.ts` | `com.fran.pos://auth/callback` |
| `dashboard/src/providers/auth-provider.tsx` | Google SSO + Custom Tab + deep link |
| `android/app/src/main/AndroidManifest.xml` | Camera, NFC, `com.fran.pos` intent-filter |
| `android/app/src/main/java/com/fran/pos/MainActivity.java` | Keep-awake + runtime camera |
| `api/stripe-terminal.ts` | Server-only `STRIPE_SECRET_KEY` |
| `docs/stripe-terminal-acceptance.md` | Store kit + Stripe checklist |

## Do not

- Put `sk_test_` / `sk_live_` in `VITE_` or the APK.
- Commit `.env.local`.
- Bake `127.0.0.1` into a store APK.
- Expect real (non-simulated) Tap to Pay while USB debugging / a debug APK is on the N3.
