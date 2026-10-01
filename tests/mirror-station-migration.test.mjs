import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const sql = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')

const REGISTER_TOKEN = 'reg-token-0001'

async function freshDb() {
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(`
    create extension if not exists pgcrypto;
    create role anon; create role authenticated; create role service_role;
    create table public.companies (id uuid primary key default gen_random_uuid());
    create function public.get_user_company_ids() returns setof uuid language sql stable as $$ select null::uuid where false $$;
  `)
  await db.exec(sql('00016_pos_register_devices.sql'))
  await db.exec(sql('00018_pos_mirror_stations.sql'))
  await db.query(
    `insert into public.pos_register_devices (store_code, pair_code, device_token) values ('FRAN01', 'ABCD12', $1)`,
    [REGISTER_TOKEN],
  )
  return db
}

async function rpc(db, fn, args) {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(', ')
  const { rows } = await db.query(`select public.${fn}(${placeholders}) as r`, args)
  return rows[0].r
}

const openPair = (db, token = REGISTER_TOKEN) => rpc(db, 'open_mirror_pair', [token])
const join = (db, code) => rpc(db, 'join_mirror_station', [code])
const publish = (db, seq, snapshot, token = REGISTER_TOKEN) =>
  rpc(db, 'publish_mirror_snapshot', [token, seq, JSON.stringify(snapshot)])
const read = (db, displayToken, afterSeq = 0) => rpc(db, 'read_mirror_snapshot', [displayToken, afterSeq])

test('open_mirror_pair keeps one station per register and mints a fresh code each call', async () => {
  const db = await freshDb()
  const first = await openPair(db)
  const second = await openPair(db)
  assert.equal(first.station_id, second.station_id)
  assert.notEqual(first.pair_code, second.pair_code)
  assert.match(second.pair_code, /^[A-HJ-NP-Z2-9]{6}$/)
  const { rows } = await db.query('select count(*)::int as n from public.pos_mirror_stations')
  assert.equal(rows[0].n, 1)
})

test('join binds a display token, returns the current snapshot, and burns the code', async () => {
  const db = await freshDb()
  await publish(db, 100, { v: 1, phase: 'idle' })
  const { station_id, pair_code } = await openPair(db)
  const joined = await join(db, pair_code.toLowerCase().replace(/(...)/, '$1-'))
  assert.equal(joined.station_id, station_id)
  assert.equal(joined.store_code, 'FRAN01')
  assert.match(joined.display_token, /^[0-9a-f]{48}$/)
  assert.deepEqual(joined.snapshot, { v: 1, phase: 'idle' })
  await assert.rejects(join(db, pair_code), /invalid or expired/)
})

test('an expired pair code is rejected', async () => {
  const db = await freshDb()
  const { pair_code } = await openPair(db)
  await db.exec(`update public.pos_mirror_stations set pair_expires_at = now() - interval '1 second'`)
  await assert.rejects(join(db, pair_code), /invalid or expired/)
})

test('publish ignores stale sequence numbers and read skips unchanged snapshots', async () => {
  const db = await freshDb()
  const { pair_code } = await openPair(db)
  const { display_token } = await join(db, pair_code)
  await publish(db, 200, { phase: 'cart' })
  const stale = await publish(db, 100, { phase: 'idle' })
  assert.equal(stale.snapshot_seq, 200)
  assert.ok(stale.display_seen_at, 'publish reports display liveness')
  const latest = await read(db, display_token)
  assert.equal(latest.snapshot_seq, 200)
  assert.deepEqual(latest.snapshot, { phase: 'cart' })
  const unchanged = await read(db, display_token, 200)
  assert.equal(unchanged.snapshot, null)
})

test('re-pair rebinds the same station, keeps the snapshot, and revokes the old display', async () => {
  const db = await freshDb()
  const firstPair = await openPair(db)
  const firstFace = await join(db, firstPair.pair_code)
  await publish(db, 300, { phase: 'cart', basket: { nett: 42 } })

  const secondPair = await openPair(db)
  const secondFace = await join(db, secondPair.pair_code)
  assert.equal(secondFace.station_id, firstFace.station_id)
  assert.deepEqual(secondFace.snapshot, { phase: 'cart', basket: { nett: 42 } })
  assert.equal(secondFace.snapshot_seq, 300)
  assert.notEqual(secondFace.display_token, firstFace.display_token)
  await assert.rejects(read(db, firstFace.display_token), /Display is not paired/)
  assert.equal((await read(db, secondFace.display_token)).snapshot_seq, 300)
})

test('unknown and revoked registers cannot open or publish', async () => {
  const db = await freshDb()
  await assert.rejects(openPair(db, 'not-a-register'), /Unknown or revoked register/)
  await assert.rejects(publish(db, 1, {}, 'not-a-register'), /Unknown or revoked register/)
  await db.exec(`update public.pos_register_devices set revoked_at = now()`)
  await assert.rejects(openPair(db), /Unknown or revoked register/)
  await assert.rejects(publish(db, 1, {}), /Unknown or revoked register/)
})

test('publish rejects non-object snapshots', async () => {
  const db = await freshDb()
  await assert.rejects(rpc(db, 'publish_mirror_snapshot', [REGISTER_TOKEN, 1, '[1,2]']), /JSON object/)
})
