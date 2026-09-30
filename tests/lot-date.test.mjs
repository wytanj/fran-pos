import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FRAN_WH_DESTINATION,
  evaluateShortDateGate,
  lotWireFields,
  parseLotDate,
  shortDateMinDays,
} from '../dashboard/src/pos/lib/lot-date.ts'

const today = new Date(2026, 9, 1)

test('parseLotDate turns an ISO day into batch and expiry fields', () => {
  const parsed = parseLotDate({ batchCode: ' LOT-9 ', expiryDate: '2026-12-01' })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.deepEqual(parsed.lot, {
    kind: 'dated',
    batch_code: 'LOT-9',
    expiry_year: 2026,
    expiry_month: 12,
    expiry_day: 1,
  })
  assert.deepEqual(lotWireFields(parsed.lot), {
    batch_code: 'LOT-9',
    expiry_year: 2026,
    expiry_month: 12,
    expiry_day: 1,
  })
})

test('parseLotDate keeps a batch code when the expiry day is blank', () => {
  const parsed = parseLotDate({ batchCode: 'LOT-1', expiryDate: '  ' })
  assert.deepEqual(parsed, { ok: true, lot: { kind: 'batch_only', batch_code: 'LOT-1' } })
  assert.deepEqual(lotWireFields(parsed.ok ? parsed.lot : null), {
    batch_code: 'LOT-1',
    expiry_year: null,
    expiry_month: null,
    expiry_day: null,
  })
})

test('parseLotDate treats blank input as no lot', () => {
  assert.deepEqual(parseLotDate({ batchCode: '', expiryDate: '' }), {
    ok: true,
    lot: { kind: 'absent' },
  })
})

test('parseLotDate rejects a day that is not on the calendar', () => {
  const parsed = parseLotDate({ expiryDate: '2026-02-31' })
  assert.equal(parsed.ok, false)
  if (parsed.ok) return
  assert.match(parsed.error, /calendar/)
})

test('short-date gate blocks a lot inside 9 months on the Fran WH path', () => {
  const parsed = parseLotDate({ batchCode: 'A', expiryDate: '2026-12-01' })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const result = evaluateShortDateGate({
    lines: [{ sku: 'SKN-1', lot: parsed.lot }],
    destinationCode: FRAN_WH_DESTINATION.code,
    today,
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.reason, 'short_date')
  assert.deepEqual(result.blocked, [
    { sku: 'SKN-1', days_until_expiry: 61, expiry_date: '2026-12-01' },
  ])
  assert.equal(result.min_days, shortDateMinDays())
})

test('a lot with exactly the minimum shelf life can leave for a store', () => {
  const parsed = parseLotDate({ expiryDate: '2027-07-01' })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const result = evaluateShortDateGate({
    lines: [{ sku: 'SKN-1', lot: parsed.lot }],
    destinationCode: 'FRAN02',
    today,
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.blocked, [])
  assert.equal(result.overridden, false)
})

test('one day inside the minimum shelf life stays blocked', () => {
  const parsed = parseLotDate({ expiryDate: '2027-06-30' })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const result = evaluateShortDateGate({
    lines: [{ sku: 'SKN-1', lot: parsed.lot }],
    destinationCode: 'SG03',
    today,
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.blocked[0].days_until_expiry, 272)
})

test('a line with no expiry date does not trip the gate', () => {
  const result = evaluateShortDateGate({
    lines: [{ sku: 'SKN-1', lot: { kind: 'absent' } }],
    destinationCode: FRAN_WH_DESTINATION.code,
    today,
  })
  assert.equal(result.ok, true)
})

test('a reason lets short-dated stock leave and keeps the blocked list', () => {
  const parsed = parseLotDate({ batchCode: 'A', expiryDate: '2026-11-01' })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  const blocked = evaluateShortDateGate({
    lines: [{ sku: 'SKN-1', lot: parsed.lot }],
    destinationCode: FRAN_WH_DESTINATION.code,
    overrideReason: '   ',
    today,
  })
  assert.equal(blocked.ok, false)

  const allowed = evaluateShortDateGate({
    lines: [{ sku: 'SKN-1', lot: parsed.lot }],
    destinationCode: FRAN_WH_DESTINATION.code,
    overrideReason: 'manager approved display',
    today,
  })
  assert.equal(allowed.ok, true)
  if (!allowed.ok) return
  assert.equal(allowed.overridden, true)
  assert.equal(allowed.blocked.length, 1)
  assert.equal(allowed.blocked[0].sku, 'SKN-1')
})

test('Loft and the old central-fulfilment code are not outbound destinations', () => {
  for (const code of ['LOFT-SG', 'Send to Loft', 'WH01']) {
    const result = evaluateShortDateGate({
      lines: [],
      destinationCode: code,
      today,
    })
    assert.equal(result.ok, false, code)
    if (result.ok) continue
    if (code === 'WH01') assert.equal(result.reason, 'unknown_destination')
    else assert.equal(result.reason, 'loft_destination')
  }
})
