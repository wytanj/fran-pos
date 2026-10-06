import { useEffect, useState } from 'react'
import { getStripeReaderStatus } from '@/pos/lib/stripe-terminal-api'
import type { StripeTerminalConfig } from '@/pos/lib/stripe-connector'

export type S700LinkStatus = 'idle' | 'checking' | 'online' | 'offline'

export function useS700Status(config: StripeTerminalConfig | null, readerId?: string | null) {
  const id = (readerId ?? config?.s700_reader_id ?? '').trim()
  const ready = Boolean(config?.enabled && id)
  const [polled, setPolled] = useState<{ id: string; status: 'online' | 'offline' } | null>(null)

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    async function tick() {
      try {
        const { reader } = await getStripeReaderStatus(id)
        if (cancelled) return
        setPolled({ id, status: reader.status === 'online' ? 'online' : 'offline' })
      } catch {
        if (!cancelled) setPolled({ id, status: 'offline' })
      }
    }
    void tick()
    const timer = window.setInterval(() => void tick(), 20_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [ready, id])

  if (!ready) return 'idle'
  if (!polled || polled.id !== id) return 'checking'
  return polled.status
}
