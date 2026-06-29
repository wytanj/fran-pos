# GitHub Commit Summaries

## Rule

Every time Codex commits and pushes this repository to GitHub, update this file in the same commit.

Add a dated entry with:

- Date and local time.
- Short change summary.
- Validation commands run.
- Any known deployment, migration, or runtime caveats.

Keep entries newest first.

## 2026-06-24 14:28 SGT

Summary:

- Added the POS-side crmOS return eligibility workflow for product + customer email + optional order date / receipt checks.
- Added durable `pos_return_checks` schema, return eligibility shared types, and a local/Supabase-backed eligibility helper.
- Updated the returns UI to add approved crmOS return lines, preserve partial line item authorization, and require admin override for manager-review or non-returnable exceptions.
- Carried crmOS decision IDs, authorization IDs, authorized quantities, match metadata, and manager override details into POS outbox and SKUMS sale metadata.
- Added the crmOS handoff doc for the cross-repo return eligibility contract.

Validation:

- `npm test`
- `npm run build`
- `git diff --check`
- `npm run db:migrate:status`
- `npm run db:migrate -- --only 00011`
- Direct database verification confirmed `pos_return_checks`, `pos_returns.return_check_id`, and `pos_return_lines.match_type`.
- Smoke checked `http://127.0.0.1:5174/pos/returns` with an HTTP 200 response.

Caveats:

- Supabase security/performance advisors could not run because the connected MCP account returned a permission error for this project.
- Browser screenshot automation was not exposed in the thread, so verification was HTTP/build/test based.
- Build passed with the existing Vite large chunk warning.
- `git diff --check` passed with line-ending normalization warnings only.

## 2026-06-10 22:28 SGT

Summary:

- Executed `docs/phase1.md` for the POS headless register over SKUMS.
- Hardened SKUMS POS shared contracts for catalog revisions, scan resolution, sale idempotency, sale response IDs, attention states, and proposal states.
- Added local SKUMS sale retry queue with stable idempotency keys and visible receipt sync status.
- Added live-mode scan fallback to SKUMS with ambiguous-match selection and safe unknown-scan handling.
- Added local-first inventory event queues for damage, found stock, and transfer receipt events with `queued`, `sent`, `synced`, `pending_approval`, and `failed` states.
- Preserved graph refs through saved baskets, returns, and exchange lines.
- Added provider-neutral payment metadata plus optional `square_pos` tender handoff metadata.
- Added provider-neutral customer receipt email and SKUMS connector health surfaces.

Validation:

- `npm test`
- `npm run build`
- `git diff --check`
- Smoke checked `http://127.0.0.1:5175/pos?mode=demo` through the POS shell with demo cashier PIN.
- Smoke checked `http://127.0.0.1:5175/pos?mode=live` to the live POS sign-in path.

Caveats:

- Build passed with the existing Vite large chunk warning.
- `git diff --check` passed with line-ending normalization warnings only.
- Runtime SKUMS writes still depend on configured live SKUMS connector credentials.
