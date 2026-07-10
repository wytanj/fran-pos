import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Fran POS Android shell wraps the existing Vite web build in dashboard/dist.
 * Web (Vercel) stays unchanged; APK builds sync that same dist into android/.
 */
const config: CapacitorConfig = {
  appId: 'com.fran.pos',
  appName: 'Fran POS',
  webDir: 'dashboard/dist',
  server: {
    // Serve the SPA over https in the WebView so Secure Context APIs work
    // (camera / barcode scan via getUserMedia, etc.).
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#0f172a',
    buildOptions: {
      // Produce a distributable APK (not AAB) from `cap build android`.
      // For signed release, set CAPACITOR_ANDROID_KEYSTORE_PATH and related
      // keystore env vars, or configure signing in android/app/build.gradle.
      releaseType: 'APK',
    },
  },
}

export default config
