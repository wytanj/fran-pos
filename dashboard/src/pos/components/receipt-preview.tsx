import { formatCurrency } from '@/lib/utils'
import { STORE } from '@/pos/data/mock'
import type { CompletedSale } from '@/pos/lib/pos-context'

interface ReceiptPreviewProps {
  sale: CompletedSale
  /** Renders a "DUPLICATE COPY" watermark for reprints (checklist item 24). */
  duplicate?: boolean
}

/** Thermal-receipt rendering — covers receipt format requirements (item 23). */
export function ReceiptPreview({ sale, duplicate }: ReceiptPreviewProps) {
  const franRewardTotal = sale.lines
    .filter((line) => line.lineKind === 'fran_reward' || line.lineKind === 'fran_points')
    .reduce((sum, line) => sum + line.unitPrice * line.qty - line.lineDiscount * (line.qty < 0 ? -1 : 1), 0)
  const franProjectedPoints = sale.fran?.basketPreview?.projectedPointsBalance ?? null

  return (
    <div className="mx-auto w-[320px] bg-white p-5 font-mono text-[11px] leading-relaxed text-zinc-800 shadow-inner">
      {duplicate && (
        <div className="mb-2 border border-dashed border-zinc-400 py-1 text-center font-bold tracking-widest text-zinc-500">
          *** DUPLICATE COPY ***
        </div>
      )}
      <div className="text-center">
        <p className="text-sm font-bold tracking-wide">{STORE.name.toUpperCase()}</p>
        <p>{STORE.address}</p>
        <p>Tel: {STORE.phone}</p>
        <p>{STORE.gst}</p>
      </div>

      <Divider />
      <div className="flex justify-between">
        <span>Receipt</span>
        <span>{sale.receiptNo}</span>
      </div>
      <div className="flex justify-between">
        <span>Date</span>
        <span>{sale.timestamp}</span>
      </div>
      <div className="flex justify-between">
        <span>Cashier</span>
        <span>{sale.cashier}</span>
      </div>
      {sale.salesType !== 'normal' && (
        <div className="flex justify-between font-bold uppercase">
          <span>Type</span>
          <span>{sale.salesType.replace('-', ' ')}</span>
        </div>
      )}

      <Divider />
      {sale.lines.map((l) => {
        const lineTotal = l.unitPrice * l.qty - l.lineDiscount * (l.qty < 0 ? -1 : 1)
        return (
          <div key={l.lineId} className="mb-1">
            <div className="flex justify-between">
              <span className="truncate pr-2">{l.name}</span>
              <span>{formatCurrency(lineTotal, STORE.currency)}</span>
            </div>
            <div className="flex justify-between text-zinc-500">
              <span>
                {l.sku} {l.qty < 0 ? `(RETURN ${l.qty})` : `${l.qty} @ ${formatCurrency(l.unitPrice, STORE.currency)}`}
              </span>
              {l.isMarkdown && <span>MD</span>}
            </div>
            {l.lineDiscount > 0 && (
              <div className="text-zinc-500">
                &nbsp;&nbsp;{l.discountLabel ?? 'Discount'}: -{formatCurrency(l.lineDiscount, STORE.currency)}
              </div>
            )}
            {(l.lineKind === 'fran_reward' || l.lineKind === 'fran_points') && (
              <div className="text-zinc-500">
                &nbsp;&nbsp;Fran CRM reward{l.franRewardQuoteId ? `: ${l.franRewardQuoteId}` : ''}
              </div>
            )}
            {l.overridden && (
              <div className="text-zinc-500">
                &nbsp;&nbsp;Price override{l.overrideReason ? `: ${l.overrideReason}` : ' (mgr approved)'}
              </div>
            )}
          </div>
        )
      })}

      <Divider />
      <Row label="Subtotal" value={formatCurrency(sale.subtotal, STORE.currency)} />
      {sale.discountTotal > 0 && (
        <Row label="Discounts" value={`-${formatCurrency(sale.discountTotal, STORE.currency)}`} />
      )}
      {Math.abs(franRewardTotal) > 0.005 && (
        <Row label="Reward redemption" value={formatSignedCurrency(franRewardTotal)} />
      )}
      {sale.cartPriceOverride && (
        <Row
          label={`Cart override (${sale.cartPriceOverride.reason})`}
          value={formatSignedCurrency(sale.cartPriceOverride.adjustment)}
        />
      )}
      <Row label={`GST 9% (incl.)`} value={formatCurrency(sale.tax, STORE.currency)} />
      <div className="my-1 flex justify-between text-sm font-bold">
        <span>TOTAL</span>
        <span>{formatCurrency(sale.total, STORE.currency)}</span>
      </div>

      <Divider />
      {sale.payments.map((p) => (
        <Row key={p.id} label={p.label + (p.detail ? ` ${p.detail}` : '')} value={formatCurrency(p.amount, STORE.currency)} />
      ))}

      {sale.customer && (
        <>
          <Divider />
          <p className="font-bold">Customer: {sale.customer.name}</p>
          {sale.customer.points > 0 && (
            <>
              <Row label="Points earned" value={`+${sale.pointsEarned}`} />
              <Row
                label="Points balance"
                value={`${franProjectedPoints ?? sale.customer.points + sale.pointsEarned}`}
              />
            </>
          )}
          {sale.fran?.appliedReward?.quote.pointsCost ? (
            <Row label="Points redeemed" value={`-${sale.fran.appliedReward.quote.pointsCost}`} />
          ) : null}
        </>
      )}

      <Divider />
      <div className="text-center text-[10px] text-zinc-600">
        <p className="font-bold">EXCHANGE POLICY</p>
        <p>Exchanges within 14 days with receipt.</p>
        <p>Markdown / SSS items are not returnable.</p>
        {sale.isExchange && (
          <div className="my-2 border-t border-dashed border-zinc-400 pt-2">
            <p className="font-bold">CUSTOMER SIGNATURE</p>
            <div className="mx-auto mt-3 h-8 w-40 border-b border-zinc-400" />
            <p className="mt-1">Reason: ____________________</p>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-col items-center">
        <QrPlaceholder />
        <p className="mt-1 text-[10px]">Scan to leave a Google review 🌟</p>
      </div>
      <p className="mt-2 text-center text-[10px]">Thank you for shopping with us!</p>
    </div>
  )
}

function formatSignedCurrency(value: number) {
  if (Math.abs(value) < 0.005) return formatCurrency(0, STORE.currency)
  return `${value > 0 ? '+' : '-'}${formatCurrency(Math.abs(value), STORE.currency)}`
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

function Divider() {
  return <div className="my-1.5 border-t border-dashed border-zinc-400" />
}

function QrPlaceholder() {
  // Simple decorative QR-like grid (demo only).
  return (
    <div className="grid grid-cols-7 gap-0.5">
      {Array.from({ length: 49 }).map((_, i) => {
        const on = [0, 1, 2, 4, 5, 6, 7, 13, 14, 16, 18, 20, 21, 24, 28, 30, 32, 34, 35, 41, 42, 44, 46, 47, 48].includes(i)
        return <div key={i} className={`h-1.5 w-1.5 ${on ? 'bg-zinc-800' : 'bg-white'}`} />
      })}
    </div>
  )
}
