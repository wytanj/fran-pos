import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createReadStream, existsSync } from 'node:fs'
import path from 'path'

const apkPath = path.resolve(__dirname, '../dist/android/fran-pos-debug.apk')
const stripeApiProxy =
  process.env.STRIPE_API_PROXY ||
  process.env.VITE_STRIPE_API_BASE ||
  'https://fran-pos.vercel.app'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'serve-debug-apk',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.split('?')[0] !== '/fran-pos-debug.apk') return next()
          if (!existsSync(apkPath)) {
            res.statusCode = 404
            res.end('Debug APK not built yet. Run npm run android:live')
            return
          }
          res.setHeader('Content-Type', 'application/vnd.android.package-archive')
          res.setHeader('Content-Disposition', 'attachment; filename="fran-pos-debug.apk"')
          createReadStream(apkPath).pipe(res)
        })
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  envDir: path.resolve(__dirname, '..'),
  server: {
    host: true,
    port: 5180,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: stripeApiProxy,
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
