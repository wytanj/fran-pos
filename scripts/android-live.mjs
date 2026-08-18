#!/usr/bin/env node
/**
 * Bake a Vite live-reload URL into a debug APK so UI changes appear
 * without reinstalling. Does not commit the live URL.
 *
 * Prefers http://127.0.0.1:5180 + `adb reverse` when a device is
 * attached (IPv4 loopback so Android WebView does not miss IPv6 localhost;
 * 5180 stays clear of sibling Vite apps on 5173; 127.0.0.1 is a secure
 * context for camera / getUserMedia). Falls back to the PC LAN IP for
 * Wi-Fi-only sessions.
 *
 * Usage: node scripts/android-live.mjs
 *        CAP_LIVE_URL=http://192.168.0.10:5180 node scripts/android-live.mjs
 *
 * Re-run `npm run cap:sync` without CAP_LIVE_URL before a store APK.
 */
import { execSync } from 'node:child_process'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const adb = process.env.ANDROID_HOME
  ? path.join(process.env.ANDROID_HOME, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
  : 'adb'

function lanIPv4() {
  const nets = networkInterfaces()
  const preferred = []
  const fallback = []
  for (const addrs of Object.values(nets)) {
    for (const addr of addrs || []) {
      if (addr.internal || addr.family !== 'IPv4') continue
      if (addr.address.startsWith('192.168.') || addr.address.startsWith('10.')) {
        preferred.push(addr.address)
      } else {
        fallback.push(addr.address)
      }
    }
  }
  return preferred[0] || fallback[0] || ''
}

function adbSerial() {
  try {
    const out = execSync(`"${adb}" devices`, { encoding: 'utf8' })
    const line = out
      .split(/\r?\n/)
      .map((row) => row.trim())
      .find((row) => row.endsWith('\tdevice') || /\sdevice\s/.test(row) || /\sdevice$/.test(row))
    if (!line) return ''
    return line.split(/\s+/)[0] || ''
  } catch {
    return ''
  }
}

const serial = adbSerial()
const ip = lanIPv4()
const liveUrl = (
  process.env.CAP_LIVE_URL ||
  (serial ? 'http://127.0.0.1:5180' : ip ? `http://${ip}:5180` : '')
).trim()

if (!liveUrl) {
  console.error('No LAN IPv4 found. Set CAP_LIVE_URL=http://<pc-ip>:5180')
  process.exit(1)
}

console.log(`Live-reload URL: ${liveUrl}${serial ? ` (adb ${serial})` : ''}`)

const livePort = (() => {
  try {
    return new URL(liveUrl).port || '5180'
  } catch {
    return '5180'
  }
})()

if (serial && (liveUrl.includes('127.0.0.1') || liveUrl.includes('localhost'))) {
  execSync(`"${adb}" -s ${serial} reverse tcp:${livePort} tcp:${livePort}`, { stdio: 'inherit' })
  console.log(`adb reverse tcp:${livePort} → this PC. Keep the USB cable plugged in.`)
}

execSync('npx cap sync android', {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, CAP_LIVE_URL: liveUrl },
  shell: true,
})

execSync('node scripts/android-gradle.mjs assembleDebug', {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
  shell: true,
})

if (ip) console.log(`\nWi-Fi / Chrome (no camera): http://${ip}:5180`)
console.log('Keep `npm run dev` running while the APK is open.')

