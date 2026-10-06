export interface CartPriceInput {
  unitPrice: number
  listPrice: number
  qty: number
  lineDiscount: number
  isMarkdown: boolean
  discountLabel?: string
}

export interface CartPriceOff {
  label: string
  amount: number
}

export type CartPriceFace =
  | { kind: 'nett'; nett: number }
  | { kind: 'marked'; list: number; offs: CartPriceOff[]; nett: number }

function round2(value: number) {
  return Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100
}

export function cartPriceFace(line: CartPriceInput): CartPriceFace {
  const sign = line.qty < 0 ? -1 : 1
  const ticket = round2(line.listPrice * line.qty)
  const selling = round2(line.unitPrice * line.qty)
  const markdownOff = round2(ticket - selling)
  const lineOff = round2(line.lineDiscount * sign)
  const nett = round2(selling - lineOff)
  const offs: CartPriceOff[] = []
  const showWas = round2(line.listPrice) > round2(line.unitPrice) && markdownOff !== 0
  if (showWas) offs.push({ label: line.isMarkdown ? 'MD' : '', amount: markdownOff })
  if (lineOff !== 0) offs.push({ label: (line.discountLabel ?? '').trim(), amount: lineOff })
  if (offs.length === 0) return { kind: 'nett', nett }
  return { kind: 'marked', list: showWas ? ticket : selling, offs, nett }
}
