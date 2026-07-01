import { STORE } from '@/pos/data/mock'
import type { CartLine, CompletedSale } from '@/pos/lib/pos-context'

export interface ReceiptRewardRedemption {
  lineId: string
  rewardName: string
  rewardId: string | null
  rewardQuoteId: string | null
  status: 'redeemed' | 'reversed' | 'failed' | 'quoted'
  pointsUsed: number
  dollarEquivalent: number | null
  netDollarValueApplied: number
  currency: string
}

export function isFranRewardReceiptLine(line: Pick<CartLine, 'lineKind'>) {
  return line.lineKind === 'fran_reward' || line.lineKind === 'fran_points'
}

export function cartLineNetValue(line: Pick<CartLine, 'unitPrice' | 'qty' | 'lineDiscount'>) {
  return line.unitPrice * line.qty - line.lineDiscount * (line.qty < 0 ? -1 : 1)
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function rewardStatus(sale: CompletedSale): ReceiptRewardRedemption['status'] {
  const status = sale.fran?.appliedReward?.status
  if (status === 'reversed') return 'reversed'
  if (status === 'failed' || status === 'reverse_failed') return 'failed'
  if (status === 'quoted') return 'quoted'
  return 'redeemed'
}

export function buildReceiptRewardRedemptions(sale: CompletedSale): ReceiptRewardRedemption[] {
  const appliedReward = sale.fran?.appliedReward ?? null
  const quote = appliedReward?.quote ?? null
  const status = rewardStatus(sale)

  return sale.lines
    .filter(isFranRewardReceiptLine)
    .map((line) => {
      const matchesQuote = Boolean(quote && line.franRewardQuoteId === quote.quoteId)
      const netDollarValueApplied = roundCurrency(Math.abs(cartLineNetValue(line)))
      return {
        lineId: line.lineId,
        rewardName: matchesQuote ? quote!.title : line.discountLabel || line.name,
        rewardId: matchesQuote ? quote!.rewardId : null,
        rewardQuoteId: line.franRewardQuoteId ?? (matchesQuote ? quote!.quoteId : null),
        status,
        pointsUsed: matchesQuote ? quote!.pointsCost : 0,
        dollarEquivalent: netDollarValueApplied > 0 ? netDollarValueApplied : null,
        netDollarValueApplied,
        currency: matchesQuote ? quote!.currency : STORE.currency,
      }
    })
}
