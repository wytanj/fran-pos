/**
 * Live POS terminal store binding (TODO-LOFT Phase A.3).
 * Demo/mock keeps `mock.STORE`; live mode overrides from localStorage + optional company settings.
 */

import { STORE, type StoreDestination } from '../data/mock'

const STORAGE_KEY = 'fran_pos_store_binding_v1'

export type PosStoreBinding = {
  code: string
  name: string
  inventoryLocationId: string
  address?: string
  phone?: string
  currency?: string
}

export function defaultStoreBinding(): PosStoreBinding {
  return {
    code: STORE.code,
    name: STORE.name,
    inventoryLocationId: STORE.inventoryLocationId,
    address: STORE.address,
    phone: STORE.phone,
    currency: STORE.currency,
  }
}

export function loadStoreBinding(): PosStoreBinding {
  if (typeof window === 'undefined') return defaultStoreBinding()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultStoreBinding()
    const parsed = JSON.parse(raw) as Partial<PosStoreBinding>
    const code = String(parsed.code || '').trim().toUpperCase()
    if (!code) return defaultStoreBinding()
    return {
      code,
      name: String(parsed.name || code).trim() || code,
      inventoryLocationId: String(parsed.inventoryLocationId || code).trim() || code,
      address: parsed.address ? String(parsed.address) : undefined,
      phone: parsed.phone ? String(parsed.phone) : undefined,
      currency: parsed.currency ? String(parsed.currency) : 'SGD',
    }
  } catch {
    return defaultStoreBinding()
  }
}

export function saveStoreBinding(binding: PosStoreBinding) {
  if (typeof window === 'undefined') return
  const code = binding.code.trim().toUpperCase()
  const payload: PosStoreBinding = {
    code,
    name: binding.name.trim() || code,
    inventoryLocationId: binding.inventoryLocationId.trim() || code,
    address: binding.address,
    phone: binding.phone,
    currency: binding.currency || 'SGD',
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

/** Active store for payloads (sale, inventory events, catalog). */
export function getActiveStore(): StoreDestination {
  const b = loadStoreBinding()
  return {
    id: `store-${b.code.toLowerCase()}`,
    name: b.name,
    code: b.code,
    inventoryLocationId: b.inventoryLocationId,
    address: b.address || STORE.address,
    phone: b.phone || STORE.phone,
    gst: STORE.gst,
    currency: b.currency || STORE.currency,
  }
}

/** Whether current staff role may submit replenishment requests (signal to HQ). */
export function canRequestReplenishment(role: string | undefined | null): boolean {
  return role === 'manager' || role === 'admin' || role === 'owner'
}

/** All staff may report receive exceptions; none may HQ-verify. */
export function canReportReceive(role: string | undefined | null): boolean {
  return Boolean(role)
}

export function canHqVerify(_role: string | undefined | null): boolean {
  return false
}
