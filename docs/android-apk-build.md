# Android APK Dist Build

Fran POS ships the **same Vite web app** as both:

| Target | Output | Command |
|--------|--------|---------|
| Web | `dashboard/dist` → Vercel | `npm run build:web` |
| Android APK | `android/app/build/outputs/apk/` | `npm run build:apk:debug` |

Capacitor wraps `dashboard/dist` in a native WebView shell (`com.fran.pos`). There is no React Native / Ionic rewrite.

## Folder layout

```text
fran-pos/
  capacitor.config.ts      # appId, webDir → dashboard/dist, APK releaseType
  dashboard/
    dist/                  # Vite production build (shared by web + Android)
  android/                 # Capacitor Android project (generated, tracked)
  scripts/
    android-gradle.mjs     # cross-platform gradlew runner
  docs/
    android-apk-build.md   # this file
```

## Prerequisites (APK compile only)

Web build needs only Node. APK compile needs:

1. **JDK 17 or 21** (Temurin/OpenJDK recommended) with `JAVA_HOME` set
2. **Android SDK** with platform 36 + build-tools
3. Env vars (example for Windows PowerShell):

```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.x.x-hotspot"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
```

4. Accept licenses once (after cmdline-tools are installed):

```powershell
sdkmanager --licenses
```

**This machine currently has no `JAVA_HOME` / Android SDK.** Install JDK + Android Studio (or command-line SDK), then re-run `npm run build:apk:debug`.

Android Studio is optional for editing but convenient (`npm run android:open`).

## Day-to-day commands

```bash
# Web only (existing path)
npm run build:web

# Rebuild web + copy into android/ assets
npm run build:android:sync

# Debug APK (unsigned / debug-signed, installable on devices with USB debug)
npm run build:apk:debug

# Release APK (needs signing config — see below)
npm run build:apk:release

# Open in Android Studio
npm run android:open
```

### Output paths

| Build | Gradle output | Published dist |
|-------|---------------|----------------|
| Debug | `android/app/build/outputs/apk/debug/app-debug.apk` | `dist/android/fran-pos-debug.apk` |
| Release | `android/app/build/outputs/apk/release/app-release.apk` | `dist/android/fran-pos-release.apk` |

`scripts/android-gradle.mjs` copies the APK into `dist/android/` after a successful assemble so sideload/CI has a stable path.

## First-time scaffold (already done if `android/` exists)

```bash
npm run build:web
npx cap add android
npx cap sync android
```

After any web change that should land in the APK:

```bash
npm run build:android:sync
```

## Release signing

For store or sideload release APKs, create a keystore and either:

**Option A — Capacitor env vars** (used by `npx cap build android`):

```powershell
$env:CAPACITOR_ANDROID_KEYSTORE_PATH = "C:\secrets\fran-pos.keystore"
$env:CAPACITOR_ANDROID_KEYSTORE_PASSWORD = "..."
$env:CAPACITOR_ANDROID_KEYSTORE_ALIAS = "fran-pos"
$env:CAPACITOR_ANDROID_KEYSTORE_ALIAS_PASSWORD = "..."
npx cap build android --keystorepath ... # or rely on env + gradle
```

**Option B — Gradle** in `android/app/build.gradle` / `keystore.properties` (do not commit secrets).

`*.jks` / `*.keystore` are gitignored.

## Camera / barcode (optional next step)

POS uses in-browser ZXing (`getUserMedia`). The WebView needs the Camera permission on Android. If scan fails on device, add to `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
```

And request runtime permission via `@capacitor/camera` or a small permissions plugin when you harden tablet install (Phase 2 Workstream 8).

## OAuth / deep links note

Google SSO uses browser redirects to `/auth/callback`. Inside the APK WebView that flow may need a custom scheme / App Links setup. The **POS terminal path** (`/pos`) does not require Supabase OAuth and is the primary tablet/register surface.

## What stays web-only

- Vercel deploy (`vercel.json` → `dashboard/dist`) is unchanged.
- Do not set Vite `base: './'` globally; absolute `/` assets work for both Vercel SPA rewrites and Capacitor’s local `https` WebView origin.
