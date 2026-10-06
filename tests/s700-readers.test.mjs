import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  chooseS700Reader,
  configuredS700Readers,
  defaultS700ReaderId,
  readerIdAfterEdit,
  hasConfiguredS700Reader,
  isSimulatedStripeReader,
  reRegisterNeedsConfirm,
  S700_OFFLINE_MESSAGE,
  s700ReaderStorageKey,
  writeS700ReaderChoice,
  readS700ReaderChoice,
} from '../dashboard/src/pos/lib/s700-readers.ts'

const online = (id, label) => ({
  id,
  label,
  status: 'online',
  device_type: 'stripe_s700',
  serial_number: id,
  action_type: null,
})

test('a legacy reader id sends with no picker', () => {
  const plan = chooseS700Reader({
    config: { s700_reader_id: 'tmr_1', s700_readers: [] },
    live: [online('tmr_1', 'Counter')],
    rememberedId: null,
    registerId: 'REG-01',
  })
  assert.deepEqual(plan, { kind: 'send', readerId: 'tmr_1', label: 'S700' })
})

test('two online readers keep the remembered reader and show a picker', () => {
  const plan = chooseS700Reader({
    config: {
      s700_reader_id: 'tmr_a',
      s700_readers: [
        { id: 'tmr_a', label: 'S700 Bugis' },
        { id: 'tmr_b', label: 'S700 Counter 2' },
      ],
    },
    live: [online('tmr_a', 'S700 Bugis'), online('tmr_b', 'S700 Counter 2')],
    rememberedId: 'tmr_b',
    registerId: 'REG-01',
  })
  assert.equal(plan.kind, 'choose')
  assert.equal(plan.selectedId, 'tmr_b')
  assert.equal(plan.canSend, true)
  assert.equal(plan.notice, null)
})

test('an offline remembered reader falls back to the first online reader', () => {
  const plan = chooseS700Reader({
    config: {
      s700_reader_id: 'tmr_a',
      s700_readers: [
        { id: 'tmr_a', label: 'S700 Bugis' },
        { id: 'tmr_b', label: 'S700 Counter 2' },
      ],
    },
    live: [
      { ...online('tmr_a', 'S700 Bugis'), status: 'offline' },
      online('tmr_b', 'S700 Counter 2'),
    ],
    rememberedId: 'tmr_a',
    registerId: 'REG-01',
  })
  assert.equal(plan.kind, 'choose')
  assert.equal(plan.selectedId, 'tmr_b')
  assert.equal(plan.canSend, true)
  assert.equal(plan.notice, 'S700 Bugis is offline. Using S700 Counter 2.')
})

test('a placeholder is visible and cannot be charged', () => {
  const plan = chooseS700Reader({
    config: {
      s700_reader_id: 'tmr_b',
      s700_readers: [
        { id: '', label: 'S700 Warehouse' },
        { id: 'tmr_b', label: 'S700 Counter 2' },
      ],
    },
    live: [online('tmr_b', 'S700 Counter 2')],
    rememberedId: null,
    registerId: 'REG-01',
  })
  assert.equal(plan.kind, 'choose')
  const placeholder = plan.readers.find((reader) => reader.label === 'S700 Warehouse')
  assert.equal(placeholder.link, 'unpaired')
  assert.equal(placeholder.selectable, false)
  assert.equal(plan.selectedId, 'tmr_b')
  assert.equal(plan.canSend, true)
})

test('one offline reader does not send', () => {
  const plan = chooseS700Reader({
    config: { s700_reader_id: 'tmr_1' },
    live: [{ ...online('tmr_1', 'S700'), status: 'offline' }],
    rememberedId: null,
    registerId: 'REG-01',
  })
  assert.deepEqual(plan, {
    kind: 'blocked',
    readerId: 'tmr_1',
    message: S700_OFFLINE_MESSAGE,
  })
})

test('a failed reader list still sends the saved reader', () => {
  const plan = chooseS700Reader({
    config: { s700_reader_id: 'tmr_1' },
    live: null,
    rememberedId: 'tmr_1',
    registerId: 'REG-01',
  })
  assert.deepEqual(plan, { kind: 'send', readerId: 'tmr_1', label: 'S700' })
})

test('a reader assigned to this register wins when nothing is remembered', () => {
  const plan = chooseS700Reader({
    config: {
      s700_reader_id: 'tmr_a',
      s700_readers: [
        { id: 'tmr_a', label: 'S700 Bugis', register_id: 'OTHER' },
        { id: 'tmr_b', label: 'S700 Counter 2', register_id: 'REG-01' },
      ],
    },
    live: [online('tmr_a', 'A'), online('tmr_b', 'B')],
    rememberedId: null,
    registerId: 'REG-01',
  })
  assert.equal(plan.selectedId, 'tmr_b')
})

test('reader list helpers keep the legacy id and skip simulated hardware', () => {
  assert.deepEqual(configuredS700Readers({ s700_reader_id: 'tmr_1', s700_readers: [] }), [
    { id: 'tmr_1', label: 'S700', register_id: null },
  ])
  assert.equal(hasConfiguredS700Reader({ s700_readers: [{ id: '', label: 'Planned' }] }), false)
  assert.equal(hasConfiguredS700Reader({ s700_readers: [{ id: 'tmr_9', label: 'Counter' }] }), true)
  assert.equal(defaultS700ReaderId([{ id: 'tmr_a', label: 'A' }, { id: 'tmr_b', label: 'B' }], 'tmr_b'), 'tmr_b')
  assert.equal(defaultS700ReaderId([{ id: 'tmr_a', label: 'A' }], 'tmr_gone'), 'tmr_a')
  assert.equal(defaultS700ReaderId([], 'tmr_1'), 'tmr_1')
  assert.equal(readerIdAfterEdit([], 'tmr_1'), '')
  assert.equal(readerIdAfterEdit(undefined, 'tmr_1'), 'tmr_1')
  assert.equal(isSimulatedStripeReader({ device_type: 'simulated_wisepos_e' }), true)
  assert.equal(isSimulatedStripeReader({ device_type: 'stripe_s700' }), false)
  assert.equal(reRegisterNeedsConfirm('tmr_a', ['tmr_a']), true)
  assert.equal(reRegisterNeedsConfirm('tmr_new', ['tmr_a']), false)
})

test('the per-register choice is stored under fran-pos:s700-reader', () => {
  const saved = new Map()
  const storage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
  }
  assert.equal(s700ReaderStorageKey('REG-01'), 'fran-pos:s700-reader:REG-01')
  writeS700ReaderChoice('REG-01', 'tmr_b', storage)
  assert.equal(readS700ReaderChoice('REG-01', storage), 'tmr_b')
  assert.equal(readS700ReaderChoice('REG-02', storage), null)
})

test('the sale path never registers a reader and the charge uses the chosen id', () => {
  const collect = readFileSync(new URL('../dashboard/src/pos/lib/stripe-collect.ts', import.meta.url), 'utf8')
  const payment = readFileSync(new URL('../dashboard/src/pos/components/payment-modal.tsx', import.meta.url), 'utf8')
  const fran = readFileSync(new URL('../dashboard/src/pos/fran/components/fran-customer-modal.tsx', import.meta.url), 'utf8')
  const settings = readFileSync(new URL('../dashboard/src/pages/settings/integrations.tsx', import.meta.url), 'utf8')
  const server = readFileSync(new URL('../api/stripe-terminal.ts', import.meta.url), 'utf8')

  const inPerson = collect.slice(
    collect.indexOf('export async function collectStripeInPerson'),
    collect.indexOf('export async function cancelStripeCollection'),
  )
  assert.match(inPerson, /input\.readerId/)
  assert.match(inPerson, /processS700Payment\(\{\s*readerId,/)
  assert.doesNotMatch(inPerson, /s700_reader_id/)
  assert.match(collect, /input\.readerId\.trim\(\)/)
  assert.doesNotMatch(payment, /registerStripeReader|register_reader/)
  assert.doesNotMatch(fran, /registerStripeReader|register_reader/)
  assert.match(payment, /readerIdFromPlan/)
  assert.match(settings, /This restarts the reader/)
  assert.match(settings, /listStripeReaders/)
  assert.match(settings, /Not paired yet/)
  assert.match(server, /action === 'list_readers'/)
  assert.match(server, /isSimulatedReader/)
  assert.doesNotMatch(server.slice(server.indexOf("action === 'list_readers'"), server.indexOf("action === 'register_reader'")), /readers\.create/)
})
