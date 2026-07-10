#!/usr/bin/env node
/**
 * Cross-platform Gradle wrapper for the Capacitor android/ project.
 * Copies the resulting APK into dist/android/ for a stable dist path.
 *
 * Usage: node scripts/android-gradle.mjs assembleDebug
 *        node scripts/android-gradle.mjs assembleRelease
 */
import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const androidDir = path.join(root, 'android')
const task = process.argv[2] || 'assembleDebug'
const isRelease = /release/i.test(task)
const variant = isRelease ? 'release' : 'debug'
const apkSourceDir = path.join(androidDir, 'app', 'build', 'outputs', 'apk', variant)
const distOutDir = path.join(root, 'dist', 'android')

if (!existsSync(androidDir)) {
  console.error(
    'android/ is missing. Run: npm run build:web && npx cap add android && npx cap sync android',
  )
  process.exit(1)
}

const isWin = process.platform === 'win32'
const gradlewName = isWin ? 'gradlew.bat' : 'gradlew'
const gradlew = path.join(androidDir, gradlewName)

if (!existsSync(gradlew)) {
  console.error(`Gradle wrapper not found at ${gradlew}`)
  process.exit(1)
}

function findApks(dir) {
  if (!existsSync(dir)) return []
  const found = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) found.push(...findApks(full))
    else if (name.endsWith('.apk')) found.push(full)
  }
  return found
}

function publishApks() {
  const apks = findApks(apkSourceDir)
  if (apks.length === 0) {
    console.warn(`No APK found under ${apkSourceDir}`)
    return
  }
  mkdirSync(distOutDir, { recursive: true })
  for (const apk of apks) {
    const base = path.basename(apk)
    const destName = base.startsWith('fran-pos-')
      ? base
      : `fran-pos-${variant}${base.includes('unsigned') ? '-unsigned' : ''}.apk`
    const dest = path.join(distOutDir, destName)
    copyFileSync(apk, dest)
    console.log(`Published ${dest}`)
  }
}

// Use cwd=android/ + relative wrapper so user home paths with spaces don't break.
const child = isWin
  ? spawn(`"${gradlewName}" ${task}`, {
      cwd: androidDir,
      stdio: 'inherit',
      shell: true,
      env: process.env,
    })
  : spawn(path.join(androidDir, gradlewName), [task], {
      cwd: androidDir,
      stdio: 'inherit',
      env: process.env,
    })

child.on('error', (err) => {
  console.error(err.message)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Gradle killed by signal ${signal}`)
    process.exit(1)
  }
  if (code === 0) {
    publishApks()
  }
  process.exit(code ?? 1)
})
