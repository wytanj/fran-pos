/**
 * Screen B — customer display contract (docs/SCREEN_A_B_PLAN.md).
 *
 * Screen A publishes a `CustomerDisplayPayload`; Screen B renders it and
 * nothing else. B never sends cart mutations back. Keep this file free of
 * runtime imports so the payload builder stays unit-testable under node.
 */

export const CUSTOMER_DISPLAY_PAYLOAD_VERSION = 1

export type CustomerDisplayState = 'idle' | 'cart' | 'paying' | 'done'

export interface CustomerDisplayLine {
  id: string
  name: string
  qty: number
  /** Net line amount after line discounts (negative for returns / rewards). */
  lineTotal: number
  /** Adjustment lines (Fran reward / points) render muted on B. */
  kind: 'product' | 'adjustment'
}

export interface CustomerDisplayMember {
  name: string
  tierLabel: string | null
}

export interface CustomerDisplayPayload {
  version: number
  state: CustomerDisplayState
  storeName: string
  storeCode: string
  laneCode: string
  currency: string
  lines: CustomerDisplayLine[]
  itemCount: number
  runningTotal: number
  /** Present only while paying / done. */
  amountDue: number | null
  /** P1 — passive member strip once tagged on A. */
  member: CustomerDisplayMember | null
  /** P1 — the ONE promo strip under the total ("S$25.00 more → F2"). */
  tiesToHit: string | null
  thankYouMessage: string | null
  receiptNo: string | null
  publishedAt: string
}

/** What Screen A keeps in localStorage after claiming its lane. */
export interface CustomerDisplayLane {
  laneId: string
  storeCode: string
  laneCode: string
  pairToken: string
  publishToken: string
}

/** What Screen B keeps in localStorage after pairing. */
export interface CustomerDisplayPairSession {
  laneId: string
  storeCode: string
  laneCode: string
  pairToken: string
  pairedAt: string
}
