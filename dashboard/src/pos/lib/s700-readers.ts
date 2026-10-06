import type { S700ReaderConfig } from '@pos/shared'

export type { S700ReaderConfig }

export interface ListedS700Reader {
  id: string
  label: string | null
  status: string | null
  device_type: string | null
  serial_number: string | null
  action_type: string | null
}

export type S700Link = 'online' | 'offline' | 'busy' | 'unknown' | 'unpaired'

export interface S700ReaderChoiceRow {
  key: string
  id: string
  label: string
  registerId: string | null
  link: S700Link
  selectable: boolean
}

export type S700SendPlan =
  | { kind: 'empty' }
  | { kind: 'send'; readerId: string; label: string }
  | { kind: 'blocked'; readerId: string | null; message: string }
  | {
      kind: 'choose'
      readers: S700ReaderChoiceRow[]
      selectedId: string | null
      notice: string | null
      canSend: boolean
      message: string | null
    }

export const S700_OFFLINE_MESSAGE = 'S700 is offline or restarting. Try again, or pick Tap to Pay / cash'

const BUSY_MESSAGE = 'S700 is busy on another payment. Try again, or pick Tap to Pay / cash'
const UNPAIRED_MESSAGE = 'S700 is not paired yet. Register it in Settings, or pick Tap to Pay / cash'

type ReaderConfigSource = {
  s700_reader_id?: string | null
  s700_readers?: S700ReaderConfig[] | null
} | null | undefined

type KeyValueStore = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function s700ReaderStorageKey(registerId: string) {
  return `fran-pos:s700-reader:${registerId || 'register'}`
}

function browserStorage(): KeyValueStore | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

export function readS700ReaderChoice(registerId: string, storage: KeyValueStore | null = browserStorage()) {
  try {
    const value = storage?.getItem(s700ReaderStorageKey(registerId))?.trim() || ''
    return value || null
  } catch {
    return null
  }
}

export function writeS700ReaderChoice(
  registerId: string,
  readerId: string,
  storage: KeyValueStore | null = browserStorage(),
) {
  try {
    const id = readerId.trim()
    if (!id || !storage) return
    storage.setItem(s700ReaderStorageKey(registerId), id)
  } catch {
    return
  }
}

export function copyS700Readers(readers: S700ReaderConfig[] | null | undefined): S700ReaderConfig[] | undefined {
  if (!Array.isArray(readers)) return undefined
  return readers.map((reader) => ({
    id: String(reader?.id || '').trim(),
    label: String(reader?.label || '').trim() || 'S700',
    register_id: reader?.register_id ? String(reader.register_id).trim() : null,
  }))
}

export function configuredS700Readers(config: ReaderConfigSource): S700ReaderConfig[] {
  const copied = copyS700Readers(config?.s700_readers)
  if (copied && copied.length > 0) return copied
  const id = String(config?.s700_reader_id || '').trim()
  if (!id) return []
  return [{ id, label: 'S700', register_id: null }]
}

export function hasConfiguredS700Reader(config: ReaderConfigSource) {
  return configuredS700Readers(config).some((reader) => reader.id.trim().length > 0)
}

export function defaultS700ReaderId(readers: S700ReaderConfig[] | null | undefined, explicitId: string | null | undefined) {
  const explicit = String(explicitId || '').trim()
  const list = readers || []
  if (list.length === 0) return explicit
  if (explicit && list.some((reader) => reader.id === explicit)) return explicit
  return list.find((reader) => reader.id)?.id || ''
}

export function readerIdAfterEdit(readers: S700ReaderConfig[] | null | undefined, explicitId: string | null | undefined) {
  if (!readers) return String(explicitId || '').trim()
  if (readers.length === 0) return ''
  return defaultS700ReaderId(readers, explicitId)
}

export function isSimulatedStripeReader(reader: { device_type?: string | null }) {
  return String(reader.device_type || '').toLowerCase().includes('simulated')
}

export function reRegisterNeedsConfirm(readerId: string, pairedIds: string[]) {
  const id = readerId.trim()
  return Boolean(id && pairedIds.includes(id))
}

function readerLink(id: string, live: ListedS700Reader[] | null): S700Link {
  if (!id.trim()) return 'unpaired'
  if (live == null) return 'unknown'
  const row = live.find((reader) => reader.id === id)
  if (!row) return 'unpaired'
  if (row.status !== 'online') return 'offline'
  if (row.action_type) return 'busy'
  return 'online'
}

function sendable(link: S700Link) {
  return link === 'online' || link === 'unknown'
}

function blockMessage(link: S700Link) {
  if (link === 'busy') return BUSY_MESSAGE
  if (link === 'unpaired') return UNPAIRED_MESSAGE
  return S700_OFFLINE_MESSAGE
}

function skipNotice(preferred: S700ReaderChoiceRow, next: S700ReaderChoiceRow) {
  if (preferred.link === 'offline') return `${preferred.label} is offline. Using ${next.label}.`
  if (preferred.link === 'busy') return `${preferred.label} is busy. Using ${next.label}.`
  if (preferred.link === 'unpaired') return `${preferred.label} is not paired yet. Using ${next.label}.`
  return null
}

export function chooseS700Reader(input: {
  config: ReaderConfigSource
  live: ListedS700Reader[] | null
  rememberedId: string | null
  registerId: string | null
}): S700SendPlan {
  const configured = configuredS700Readers(input.config)
  if (configured.length === 0) return { kind: 'empty' }

  const rows: S700ReaderChoiceRow[] = configured.map((reader, index) => {
    const link = readerLink(reader.id, input.live)
    return {
      key: reader.id ? `${reader.id}:${index}` : `placeholder:${index}`,
      id: reader.id,
      label: reader.label,
      registerId: reader.register_id ? String(reader.register_id) : null,
      link,
      selectable: sendable(link),
    }
  })

  const preferred =
    rows.find((row) => input.rememberedId && row.id === input.rememberedId) ||
    rows.find((row) => input.registerId && row.registerId === input.registerId && row.id) ||
    rows.find((row) => input.config?.s700_reader_id && row.id === input.config.s700_reader_id) ||
    rows[0]

  const selected = preferred && sendable(preferred.link)
    ? preferred
    : rows.find((row) => row.selectable && row.id) || null

  if (rows.length === 1) {
    const only = rows[0]
    if (only.selectable && only.id) return { kind: 'send', readerId: only.id, label: only.label }
    return { kind: 'blocked', readerId: only.id || null, message: blockMessage(only.link) }
  }

  const notice = selected && preferred && selected.key !== preferred.key ? skipNotice(preferred, selected) : null
  const canSend = Boolean(selected?.id)
  return {
    kind: 'choose',
    readers: rows,
    selectedId: selected?.id || null,
    notice,
    canSend,
    message: canSend ? null : blockMessage(preferred?.link || 'offline'),
  }
}

export function readerIdFromPlan(plan: S700SendPlan) {
  if (plan.kind === 'send') return plan.readerId
  if (plan.kind === 'choose' && plan.canSend && plan.selectedId) return plan.selectedId
  return null
}

export function sendBlockMessage(plan: S700SendPlan) {
  if (plan.kind === 'blocked') return plan.message
  if (plan.kind === 'choose' && plan.message) return plan.message
  if (plan.kind === 'empty') return 'Register an S700 reader in Settings → Integrations'
  return S700_OFFLINE_MESSAGE
}
