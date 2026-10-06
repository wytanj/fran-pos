import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const MOJIBAKE = /â€|Â[· \u00a0]|Ã[—©]|â†|âœ|\uFFFD/

const MIRROR_FILES = [
  'dashboard/src/pos/pages/mirror-face.tsx',
  'dashboard/src/pos/mirror/mirror-orientation.ts',
  'dashboard/src/pos/mirror/mirror-snapshot.ts',
  'dashboard/src/pos/mirror/mirror-api.ts',
  'dashboard/src/pos/mirror/mirror-pair-dialog.tsx',
  'dashboard/src/pos/lib/pos-immersive.ts',
]

test('mojibake regex flags the cp1252 round-trip and allows the real characters', () => {
  assert.match('Sending the sale to the S700\u00e2\u20ac\u00a6', MOJIBAKE)
  assert.match('Settings \u00e2\u2020\u2019 Integrations', MOJIBAKE)
  assert.match('bad \uFFFD separator', MOJIBAKE)
  assert.doesNotMatch('Sending the sale to the S700\u2026', MOJIBAKE)
  assert.doesNotMatch('Settings \u2192 Integrations', MOJIBAKE)
  assert.doesNotMatch('tap \u00b7 pay', MOJIBAKE)
})

test('mirror face and orientation source has no mojibake', () => {
  const hits = []
  for (const rel of MIRROR_FILES) {
    const bytes = readFileSync(new URL(`../${rel}`, import.meta.url))
    if (bytes.includes(0)) continue
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      hits.push(`${rel} starts with a UTF-8 BOM`)
    }
    const text = bytes.toString('utf8')
    text.split(/\n/).forEach((line, index) => {
      if (!MOJIBAKE.test(line)) return
      hits.push(`${rel}:${index + 1}: ${line.trim().slice(0, 160)}`)
    })
  }
  assert.deepEqual(hits, [])
})
