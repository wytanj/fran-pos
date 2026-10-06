import { useCallback, useEffect, useRef, useState } from 'react'
import type { StripeTerminalConfig } from '@/pos/lib/stripe-connector'
import { listStripeReaders } from '@/pos/lib/stripe-terminal-api'
import {
  chooseS700Reader,
  isSimulatedStripeReader,
  readS700ReaderChoice,
  writeS700ReaderChoice,
  type ListedS700Reader,
} from '@/pos/lib/s700-readers'

async function loadReaders(locationId: string, simulated: boolean): Promise<ListedS700Reader[] | null> {
  try {
    const result = await listStripeReaders({ location_id: locationId, simulated })
    return (result.readers || []).filter((reader) => simulated || !isSimulatedStripeReader(reader))
  } catch {
    return null
  }
}

export function useS700Readers(config: StripeTerminalConfig | null, registerId: string) {
  const enabled = Boolean(config?.enabled)
  const locationId = config?.location_id || ''
  const simulated = Boolean(config?.simulated)
  const listKey = `${enabled ? '1' : '0'}|${locationId}|${simulated ? '1' : '0'}`
  const [snapshot, setSnapshot] = useState<{ key: string; readers: ListedS700Reader[] | null } | null>(null)
  const [choice, setChoice] = useState(() => ({
    registerId,
    readerId: readS700ReaderChoice(registerId),
  }))
  const flight = useRef<Promise<ListedS700Reader[] | null> | null>(null)
  const picked = choice.registerId === registerId ? choice.readerId : readS700ReaderChoice(registerId)
  const live = snapshot?.key === listKey ? snapshot.readers : null
  const phase = !enabled ? 'idle' : snapshot?.key === listKey ? (live ? 'ready' : 'failed') : 'loading'

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const request = loadReaders(locationId, simulated)
    flight.current = request
    void request.then((readers) => {
      if (cancelled) return
      setSnapshot({ key: listKey, readers })
    })
    return () => {
      cancelled = true
    }
  }, [enabled, locationId, simulated, listKey])

  const plan = chooseS700Reader({
    config,
    live: phase === 'ready' ? live : null,
    rememberedId: picked,
    registerId,
  })

  const resolve = useCallback(async () => {
    let readers: ListedS700Reader[] | null = null
    if (enabled && snapshot?.key === listKey) readers = snapshot.readers
    else if (enabled) readers = await (flight.current ?? loadReaders(locationId, simulated))
    return chooseS700Reader({
      config,
      live: readers,
      rememberedId: picked,
      registerId,
    })
  }, [config, enabled, listKey, locationId, picked, registerId, simulated, snapshot])

  const select = useCallback((readerId: string) => {
    setChoice({ registerId, readerId })
    writeS700ReaderChoice(registerId, readerId)
  }, [registerId])

  return { plan, select, resolve, phase }
}
