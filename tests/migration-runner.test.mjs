import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
const runner = readFileSync(new URL('../scripts/migrate.mjs', import.meta.url), 'utf8')
const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8')
const replicationDoc = readFileSync(new URL('../supabase/GOOGLE_ACCOUNT_REPLICATION.md', import.meta.url), 'utf8')

test('POS package exposes database migration commands', () => {
  assert.match(packageJson, /"db:migrate": "node scripts\/migrate\.mjs"/)
  assert.match(packageJson, /"db:migrate:status": "node scripts\/migrate\.mjs --status"/)
  assert.match(packageJson, /"postgres": "\^3\.4\.9"/)
})

test('POS migration runner tracks checksummed SQL migrations', () => {
  assert.match(runner, /dir: 'supabase\/migrations'/)
  assert.match(runner, /public\.pos_migrations/)
  assert.match(runner, /createHash\('sha256'\)/)
  assert.match(runner, /DATABASE_URL \|\| process\.env\.SUPABASE_DB_URL \|\| process\.env\.POSTGRES_URL/)
  assert.match(runner, /VITE_SUPABASE_URL/)
  assert.match(runner, /SUPABASE_DB_PASSWORD/)
  assert.match(runner, /--only/)
  assert.match(runner, /--dry-run/)
  assert.match(runner, /--mark-applied/)
  assert.match(runner, /markMigrationApplied/)
  assert.match(runner, /Checksum mismatch/)
})

test('POS migration docs and env example describe direct database URLs', () => {
  assert.match(envExample, /SUPABASE_DB_URL=postgresql:\/\//)
  assert.match(envExample, /VITE_SUPABASE_URL \+ SUPABASE_DB_PASSWORD/)
  assert.match(replicationDoc, /npm run db:migrate:status/)
  assert.match(replicationDoc, /--to 002 --mark-applied/)
  assert.match(replicationDoc, /public\.pos_migrations/)
  assert.match(replicationDoc, /pooler URL/)
})
