import { useEffect, useState } from 'react'
import { getStripeReaderStatus } from '@/pos/lib/stripe-terminal-api'
import { stripeS700Ready, type StripeTerminalConfig } from '@/pos/lib/stripe-connector'

export type S700LinkStatus = 'idle' | 'checking' | 'online' | 'offline'

export function useS700Status(config: StripeTerminalConfig | null) {
  const [status, setStatus] = useState<S700LinkStatus>('idle')
  const ready = stripeS700Ready(config)

  useEffect(() => {
    if (!ready || !config?.s700_reader_id) {
      setStatus('idle')
      return
    }

    let cancelled = false
    const readerId = config.s700_reader_id

    async function tick() {
      try {
        const { reader } = await getStripeReaderStatus(readerId)
        if (cancelled) return
        setStatus(reader.status === 'online' ? 'online' : 'offline')
      } catch {
        if (!cancelled) setStatus('offline')
      }
    }

    setStatus('checking')
    void tick()
    const timer = window.setInterval(() => void tick(), 20_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [ready, config?.s700_reader_id])

  return status
}
