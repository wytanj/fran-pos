# CRM workspace routing vs. CRM policy — the difference, and the current bug

## Canonical division of responsibility

> SKUMS provisions the resources the POS can sell. CRM determines the value of such
> transactions for members. POS collects the actual transactions.

Matches the existing contract at `docs/fran-pos-crm-skums-contract.md:5-9`. Every concern below
maps onto exactly one of these three systems — the bug this plan fixes is a case where a POS
setting quietly tried to answer a question that belongs to SKUMS.

## The three concerns, kept separate

**1. Workspace identity/routing** — "which CRM tenant does this store's customer data belong to."

- Owned entirely by SKUMS via `workspace_crm_links` (lives in the SKUMS repo, not this one).
- Country-scoped: customers get one shared rewards/settings pool per country, so every Fran
  store in the same country resolves to the same CRM workspace. Many stores → one workspace.
- SKUMS decides the inventory workspace for a store; the CRM workspace is inherited from that
  decision. Fran POS is a pure consumer here — it must never store, cache, or guess this value
  independently of SKUMS.
- Confirmed in code: `dashboard/src/pos/fran/lib/fran-crm-client.ts:120-123` (`forSkumsLoyaltyBody`)
  deliberately strips any local `workspaceId` before calling through SKUMS, because "SKUMS
  injects the linked crm_workspace_id from workspace_crm_links" (same file, lines 116-118).

**2. CRM loyalty policy** — "what are the earn rates, tiers, redemption rules, and rewards
catalogue for this workspace."

- A versioned bundle (`FranLoyaltyPolicyBundle`), fetched from Fran CRM once the workspace is
  known, cached locally for offline resilience (`fran-crm-client.ts` `getActivePolicy`), and
  evaluated against a SKUMS basket quote entirely inside POS
  (`dashboard/src/pos/fran/lib/fran-policy-evaluator.ts`).
- `docs/fran-pos-crm-skums-contract.md:25`: the bundle is cached "by workspace, **program**,
  policy version, and assignment" — program/policy/assignment are CRM-internal business
  concepts. SKUMS has no visibility into any of this and no say in it.
- This is what the user meant: **the CRM's policy content has no impact on SKUMS.** SKUMS
  answers "which workspace"; CRM policy answers "what are this workspace's loyalty rules."
  Different systems, different lifecycles, no coupling.

**3. CRM connectivity settings** — "how do we reach Fran CRM at all" (endpoint URL, mock vs.
live toggle). Legitimate local configuration for testing/staging, independent of both of the
above.

## Where the bug lives: (1) and (3) got merged into one settings surface

`dashboard/src/pages/settings/integrations.tsx:75-78, 222-225` and
`dashboard/src/pos/fran/lib/fran-crm-client.ts:76-86` (`browserFranCrmSettings`) let someone
type a **CRM workspace ID directly into a browser's localStorage**. That field pretends to
answer concern (1) — the exact question that only SKUMS's `workspace_crm_links` is allowed to
answer. It is:

- **Not scoped to company** — a device that ever served two companies keeps whichever
  workspace ID was typed last.
- **Not scoped to country** — nothing stops a value cached for one country's workspace from
  silently being used by a store in a different country.
- **Not server-side** — no Supabase row, no audit trail, no RLS; purely a per-browser cache.

And in `dashboard/src/pos/pages/sale.tsx:429-437`, the fallback chain reaches this value
whenever `skumsConnector` is absent:

```js
const franCrm = useMemo(() => {
  if (skumsConnector) return createFranCrmClient({ mode: 'skums', skums: skumsConnector }) // correct
  if (isFranCrmLiveConfigured()) return createFranCrmClient({ mode: 'live' })  // ⚠️ legacy, uses the field above
  if (mode === 'demo') return createFranCrmClient({ mode: 'mock' })
  return createFranCrmClient()  // ⚠️ falls back to FRAN_CRM_DEMO_WORKSPACE_ID
}, [skumsConnector, mode])
```

Comment above this block already flags it as legacy: "Target: loyalty via SKUMS workspace key
(POS → SKUMS → CRM). Fallback: legacy direct CRM URL." The fallback predates the SKUMS-as-sole-
broker decision and is the one path that can produce a real many-to-one violation — a store
silently transacting against the wrong country's (or wrong company's) loyalty pool.

## Correction after reading the actual Settings UI

The manual "Legacy workspace ID" field is **not** a bare, unlabeled footgun — it already sits
inside a collapsed `<details>` in `dashboard/src/pages/settings/integrations.tsx:441-486`
titled "Advanced / dev: direct CRM URL (not for production)," with copy stating "Only use when
debugging CRM without SKUMS. Production path is SKUMS-only." The UI already tells the truth.
**The gap is that the runtime code doesn't enforce what the label promises.**

Two ways the legacy path activates without anyone consciously choosing it for the current
session:

1. `fran-crm-client.ts:101,104` — `isFranCrmLiveConfigured()` reads
   `import.meta.env.VITE_FRAN_CRM_URL`, a **build-time env var shared by the whole Vercel
   deployment** (every company, every store), and returns `true` from its mere presence alone
   — no localStorage check, no explicit opt-in for this session. If that var is ever set (even
   a leftover from a staging build), every live-mode sale on every device silently uses the
   legacy path.
2. Saved `localStorage` values from the advanced panel (`fran_crm_endpoint_url`,
   `fran_crm_offline_mode`) never expire and aren't scoped to a session or a company — they
   persist indefinitely on that browser, including across a company switch.

## Proposed fix (implemented)

1. **Keep** the advanced/dev disclosure UI as-is — it is correctly labeled and useful for
   genuine local debugging.
2. **Require an explicit, session-scoped opt-in** before the legacy path can activate at all.
   Saving the advanced panel now also sets a `sessionStorage` flag (`fran_crm_debug_override`),
   not `localStorage` — it clears automatically when the tab/app closes, so it can never
   silently carry over across a reinstall or a company switch the way `localStorage` did.
3. `isFranCrmLiveConfigured()` no longer trusts `VITE_FRAN_CRM_URL` (or any cached endpoint) by
   itself. The bare, no-argument call site in `sale.tsx` now also requires that session flag.
4. **When `skumsConnector` is absent in live mode and no explicit debug override is active**,
   Sale shows the existing "not linked in SKUMS yet" state (`sale.tsx:487-491`, already
   implemented) instead of silently guessing a workspace. No routing decision is safer than a
   guessed one.
5. **Demo mode is unaffected** — `mode === 'demo'` still uses the mock CRM client unconditionally;
   no real customer data is at risk there.
6. No schema change in fran-pos. `workspace_crm_links` correctly lives in SKUMS as the single
   source of truth for concern (1); duplicating a `crm_workspace_id` column into this repo's
   `companies` table would recreate the exact two-sources-of-truth problem this plan removes.

## What this does NOT change

- CRM policy loading, caching, and evaluation (concern 2) is untouched — it already correctly
  depends on whatever workspace SKUMS resolves, and has no direct relationship to SKUMS content.
- The generic Supabase `customers` table (`supabase/migrations/00002_create_customers.sql`,
  many-to-one on `company_id`) is a separate, already-correct system unrelated to Fran loyalty
  identity and is not part of this change.
