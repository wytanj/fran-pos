import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const {
  buildMirrorSnapshot,
  parseMirrorSnapshot,
  MIRROR_IDLE_PROMOS,
} = await import('../dashboard/src/pos/mirror/mirror-snapshot.ts')

const {
  MEMBER_PHONE_COUNTRIES,
  MEMBER_PHONE_DEFAULT_DIAL,
  MEMBER_PHONE_PRIORITY_DIALS,
  composeMemberPhoneRaw,
} = await import('../dashboard/src/pos/fran/lib/member-phone-countries.ts')

const store = { name: 'Fran Bugis+', code: 'FRAN01', currency: 'SGD' }

test('country picker defaults to Singapore and keeps priority order first', () => {
  assert.equal(MEMBER_PHONE_DEFAULT_DIAL, '+65')
  assert.deepEqual(MEMBER_PHONE_PRIORITY_DIALS, ['+65', '+60', '+62', '+86', '+82', '+81', '+1', '+44'])
  assert.deepEqual(
    MEMBER_PHONE_COUNTRIES.slice(0, 8).map((c) => c.dial),
    MEMBER_PHONE_PRIORITY_DIALS,
  )
})

test('composeMemberPhoneRaw keeps SG local 8-digit form for CRM', () => {
  assert.equal(composeMemberPhoneRaw('+65', '91234567'), '91234567')
  assert.equal(composeMemberPhoneRaw('+65', '6591234567'), '91234567')
  assert.equal(composeMemberPhoneRaw('+60', '0123456789'), '+60123456789')
})

test('buildMirrorSnapshot prefers member_phone prompt over cart', () => {
  const snap = buildMirrorSnapshot({
    store,
    cart: [{ lineId: 'a', name: 'Serum', qty: 1, unitPrice: 40, lineDiscount: 0 }],
    totals: { itemCount: 1, total: 40, balance: 40, cartAdjustment: 0 },
    paymentOpen: false,
    completedOpen: false,
    lastSale: null,
    franSession: null,
    franPreview: null,
    promos: MIRROR_IDLE_PROMOS,
    memberPhonePrompt: { status: 'awaiting' },
  })
  assert.equal(snap.phase, 'member_phone')
  assert.equal(snap.prompt.status, 'awaiting')
  assert.ok(snap.basket)
})

test('member_phone result round-trips through parseMirrorSnapshot', () => {
  const built = buildMirrorSnapshot({
    store,
    cart: [],
    totals: { itemCount: 0, total: 0, balance: 0, cartAdjustment: 0 },
    paymentOpen: false,
    completedOpen: false,
    lastSale: null,
    franSession: null,
    franPreview: null,
    promos: MIRROR_IDLE_PROMOS,
    memberPhonePrompt: {
      status: 'result',
      found: true,
      dial: '+65',
      nationalNumber: '91234567',
      memberName: 'Mei Tan',
    },
  })
  const parsed = parseMirrorSnapshot(built)
  assert.equal(parsed?.phase, 'member_phone')
  assert.deepEqual(parsed?.prompt, {
    status: 'result',
    found: true,
    dial: '+65',
    nationalNumber: '91234567',
    memberName: 'Mei Tan',
  })
})

const sql = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')
const REGISTER_TOKEN = 'reg-token-phone-1'

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
  await db.exec(sql('00022_mirror_face_input.sql'))
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

test('face can submit member_phone input and cashier can read then clear it', async () => {
  const db = await freshDb()
  const pair = await rpc(db, 'open_mirror_pair', [REGISTER_TOKEN])
  const joined = await rpc(db, 'join_mirror_station', [pair.pair_code])
  const submitted = await rpc(db, 'submit_mirror_face_input', [
    joined.display_token,
    JSON.stringify({ kind: 'member_phone', dial: '+65', nationalNumber: '91234567', raw: '91234567', at: '2026-10-07T00:00:00Z' }),
  ])
  assert.equal(submitted.face_input_seq, 1)
  const read = await rpc(db, 'read_mirror_face_input', [REGISTER_TOKEN, 0])
  assert.equal(read.face_input_seq, 1)
  assert.equal(read.face_input.kind, 'member_phone')
  assert.equal(read.face_input.raw, '91234567')
  const skipped = await rpc(db, 'read_mirror_face_input', [REGISTER_TOKEN, 1])
  assert.equal(skipped.face_input, null)
  await rpc(db, 'clear_mirror_face_input', [REGISTER_TOKEN])
  const after = await rpc(db, 'read_mirror_face_input', [REGISTER_TOKEN, 0])
  assert.equal(after.face_input, null)
  assert.equal(after.face_input_seq, 1)
})
