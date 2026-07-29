import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// Prefer direct SQL via postgres if available
const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
const sql = readFileSync(join(__dirname, '../supabase/migrations/00014_company_invites.sql'), 'utf8')

if (dbUrl) {
  const { default: postgres } = await import('postgres')
  const sqlClient = postgres(dbUrl, { ssl: 'require', max: 1 })
  try {
    await sqlClient.unsafe(sql)
    console.log('Applied 00014_company_invites.sql via DATABASE_URL')
  } finally {
    await sqlClient.end({ timeout: 5 })
  }
} else {
  console.error('No SUPABASE_DB_URL — open Supabase SQL editor and run 00014_company_invites.sql')
  process.exit(2)
}
