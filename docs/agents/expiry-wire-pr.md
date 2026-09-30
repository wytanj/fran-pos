## Why

A cashier can record a batch code and an expiry day on the stock paths that already exist. Those values travel as `batch_code`, `expiry_year`, `expiry_month`, and `expiry_day` on the payloads POS already posts.

An outbound transfer to Fran WH (2000 sqft) or a store is blocked when a known lot has fewer than 273 days of shelf life. The cashier can send it after entering a reason. The same 273 days are `floor(9 * 30.44)`, which is the SKUMS near-expiry rule. A line with no expiry day does not block.

Overflow goes to Fran WH, code `WH-FRAN-2000`. Loft is removed from the destination list. This change does not call Loft.

## Scope

- `parseLotDate`, `lotWireFields`, and `evaluateShortDateGate` in `dashboard/src/pos/lib/lot-date.ts`
- `SkumsLotExpiryFields` on `SkumsPosInventoryEventInput`
- Stock inbound, floor reports, receive lines, and transfer lines
- Destinations `WH-FRAN-2000`, `FRAN02`, and `SG03`

Sale checkout is unchanged.

## Tradeoffs

The gate matches SKUMS instead of inventing a second shelf-life number. SKUMS receive still ignores the new line fields until the expiry-wiring change reads them. POS already stores the fields on `pos_inventory_events.payload`.

## Blast radius

Store staff see the new fields on Stock, Receive delivery, and Transfer out. A short-dated transfer stays a draft until someone enters a reason. Checkout and payments are untouched. No migration runs with this pull request.

## Verification

`node --test tests/lot-date.test.mjs` passed, 10 tests. `npx tsc -b` in `dashboard` passed. `tests/live-demo-mode.test.mjs` covers the destination list and still passes the stock and transfer cases. Seven older contract tests fail on sale and login files this branch does not edit. No browser was available, so the transfer screen was not clicked.
