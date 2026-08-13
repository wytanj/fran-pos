import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  envDir: path.resolve(__dirname, '..'),
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_STRIPE_API_BASE || 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
})
