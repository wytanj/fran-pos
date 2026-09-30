# PR

Title: `feat(pos): add FRANBAG paper bag at $0`

Base: `master`

Head: `loop/franbag-pos`

Draft: yes. Open this from the outer loop. `gh` is not authenticated on this machine.

## Why

A cashier needs a complimentary paper bag on the sale screen. The SKU is FRANBAG and the price is 0.00. POS does not create the product in SKUMS, and it does not use a 0.10 placeholder.

## Scope

- Sale checkout has a Paper bag button. A second tap raises the quantity on the same line.
- The cart line kind is `fee`. The SKUMS item `line_type` stays `sale` or `return`. A bag sets `metadata.non_stock` to true.
- `lineCharge` in `dashboard/src/pos/lib/paper-bag.ts` forces the bag unit price, list price, discount, and line total to 0. The sale adapter, the outbox, the email receipt, the cart row, and the basket mappers use that result.
- `paperBagProduct` copies graph refs only when the catalog row already has `track_inventory` false. A missing row, or a stock-tracked row, uses local id `fee-franbag` and sends no `product_id`.
- Fran and SKUMS basket quotes omit the bag. A missing FRANBAG cannot block the quote. The completed sale, the outbox, and the email receipt still include the line.
- Line discount and price override do nothing on the bag. Quantity and remove still work.
- `.gitignore` ignores `.local/` so kick files stay out of the commit.

## Tradeoffs

SKUMS `pos_sale_items.line_type` has no fee value. The bag stays a sale line with `non_stock` metadata. A bag-only cart shows Total SGD 0.00 and Pay stays disabled. Cart-level Override total can still change the ticket. Creating the FRANBAG product row belongs to the SKUMS seed lane. This pull request does not edit Loft.

## Blast radius

Cashiers on `/pos/sale`. A bag does not change a positive merchandise total. Money for a normal line now passes through `lineCharge`. That formula matches the previous net for a return. No migration. No product create or update from POS.

## Verification

`node --test tests/paper-bag.test.mjs tests/customer-email-connector.test.mjs tests/pos-source-outbox.test.mjs` passed, 14 tests. `npx tsc -b` in `dashboard` passed.

Microsoft Edge at 1280 by 900, demo PIN 1111, `/pos/sale`. The button read Paper bag SGD 0.00. Two taps, then Hydra Veil Gel Cleanser. The bag row showed FRANBAG, SGD 0.00, Fee, quantity 2, and no price override. Total stayed SGD 38.00 with 3 items. Pay stayed disabled with the label Resolve member or exception.

At 390 by 844 the button was 366 by 36. One tap left Total SGD 0.00 and 1 item.

`npm test` still fails three cases in `tests/fran-pos-buildout.test.mjs` that already fail on `origin/master`. This diff does not change those strings. No brief was attached to this kick, and none is in the repo.
