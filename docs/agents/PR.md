# PR

Title: `refactor(pos): drop local catalog edits and free-form inbound`

Base: `master`

Head: `loop/cut-crud-floor`

Draft: yes. Open this from the outer loop. `gh` is not authenticated on this machine.

## Why

SKUMS owns the catalog and the stock ledger. POS still let staff create, edit, and delete products, type a floor reason, and receive stock from a free-form form that wrote `inventory_count`. Loft was still named as a place to accept stock or send overflow. Loft is retired. Overflow goes to the Fran 2000sqft warehouse.

## Scope

- `useCreateProduct`, `useUpdateProduct`, and `useDeleteProduct` are gone. The products page and the empty-catalog card only sync from SKUMS.
- The stock page no longer has an inbound form. `createStockInboundPayload` is gone. The stock page does not update `products.inventory_count`.
- A floor report sends `inventory.damage.reported`. `reason_code` is only `damaged`, `expired`, `tester`, or `other` (`FLOOR_ADJUSTMENT_REASONS`, `parseFloorAdjustmentReason`).
- Transfer overflow destination is `WH-FRAN-2000`, Fran 2000sqft WH. Receive delivery and request stock no longer name Loft as the place staff collect from or order.
- SKUMS catalog sync still inserts and updates the local product cache, and it still copies SKUMS `stock_quantity` into `inventory_count`. That row is a display cache.

## Tradeoffs

Found stock and cycle count are no longer actions on the stock page. The locked reason list is Damaged, Expired, Tester, and Other. All four use the existing damage event, so POS does not add a new SKUMS event type. POS has no short-date gate. None was added, and none was pointed at Loft.

## Blast Radius

Staff lose product create, edit, and delete, and they lose free-form receive on the stock page. Inbound is Receive delivery or Transfers. A live floor report still queues `pos_inventory_events` and posts to SKUMS. Sellable stock stays unchanged until SKUMS applies the report. Demo mode still moves the on-screen count for that report. This change adds no migration.

## Verification

`npm test` on 2026-10-01. 89 passed and 7 failed. The new contracts passed. `Stock page does not write a free-form inbound or edit inventory_count`. `POS floor adjustments use a closed reason list and transfer receipt stays structured`. `Catalog cache syncs from SKUMS and POS does not create products`. The 7 failures are already on `origin/master`. `sale.tsx` has no `setCatalogSource('live')` or `setCatalogSource('skums')`. `pos-login.tsx` has no `signInWithGoogle('/pos')` and no `Incorrect or locked passcode`. The Fran CRM files lack the three strings those tests match.

`npx tsc -b` in `dashboard` did not typecheck. `dashboard/node_modules` contains only `.tmp`, and the repo root has no `node_modules`. Dependencies were not installed.

No browser pass. The changed screens are client routes.
