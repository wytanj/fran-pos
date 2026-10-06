import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(
  new URL('../supabase/migrations/00021_pos_outbox_device_token.sql', import.meta.url),
  'utf8',
)
const outbox = readFileSync(new URL('../dashboard/src/pos/lib/pos-outbox.ts', import.meta.url), 'utf8')
const salePage = readFileSync(new URL('../dashboard/src/pos/pages/sale.tsx', import.meta.url), 'utf8')

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_COMPANY_ID = '22222222-2222-4222-8222-222222222222'
const REGISTER_TOKEN = 'reg-token-0001'

function saleEvent(idempotencyKey, eventId = `evt_${idempotencyKey}`) {
  return {
    company_id: OTHER_COMPANY_ID,
    event_id: eventId,
    event_type: 'pos.sale.completed',
    status: 'acked',
    source_system: 'evil',
    idempotency_key: idempotencyKey,
    aggregate_type: 'sale',
    aggregate_id: 'R-100',
    workspace_id: 'demo',
    occurred_at: '2026-10-07T01:02:03.000Z',
    payload: {
      event_id: eventId,
      event_type: 'pos.sale.completed',
      workspace_id: 'demo',
      idempotency_key: idempotencyKey,
      receipt_number: 'R-100',
    },
  }
}

async function freshDb() {
  const db = new PGlite()
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create table public.companies (id uuid primary key);
    insert into public.companies (id) values ('${COMPANY_ID}');
    create function public.get_user_company_ids() returns setof uuid language sql stable as $$
      select null::uuid where false
    $$;
    create table public.pos_register_devices (
      id uuid primary key default gen_random_uuid(),
      company_id uuid references public.companies(id),
      store_code text not null,
      register_id text not null default 'REG-01',
      pair_code text not null,
      device_token text not null unique,
      label text,
      last_seen_at timestamptz,
      created_at timestamptz not null default now(),
      revoked_at timestamptz
    );
    create table public.pos_outbox_events (
      id uuid primary key default gen_random_uuid(),
      company_id uuid not null references public.companies(id),
      event_id text not null,
      event_type text not null check (event_type in (
        'pos.customer.attached',
        'pos.sale.completed',
        'pos.return.completed',
        'pos.reward.redeem_requested',
        'pos.reward.refund_requested',
        'fran.member.resolved',
        'fran.counter_session.previewed',
        'fran.reward.quoted',
        'fran.reward.committed',
        'fran.reward.reversed',
        'fran.reward.commit_failed',
        'fran.loyalty_execution.committed',
        'fran.points_earn.queued'
      )),
      status text not null default 'queued' check (status in ('queued', 'sent', 'acked', 'failed')),
      source_system text not null default 'pos',
      idempotency_key text not null,
      aggregate_type text not null,
      aggregate_id text not null,
      workspace_id text not null,
      occurred_at timestamptz not null,
      payload jsonb not null,
      attempts integer not null default 0,
      last_error text,
      created_at timestamptz not null default now(),
      unique (company_id, event_id),
      unique (company_id, idempotency_key)
    );
    alter table public.pos_outbox_events enable row level security;
    create policy "Users can insert POS outbox events in their company"
      on public.pos_outbox_events for insert
      with check (company_id in (select public.get_user_company_ids()));
    grant insert on table public.pos_outbox_events to anon, authenticated;
  `)
  await db.exec(migration)
  await db.query(
    `insert into public.pos_register_devices (company_id, store_code, pair_code, device_token)
     values ($1, 'FRAN01', 'ABCD12', $2)`,
    [COMPANY_ID, REGISTER_TOKEN],
  )
  return db
}

function enqueue(db, token, events) {
  return db.query(`select public.enqueue_pos_outbox_events($1, $2::jsonb) as r`, [
    token,
    JSON.stringify(events),
  ]).then((result) => result.rows[0].r)
}

async function asAnon(db, sql, params = []) {
  await db.exec('set role anon')
  try {
    return await db.query(sql, params)
  } finally {
    await db.exec('reset role')
  }
}

test('anon insert into pos_outbox_events is denied when no company membership is in the JWT', async () => {
  const db = await freshDb()
  await assert.rejects(
    asAnon(
      db,
      `insert into public.pos_outbox_events (
        company_id, event_id, event_type, idempotency_key, aggregate_type, aggregate_id, workspace_id, occurred_at, payload
      ) values ($1::uuid, 'evt_direct', 'pos.sale.completed', 'direct-key', 'sale', 'R-1', $1::text, now(), '{}'::jsonb)`,
      [COMPANY_ID],
    ),
    /row-level security/,
  )
  const { rows } = await db.query('select count(*)::int as n from public.pos_outbox_events')
  assert.equal(rows[0].n, 0)
})

test('a bound register token inserts the sale under the register company and ignores the client company', async () => {
  const db = await freshDb()
  const result = await enqueue(db, REGISTER_TOKEN, [saleEvent('sale-1')])
  assert.equal(result.company_id, COMPANY_ID)
  assert.equal(result.accepted, 1)
  assert.equal(result.inserted, 1)

  const { rows } = await db.query(
    `select company_id::text, event_type, status, source_system, workspace_id, payload->>'workspace_id' as payload_workspace
     from public.pos_outbox_events`,
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].company_id, COMPANY_ID)
  assert.equal(rows[0].event_type, 'pos.sale.completed')
  assert.equal(rows[0].status, 'queued')
  assert.equal(rows[0].source_system, 'pos')
  assert.equal(rows[0].workspace_id, COMPANY_ID)
  assert.equal(rows[0].payload_workspace, COMPANY_ID)
})

test('replaying the same pending sale does not duplicate the row', async () => {
  const db = await freshDb()
  const events = [saleEvent('sale-replay', 'evt_sale_replay'), saleEvent('sale-replay-b', 'evt_sale_replay_b')]
  const first = await enqueue(db, REGISTER_TOKEN, events)
  const second = await enqueue(db, REGISTER_TOKEN, events)
  assert.equal(first.inserted, 2)
  assert.equal(second.accepted, 2)
  assert.equal(second.inserted, 0)
  const { rows } = await db.query('select count(*)::int as n from public.pos_outbox_events')
  assert.equal(rows[0].n, 2)
})

test('anon without a bound register token cannot enqueue outbox events', async () => {
  const db = await freshDb()
  await assert.rejects(enqueue(db, '', [saleEvent('no-token')]), /device_token required/)
  await assert.rejects(enqueue(db, 'short', [saleEvent('short-token')]), /device_token required/)
  await assert.rejects(enqueue(db, 'not-a-register', [saleEvent('unknown')]), /Unknown or revoked register/)
  await db.query(`update public.pos_register_devices set revoked_at = now() where device_token = $1`, [REGISTER_TOKEN])
  await assert.rejects(enqueue(db, REGISTER_TOKEN, [saleEvent('revoked')]), /Unknown or revoked register/)
  const { rows } = await db.query('select count(*)::int as n from public.pos_outbox_events')
  assert.equal(rows[0].n, 0)
})

test('a register with no company cannot enqueue', async () => {
  const db = await freshDb()
  await db.query(`update public.pos_register_devices set company_id = null where device_token = $1`, [REGISTER_TOKEN])
  await assert.rejects(enqueue(db, REGISTER_TOKEN, [saleEvent('unlinked')]), /not linked to a company/)
})

test('the device-token RPC is security definer and does not grant anon a table insert', () => {
  assert.match(migration, /enqueue_pos_outbox_events\(\s*p_device_token text,\s*p_events jsonb\s*\)/)
  assert.match(migration, /security definer/)
  assert.match(migration, /grant execute on function public\.enqueue_pos_outbox_events\(text, jsonb\) to anon, authenticated, service_role/)
  assert.doesNotMatch(migration, /grant insert on table public\.pos_outbox_events to anon/)
})

test('PIN persist calls the register RPC and a Google session still upserts the table', () => {
  assert.match(outbox, /enqueue_pos_outbox_events/)
  assert.match(outbox, /loadRegisterBinding\(\)/)
  assert.match(outbox, /\.from\('pos_outbox_events'\)/)
  assert.match(outbox, /onConflict: 'company_id,idempotency_key'/)
  assert.match(outbox, /removePendingPosOutboxEvent\(event\.idempotency_key\)/)
  assert.match(salePage, /retryPendingPosOutboxEvents/)
  assert.match(salePage, /retryPendingSkumsSaleWrites/)
})
