import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const { mirrorPathRequestsPortrait } = await import(
  '../dashboard/src/pos/mirror/mirror-orientation.ts'
)

const portrait = [
  '/pos/mirror',
  '/pos/mirror/',
  '/pos/mirror?code=ABC123',
  '/pos/mirror#live',
  'https://fran-pos.vercel.app/pos/mirror',
  'https://fran-pos.vercel.app/pos/mirror?code=ABC123',
  'https://localhost/pos/mirror/',
  '/app/pos/mirror',
  '/pos/mirror/extra',
]

const free = [
  '',
  '/',
  '/pos',
  '/pos/sale',
  '/pos/login',
  '/pos/mirrors',
  '/pos/mirror-backup',
  '/position/mirror',
  'https://fran-pos.vercel.app/pos/sale',
  'https://fran-pos.vercel.app/',
]

test('mirror path requests portrait and every other path stays free', () => {
  for (const path of portrait) assert.equal(mirrorPathRequestsPortrait(path), true, path)
  for (const path of free) assert.equal(mirrorPathRequestsPortrait(path), false, path)
})

test('portrait lock stays on the mirror route and off the cashier activity', () => {
  const face = readFileSync(new URL('../dashboard/src/pos/pages/mirror-face.tsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../dashboard/src/index.css', import.meta.url), 'utf8')
  const activity = readFileSync(
    new URL('../android/app/src/main/java/com/fran/pos/MainActivity.java', import.meta.url),
    'utf8',
  )
  const manifest = readFileSync(
    new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url),
    'utf8',
  )
  const shell = readFileSync(new URL('../dashboard/src/pos/pos-shell.tsx', import.meta.url), 'utf8')
  const sale = readFileSync(new URL('../dashboard/src/pos/pages/sale.tsx', import.meta.url), 'utf8')

  assert.match(face, /useMirrorPortraitLock\(/)
  assert.match(face, /data-mirror-face/)
  assert.doesNotMatch(face, /landscape:/)
  assert.match(css, /\[data-mirror-face\]/)
  assert.match(css, /rotate\(90deg\)/)
  assert.match(css, /orientation:\s*landscape/)
  assert.match(activity, /FranOrientation/)
  assert.match(activity, /SCREEN_ORIENTATION_SENSOR_PORTRAIT/)
  assert.match(activity, /SCREEN_ORIENTATION_UNSPECIFIED/)
  assert.doesNotMatch(activity, /SCREEN_ORIENTATION_LANDSCAPE|SCREEN_ORIENTATION_SENSOR_LANDSCAPE/)
  assert.doesNotMatch(manifest, /android:screenOrientation/)
  assert.doesNotMatch(shell, /useMirrorPortraitLock|FranOrientation|orientation\.lock/)
  assert.doesNotMatch(sale, /useMirrorPortraitLock|FranOrientation|screen\.orientation/)
})
