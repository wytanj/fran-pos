import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCAN_ROOTS = ['dashboard/src', 'api', 'packages']
const MOJIBAKE = /â€|Â[· \u00a0]|Ã[—©]|â†|âœ|\uFFFD/

function filesUnder(dir, out) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      filesUnder(path, out)
      continue
    }
    if (!entry.isFile()) continue
    out.push(path)
  }
}

function sourceFiles() {
  const out = []
  for (const root of SCAN_ROOTS) filesUnder(join(ROOT, root), out)
  return out.filter((path) => {
    const info = statSync(path)
    if (!info.isFile() || info.size > 1_000_000) return false
    return true
  })
}

test('mojibake regex flags the cp1252 round-trip and allows the real characters', () => {
  assert.match('Sending the sale to the S700\u00e2\u20ac\u00a6', MOJIBAKE)
  assert.match('Settings \u00e2\u2020\u2019 Integrations', MOJIBAKE)
  assert.match('bad \uFFFD separator', MOJIBAKE)
  assert.doesNotMatch('Sending the sale to the S700\u2026', MOJIBAKE)
  assert.doesNotMatch('Settings \u2192 Integrations', MOJIBAKE)
  assert.doesNotMatch('tap \u00b7 pay', MOJIBAKE)
})

test('dashboard, api, and packages source has no mojibake', () => {
  const hits = []
  for (const path of sourceFiles()) {
    const bytes = readFileSync(path)
    if (bytes.includes(0)) continue
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      hits.push(`${path} starts with a UTF-8 BOM`)
    }
    const text = bytes.toString('utf8')
    const lines = text.split(/\n/)
    lines.forEach((line, index) => {
      if (!MOJIBAKE.test(line)) return
      hits.push(`${path}:${index + 1}: ${line.trim().slice(0, 160)}`)
    })
  }
  assert.deepEqual(hits, [])
})
