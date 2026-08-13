/** Stripe card_present amounts are integer minor units (cents for SGD). */
export function amountToStripeCents(amount: number) {
  if (!Number.isFinite(amount) || amount < 0) return 0
  return Math.round(amount * 100)
}

export function stripeCentsToAmount(cents: number) {
  if (!Number.isFinite(cents)) return 0
  return Math.round(cents) / 100
}

export function stripeCurrencyCode(currency = 'SGD') {
  return String(currency || 'SGD').trim().toLowerCase() || 'sgd'
}
