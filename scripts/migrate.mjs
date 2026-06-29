#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return
  const text = readFileSync(filePath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    if (process.env[key] !== undefined) continue
    let value = rawValue.trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

function parseArgs(argv) {
  const opts = {
    dir: 'supabase/migrations',
    dryRun: false,
    markApplied: false,
    status: false,
    from: null,
    to: null,
    only: null,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--mark-applied') opts.markApplied = true
    else if (arg === '--status') opts.status = true
    else if (arg === '--dir') opts.dir = argv[++i]
    else if (arg === '--from') opts.from = argv[++i]
    else if (arg === '--to') opts.to = argv[++i]
    else if (arg === '--only') opts.only = argv[++i]
    else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return opts
}

function printHelp() {
  console.log(`POS migration runner

Usage:
  npm run db:migrate -- [options]
  npm run db:migrate:status

Options:
  --dir <path>       Migration directory. Default: supabase/migrations
  --from <number>    Start at migration number, e.g. 001
  --to <number>      End at migration number, e.g. 003
  --only <number>    Run exactly one migration number
  --dry-run          Print plan without connecting to Postgres
  --mark-applied     Record selected migrations as applied without running SQL
  --status           Show applied/pending state

Env:
  DATABASE_URL or SUPABASE_DB_URL or POSTGRES_URL
`)
}

function migrationNumber(filename) {
  const match = filename.match(/^(\d{3,5})_/)
  return match ? match[1] : null
}

function normalizeNumber(value) {
  return String(value).padStart(3, '0')
}

function listMigrations(dir, opts) {
  const absDir = resolve(ROOT, dir)
  if (!existsSync(absDir)) throw new Error(`Migration directory not found: ${absDir}`)

  let migrations = readdirSync(absDir)
    .filter((name) => /^\d{3,5}_.+\.sql$/.test(name))
    .sort()
    .map((name) => {
      const path = join(absDir, name)
      const sql = readFileSync(path, 'utf8')
      return {
        number: migrationNumber(name),
        name,
        path,
        checksum: createHash('sha256').update(sql).digest('hex'),
        sql,
      }
    })

  if (opts.only) migrations = migrations.filter((m) => m.number === normalizeNumber(opts.only))
  if (opts.from) migrations = migrations.filter((m) => m.number >= normalizeNumber(opts.from))
  if (opts.to) migrations = migrations.filter((m) => m.number <= normalizeNumber(opts.to))

  return migrations
}

function connectionString() {
  const explicit = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL
  if (explicit) return explicit

  const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
  const password = process.env.SUPABASE_DB_PASSWORD || ''
  const projectRef = supabaseUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co$/)?.[1]

  if (projectRef && password) {
    return `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`
  }

  return ''
}

function requireDatabaseUrl() {
  const url = connectionString()
  if (!url) {
    throw new Error('Missing DATABASE_URL, SUPABASE_DB_URL, POSTGRES_URL, or VITE_SUPABASE_URL + SUPABASE_DB_PASSWORD')
  }
  return url
}

function createDbClient(dbUrl) {
  return postgres(dbUrl, {
    max: 1,
    ssl: process.env.PGSSL === 'disable' ? false : 'require',
    onnotice: (notice) => {
      if (notice?.message) console.log(`notice: ${notice.message}`)
    },
  })
}

async function ensureTrackingTable(sql) {
  await sql.unsafe(`create table if not exists public.pos_migrations (
      version text primary key,
      name text not null,
      checksum text not null,
      applied_at timestamptz not null default now()
    );
    revoke all on table public.pos_migrations from anon, authenticated;
    alter table public.pos_migrations enable row level security;`)
}

async function getApplied(sql) {
  await ensureTrackingTable(sql)
  const rows = await sql`
    select version, name, checksum
    from public.pos_migrations
    order by version
  `
  const applied = new Map()
  for (const row of rows) {
    applied.set(row.version, {
      version: row.version,
      name: row.name,
      checksum: row.checksum,
    })
  }
  return applied
}

async function applyMigration(sql, migration) {
  await sql.begin(async (tx) => {
    await ensureTrackingTable(tx)
    await tx.unsafe(migration.sql)
    await tx`
      insert into public.pos_migrations (version, name, checksum)
      values (${migration.number}, ${migration.name}, ${migration.checksum})
    `
  })
}

async function markMigrationApplied(sql, migration) {
  await sql`
    insert into public.pos_migrations (version, name, checksum)
    values (${migration.number}, ${migration.name}, ${migration.checksum})
  `
}

function printPlan(migrations, applied = new Map()) {
  if (migrations.length === 0) {
    console.log('No migrations selected.')
    return
  }

  for (const m of migrations) {
    const current = applied.get(m.number)
    const state = current
      ? current.checksum === m.checksum
        ? 'applied'
        : 'checksum-mismatch'
      : 'pending'
    console.log(`${m.number} ${state.padEnd(17)} ${m.name}`)
  }
}

async function main() {
  loadDotEnv(resolve(ROOT, '.env'))
  const opts = parseArgs(process.argv.slice(2))
  const migrations = listMigrations(opts.dir, opts)

  if (opts.dryRun) {
    printPlan(migrations)
    return
  }

  const dbUrl = requireDatabaseUrl()
  const sql = createDbClient(dbUrl)

  try {
    const applied = await getApplied(sql)

    if (opts.status) {
      printPlan(migrations, applied)
      return
    }

    if (opts.markApplied) {
      const toMark = []
      for (const migration of migrations) {
        const current = applied.get(migration.number)
        if (current) {
          if (current.checksum !== migration.checksum) {
            throw new Error(
              `Checksum mismatch for ${migration.name}. Applied checksum ${current.checksum}, local checksum ${migration.checksum}.`
            )
          }
          continue
        }
        toMark.push(migration)
      }

      if (toMark.length === 0) {
        console.log('No selected migrations need to be marked.')
        return
      }

      await sql.begin(async (tx) => {
        await ensureTrackingTable(tx)
        for (const migration of toMark) {
          process.stdout.write(`Marking ${migration.name} as applied... `)
          await markMigrationApplied(tx, migration)
          console.log('done')
        }
      })

      console.log(`Marked ${toMark.length} migration${toMark.length === 1 ? '' : 's'} as applied.`)
      return
    }

    const pending = []
    for (const migration of migrations) {
      const current = applied.get(migration.number)
      if (current) {
        if (current.checksum !== migration.checksum) {
          throw new Error(
            `Checksum mismatch for ${migration.name}. Applied checksum ${current.checksum}, local checksum ${migration.checksum}.`
          )
        }
        continue
      }
      pending.push(migration)
    }

    if (pending.length === 0) {
      console.log('No pending migrations.')
      return
    }

    for (const migration of pending) {
      process.stdout.write(`Applying ${migration.name}... `)
      await applyMigration(sql, migration)
      console.log('done')
    }

    console.log(`Applied ${pending.length} migration${pending.length === 1 ? '' : 's'}.`)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
