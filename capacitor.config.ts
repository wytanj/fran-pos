import type { CapacitorConfig } from '@capacitor/cli'

const liveUrl = (process.env.CAP_LIVE_URL || '').trim()

const allowNavigation = [
  '*.google.com',
  '*.youtube.com',
  '*.googleusercontent.com',
  '*.gstatic.com',
  '*.supabase.co',
  'fran-pos.vercel.app',
]

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
        cleartext: liveUrl.startsWith('http://'),
        androidScheme: liveUrl.startsWith('https://') ? 'https' : 'http',
        allowNavigation,
      }
    : {
        // Serve the SPA over https in the WebView so Secure Context APIs work
        // (camera / barcode scan via getUserMedia, etc.).
        androidScheme: 'https',
        allowNavigation,
      },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#FFFEF5',
    // Android 15 edge-to-edge: the web layer pads with env(safe-area-inset-*)
    // (pos-shell.tsx). If a device's WebView reports zero insets, opt out
    // natively at the next APK rebuild via windowOptOutEdgeToEdgeEnforcement
    // in android/app/src/main/res/values/styles.xml.
    buildOptions: {
      // Produce a distributable APK (not AAB) from `cap build android`.
      // For signed release, set CAPACITOR_ANDROID_KEYSTORE_PATH and related
      // keystore env vars, or configure signing in android/app/build.gradle.
      releaseType: 'APK',
    },
  },
}

export default config

