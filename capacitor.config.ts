import type { CapacitorConfig } from '@capacitor/cli'

const liveUrl = (process.env.CAP_LIVE_URL || '').trim()

/**
 * Fran POS Android shell wraps the existing Vite web build in dashboard/dist.
 * Web (Vercel) stays unchanged; APK builds sync that same dist into android/.
 *
 * Dev live-reload: set CAP_LIVE_URL=http://127.0.0.1:5180 then cap sync.
 * The installed app loads the Vite server instead of bundled assets.
 */
const config: CapacitorConfig = {
  appId: 'com.fran.pos',
  webDir: 'dashboard/dist',
  appName: 'Fran POS',
  server: liveUrl
    ? {
        url: liveUrl,
        cleartext: true,
        androidScheme: 'http',
      }
    : {
        // Serve the SPA over https in the WebView so Secure Context APIs work
        // (camera / barcode scan via getUserMedia, etc.).
        androidScheme: 'https',
      },
  android: {
    allowMixedContent: false,
    backgroundColor: '#FFFEF5',
    buildOptions: {
      // Produce a distributable APK (not AAB) from `cap build android`.
      // For signed release, set CAPACITOR_ANDROID_KEYSTORE_PATH and related
      // keystore env vars, or configure signing in android/app/build.gradle.
      releaseType: 'APK',
    },
  },
}

export default config
