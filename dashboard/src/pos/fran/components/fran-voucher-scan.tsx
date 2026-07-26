import { useState } from 'react'
import { Loader2, ScanLine, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/utils'
import { STORE } from '@/pos/data/mock'
import type { FranAuthorizeVoucherResult, FranVoucherScan } from '../types'

interface FranVoucherScanProps {
  memberId: string | null
  scans: FranVoucherScan[]
  disabled?: boolean
  densOptions?: Array<{ points: number; discount: number }>
  onAuthorize: (code: string) => Promise<FranAuthorizeVoucherResult>
  onRemove: (code: string) => void
  onQuoteDens?: (points: number) => Promise<{ code: string; label: string } | null>
}

export function FranVoucherScanPanel({
  memberId,
  scans,
  disabled,
  densOptions = [],
  onAuthorize,
  onRemove,
  onQuoteDens,
}: FranVoucherScanProps) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastOk, setLastOk] = useState<string | null>(null)

  const submit = async (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed || !memberId) return
    setLoading(true)
    setError(null)
    setLastOk(null)
    try {
      const res = await onAuthorize(trimmed)
      if (!res.valid) {
        setError(res.reason || 'Voucher not valid')
        return
      }
      setLastOk(res.label || res.code)
      setCode('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authorize failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <ScanLine className="h-4 w-4 text-violet-700" />
        <p className="text-sm font-semibold text-violet-950">Scan FWB voucher</p>
      </div>
      <p className="mb-2 text-xs text-violet-800">
        Birthday / category earn bonus, or points dens QR (200 / 500 / 1k / 1.5k / 2.5k). Demo codes:{' '}
        <code className="rounded bg-white px-1">BDAY</code>,{' '}
        <code className="rounded bg-white px-1">CAT</code>,{' '}
        <code className="rounded bg-white px-1">FWB-RDM-500-TEST01</code>
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1">
          <Label className="text-xs text-violet-900">Voucher code / QR payload</Label>
          <Input
            value={code}
            disabled={disabled || !memberId || loading}
            placeholder="Scan or type code"
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void submit(code)
              }
            }}
          />
        </div>
        <Button
          type="button"
          disabled={disabled || !memberId || loading || !code.trim()}
          onClick={() => void submit(code)}
          className="bg-violet-700 hover:bg-violet-800"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
          Authorize
        </Button>
      </div>

      {densOptions.length > 0 && onQuoteDens && memberId && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-violet-900">Issue dens QR (demo / app redeem)</p>
          <div className="flex flex-wrap gap-1.5">
            {densOptions.map((d) => (
              <Button
                key={d.points}
                type="button"
                size="sm"
                variant="outline"
                className="border-violet-300 bg-white text-xs text-violet-900"
                disabled={disabled || loading}
                onClick={() => {
                  void (async () => {
                    setLoading(true)
                    setError(null)
                    try {
                      const issued = await onQuoteDens(d.points)
                      if (issued) {
                        setCode(issued.code)
                        setLastOk(issued.label)
                      }
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Quote dens failed')
                    } finally {
                      setLoading(false)
                    }
                  })()
                }}
              >
                {d.points.toLocaleString()} pts → {formatCurrency(d.discount, STORE.currency)}
              </Button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs font-medium text-red-700">{error}</p>}
      {lastOk && !error && <p className="mt-2 text-xs font-medium text-emerald-800">Authorized: {lastOk}</p>}

      {scans.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {scans.map((s) => (
            <Badge
              key={s.code}
              variant="outline"
              className="gap-1 border-violet-300 bg-white text-violet-950"
            >
              {s.kind}: {s.code}
              <button
                type="button"
                className="ml-0.5 rounded p-0.5 hover:bg-violet-100"
                onClick={() => onRemove(s.code)}
                aria-label={`Remove ${s.code}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
