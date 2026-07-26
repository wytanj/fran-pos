# Test CRM loyalty effects on POS

**As of:** 2026-07-24  
**Goal:** POS Sale loads loyalty via **SKUMS workspace key** (POS → SKUMS → CRM), not dual secrets.

**Architecture:** `fran-skums/docs/POS_CRM_SKUMS_CONNECTION_ARCHITECTURE.md`

---

## Target path (preferred)

```text
POS  --(SKUMS API key)-->  SKUMS /fran/pos/loyalty/*  -->  Fran CRM
POS  --(same key)------->  SKUMS catalog / quote / sale
```

| Step | Call |
|------|------|
| Readiness | `GET /fran/pos/capabilities` |
| Policy | `GET /fran/pos/loyalty/policy/active` |
| Member | `POST /fran/pos/loyalty/member/resolve` |
| Session | `POST /fran/pos/loyalty/counter-session` |
| Pay | `POST /fran/pos/loyalty/commit-sale` |

Without SKUMS key (and without legacy CRM URL), POS uses **mock** members (Mei Lin `FRAN1001`).

---

## 1. Run Fran CRM

```bash
cd fran-crm
npm run dev
# http://localhost:3000
```

---

## 2. Run SKUMS + link CRM

```bash
cd fran-skums
# migrate 073 workspace_crm_links
npm run db:migrate -- --only 073

# .env (dev single-tenant fallback — no DB row needed)
# FRAN_CRM_BASE_URL=http://localhost:3000
# FRAN_CRM_WORKSPACE_ID=11111111-1111-4111-8111-111111111111

npm run dev
```

Or upsert link with an admin/service key:

```bash
curl -X PUT "$SKUMS/api/v1/workspace/crm-link" \
  -H "Authorization: Bearer sk_live_…" \
  -H "content-type: application/json" \
  -d '{"crm_base_url":"http://localhost:3000","crm_workspace_id":"11111111-1111-4111-8111-111111111111","auth_mode":"none"}'
```

Smoke:

```bash
curl -s "$SKUMS/fran/pos/capabilities" -H "Authorization: Bearer sk_live_…" 
# loyalty.ok true when linked
```

---

## 3. Point POS at SKUMS only

1. `cd fran-pos && npm run dev`
2. **Settings → Integrations → SKUMS connector**: API URL + account key (`pos:read` + `pos:write`)
3. Leave legacy CRM offline or empty — Sale prefers SKUMS when connector enabled
4. Hard-refresh **Sale**

---

## 4. Cashier test flow

1. Open **Sale**.
2. Member lookup: **`FRAN-0001`** / `FRAN1001` / phone `81234470`
3. Expect **Ava Tan**, **F3**, ~**18420** pts (CRM demo via facade)
4. Add products → earn uses policy from CRM through SKUMS
5. Pay → Network: POS → **SKUMS** `/fran/pos/loyalty/commit-sale` (not direct CRM)
6. Optional: `GET …/fran/pos/capabilities` → `ready_for_member_loyalty: true`

**Legacy direct CRM:** Integrations legacy URL + offline off, **no** SKUMS key — still works for local CRM-only debugging.

**Mock:** no SKUMS + offline mock → Mei Lin.

---

## 4. What is still demo vs durable

| Layer | With CRM URL + offline off | Durable Supabase |
|-------|----------------------------|------------------|
| Policy | CRM demo FWB bundle (no Bearer) | Active policy row + assignment + user JWT |
| Member resolve | CRM `demoCrmGraph` | Real people (not wired yet in resolve) |
| commit_sale | In-memory demo engine if no workspace DB | `persistCommitSale` when service role + workspace |

To force **Supabase ledger**: CRM env `SUPABASE_*` + real workspace membership + Bearer (future POS proxy). Today unauthenticated POS intentionally gets **demo** policy so you can still test the wire.

---

## 5. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Still mock members | Offline still ON, or URL not saved, or Sale not reloaded |
| CORS error | Confirm CRM `routeRules` cors on `/fran/**`; use exact origin URL |
| Policy 401 | Should not for `format=pos` + `x-pos-client` without Bearer after bridge fix |
| Member none | Use `FRAN-0001` / Ava phone; CRM graph person only |
| commit no effect in CRM UI | Demo in-memory only — check CRM network response `mode` |

---

## 6. Related code

- POS client: `dashboard/src/pos/fran/lib/fran-crm-client.ts`
- CRM handlers: `server/fran/pos/handlers.ts`
- Policy: `server/api/fran/loyalty/policy-versions/active.get.ts`
- Commit: `server/fran/loyalty/commit-sale.ts`
