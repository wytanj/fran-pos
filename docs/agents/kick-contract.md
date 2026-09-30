# Kick contract

Repo `fran-pos`. Default branch `master`. Branch `loop/cut-crud-floor`. Slug `cut-crud-floor`. Engine `grok-4.7`.

This file is the handback for a kicked session. Class A work stays in the session. Class B, C, and D stay with the outer loop.

## Owed back

Push `loop/cut-crud-floor`. Do not open the pull request from this machine. `gh` is not authenticated here.

Draft title and body live in this file and in `docs/agents/PR.md`.

When `%USERPROFILE%\.config\agent-loop\done-webhook.env` is present, POST `session_done` with `Authorization: Bearer` and `X-Automation-Key` set to `DONE_WEBHOOK_KEY`. Do not print the key. Shape is in `agent-home/done-webhook.md`.

This kick had no brief path. There is no brief to delete.

## Class A

Done in this worktree. Code, source contracts, and the branch push. No second worktree. The owner checkout was not touched.

## Class B

None.

## Class C

Do not run these here. After the draft exists and the checks are green, the outer loop can:

1. Open the draft against `master` using the title and body below.
2. Merge that pull request into `master`.
3. Run `vercel --prod` only if this app already ships that way after merge.

`class_c_ready` is false until those checks are green. Seven source-contract failures are already on `origin/master`.

## Class D

Do not apply migrations. This change adds none. Do not run `npm run db:migrate`.

## PR title

`refactor(pos): drop local catalog edits and free-form inbound`

## PR body

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

`npm test` on 2026-10-01. 89 passed and 7 failed. The new contracts passed. `Stock page does not write a free-form inbound or edit inventory_count`. `POS floor adjustments use a closed reason list and transfer receipt stays structured`. `Catalog cache syncs from SKUMS and POS does not create products`.

Seven other source contracts failed. They also fail on `origin/master`. `sale.tsx` has no `setCatalogSource('live')` or `setCatalogSource('skums')`. `pos-login.tsx` has no `signInWithGoogle('/pos')` and no `Incorrect or locked passcode`. The Fran CRM files lack the three strings those tests match.

`npx tsc -b` in `dashboard` did not typecheck. `dashboard/node_modules` contains only `.tmp`, and the repo root has no `node_modules`. Dependencies were not installed.

No browser pass. The changed screens are client routes.
