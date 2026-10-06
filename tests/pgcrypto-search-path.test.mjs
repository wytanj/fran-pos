import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const migrationsDir = fileURLToPath(new URL('../supabase/migrations/', import.meta.url))
const PGCRYPTO = ['gen_random_bytes', 'gen_salt', 'crypt', 'digest', 'hmac']

function migrationSql() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(join(migrationsDir, name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/--[^\n]*/g, ' '),
    }))
}

function parseFunctions(sql) {
  const found = []
  const start = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-zA-Z_][\w]*)\s*\(/gi
  let match
  while ((match = start.exec(sql))) {
    const name = match[1]
    let i = start.lastIndex
    let depth = 1
    while (i < sql.length && depth > 0) {
      if (sql[i] === '(') depth += 1
      else if (sql[i] === ')') depth -= 1
      i += 1
    }
    const rest = sql.slice(i)
    const tagMatch = rest.match(/\$([A-Za-z0-9_]*)\$/)
    if (!tagMatch) break
    const tag = tagMatch[0]
    const header = rest.slice(0, tagMatch.index)
    const bodyStart = i + tagMatch.index + tag.length
    const bodyEnd = sql.indexOf(tag, bodyStart)
    if (bodyEnd < 0) break
    found.push({ name, header, body: sql.slice(bodyStart, bodyEnd), bodyStart, bodyEnd })
    start.lastIndex = bodyEnd + tag.length
  }
  return found
}

function latestFunctions(files) {
  const latest = new Map()
  for (const file of files) {
    for (const fn of parseFunctions(file.sql)) {
      latest.set(fn.name, { ...fn, file: file.name })
    }
  }
  return latest
}

function searchPath(header) {
  const match = header.match(/set\s+search_path\s*(?:=|to)\s*([^\n]+)/i)
  if (!match) return null
  return match[1].replace(/\bas\s*$/i, '').trim()
}

function pathHasExtensions(raw) {
  return raw.split(',').some((part) => part.trim().replace(/^["']|["']$/g, '') === 'extensions')
}

function unqualifiedPgcrypto(text) {
  return PGCRYPTO.filter((name) => new RegExp(`(?<![\\w.])${name}\\s*\\(`, 'i').test(text))
}

function splitTopLevel(body) {
  const parts = []
  let depth = 0
  let current = ''
  for (const ch of body) {
    if (ch === '(') depth += 1
    if (ch === ')' && depth > 0) depth -= 1
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) parts.push(current)
  return parts
}

function withoutFunctions(sql) {
  let out = ''
  let cursor = 0
  for (const fn of parseFunctions(sql)) {
    out += sql.slice(cursor, fn.bodyStart)
    cursor = fn.bodyEnd
  }
  return out + sql.slice(cursor)
}

function latestDefaults(files) {
  const defaults = new Map()
  const alterRe = /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?([a-zA-Z_][\w]*)\s+alter\s+column\s+([a-zA-Z_][\w]*)\s+set\s+default\s+([^;]+)/gi
  const createRe = /create\s+table(?:\s+if\s+not\s+exists)?\s+(?:public\.)?([a-zA-Z_][\w]*)\s*\(([\s\S]*?)\);/gi
  for (const file of files) {
    const sql = withoutFunctions(file.sql)
    const events = []
    for (const match of sql.matchAll(alterRe)) {
      events.push({ index: match.index, key: `${match[1]}.${match[2]}`, expr: match[3].trim(), file: file.name })
    }
    for (const match of sql.matchAll(createRe)) {
      for (const col of splitTopLevel(match[2])) {
        const column = col.trim().match(/^([a-zA-Z_][\w]*)\s+[a-zA-Z_][\w.]*(?:\([^)]*\))?[\s\S]*?\bdefault\s+([\s\S]+)$/i)
        if (!column) continue
        events.push({ index: match.index, key: `${match[1]}.${column[1]}`, expr: column[2].trim(), file: file.name })
      }
    }
    events.sort((a, b) => a.index - b.index)
    for (const event of events) defaults.set(event.key, event)
  }
  return defaults
}

function leaksIn(files) {
  const leaks = []
  for (const fn of latestFunctions(files).values()) {
    const path = searchPath(fn.header)
    if (path == null || pathHasExtensions(path)) continue
    const hits = unqualifiedPgcrypto(fn.body)
    if (hits.length > 0) leaks.push(`${fn.name} (${fn.file}) search_path=${path} calls ${hits.join(', ')}`)
  }
  for (const column of latestDefaults(files).values()) {
    const hits = unqualifiedPgcrypto(column.expr)
    if (hits.length > 0) leaks.push(`${column.key} default (${column.file}) calls ${hits.join(', ')}`)
  }
  return leaks
}

test('latest migration definitions do not call unqualified pgcrypto under a pinned search_path', () => {
  const leaks = leaksIn(migrationSql())
  assert.deepEqual(leaks, [], leaks.join('\n'))
})

test('pair RPCs and invite tokens call extensions.gen_random_bytes', () => {
  const files = migrationSql()
  const fns = latestFunctions(files)
  for (const name of ['create_pos_register_pair', 'join_mirror_station']) {
    const fn = fns.get(name)
    assert.ok(fn, `${name} is missing`)
    assert.match(fn.header, /set\s+search_path\s*=\s*public\s*,\s*extensions/i, name)
    assert.match(fn.body, /extensions\.gen_random_bytes\s*\(/, name)
    assert.deepEqual(unqualifiedPgcrypto(fn.body), [], name)
  }
  const token = latestDefaults(files).get('company_invites.token')
  assert.ok(token, 'company_invites.token default is missing')
  assert.match(token.expr, /extensions\.gen_random_bytes\s*\(/)
  assert.deepEqual(unqualifiedPgcrypto(token.expr), [])
})
