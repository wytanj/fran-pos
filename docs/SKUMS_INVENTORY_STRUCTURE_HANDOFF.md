# Fran POS ← SKUMS inventory & store-ops handoff

**Date:** 2026-07-15  
**Audience:** Fran POS engineers restructuring pages, clients, and local state  
**SKUMS repo:** `C:\Users\Jeremy Tan\CodeProjects\fran-skums`  
**Production SKUMS:** `https://fran-skums.vercel.app`  
**Supabase (SKUMS SoT):** project `adwrytbihbdeblnkrhjs` (`https://adwrytbihbdeblnkrhjs.supabase.co`)

Related SKUMS docs (source of truth for HQ ops, not for POS UI):

| Doc | Purpose |
|-----|---------|
| `fran-skums/docs/SKUMS_OPERATOR_RUNBOOK.md` | How HQ operates Store Ops |
| `fran-skums/docs/INVENTORY_AND_PURCHASE_LOGGING.md` | Ledger + POS/SKUMS/CRM ownership |
| `fran-skums/docs/POS_SKUMS_3PL_STORE_OPS_HANDOFF.md` | Older engineering contract (this file supersedes inventory parts) |
| `fran-skums/docs/LOFT_OPS_DICTIONARY.md` | Loft/OFS enums (HQ only) |
| `fran-pos/docs/fran-pos-crm-skums-contract.md` | CRM/loyalty (unchanged ownership) |

---

## 1. Architecture (do not reopen without cause)

```text
┌─────────────────────┐     HTTPS API key      ┌──────────────────────┐
│  Fran POS (register)│ ───────────────────►   │  Fran SKUMS          │
│  UI + local outbox  │     pos / store_ops    │  inventory ledger    │
│  display ATS cache  │ ◄───────────────────   │  store-ops HQ        │
└─────────────────────┘     catalog / sales    │  WorldSyntech / Loft │
         │                                     └──────────┬───────────┘
         │ Fran CRM (points only)                         │ OFS API
         ▼                                                ▼
┌─────────────────────┐                          ┌────────────────┐
│  Fran CRM           │                          │  Loft warehouse│
│  members / points   │                          └────────────────┘
└─────────────────────┘
```

| System | Owns |
|--------|------|
| **Fran POS** | Cashier UX, payment, receipt, local outbox, PIN roles, **display** of store stock |
| **Fran SKUMS** | Product master, **canonical `inventory_ledger` / levels**, replenishment decide/send, receive apply, floor adjustment apply, ASN inbound, Loft credentials |
| **Fran CRM** | Member identity, points ledger, loyalty policy |
| **Loft / OFS** | Physical warehouse execution only — **never called from POS** |

### Absolute rules for POS structure

1. **No OFS / Loft credentials or clients in POS.**
2. **No second inventory ledger.** Local `inventory_count` / demo adjustments are **display cache only**.
3. **Sellable stock changes only after SKUMS accepts** (sale commit, receive apply, HQ-approved floor adjustment).
4. **Replenishment request = HQ signal**, never “order placed” or “Loft notified”.
5. **Free-form “Receive stock” is not the Loft receive path** (use Receive delivery).
6. **Machine API key** = least privilege (`pos:read`, `pos:write`, `store_ops:read`, `store_ops:write` only — never approve / verify / execute_3pl).

---

## 2. Recommended POS app structure (target)

Align routes and modules to SKUMS ownership so engineers know where inventory truth lives.

```text
dashboard/src/pos/
  pages/
    sale.tsx                 # checkout → SKUMS sale write-back
    returns.tsx              # returns → SKUMS return path
    stock.tsx                # DISPLAY ATS + floor REPORTS only
    receive-delivery.tsx     # Loft expected deliveries + receive submit (Phase C)
    request-stock.tsx        # HQ signal + next-wave banner (Phase B/F)
    transfers.tsx            # legacy transfer receive events (map carefully)
    transactions.tsx         # local sale history / receipts
    reports.tsx              # register close; not SKUMS ledger
  lib/
    skums-client.ts          # ALL SKUMS HTTP (single place)
    skums-sale-sync.ts       # sale queue + retry
    stock-movement.ts        # inventory-events payload builders
    pos-store-config.ts      # bound store code + inventory_location_id
    pos-outbox.ts            # durable local events (sales/CRM)
  fran/                      # CRM only — do not put inventory here
```

### Nav model (current shell)

| Nav item | Path | SKUMS dependency |
|----------|------|------------------|
| Sale | `/pos/sale` | catalog, quote, sales POST |
| Returns | `/pos/returns` | returns POST |
| Transfers | `/pos/transfers` | `inventory.transfer_receive.reported` (legacy) |
| Stock | `/pos/stock` | catalog ATS display; floor inventory-events |
| Request stock | `/pos/request-stock` | store-ops requests + next-wave |
| Receive | `/pos/receive` | expected-deliveries + receive |
| Transactions / Reports | local | optional sale list only |

**Refactor guidance:** Prefer one **Inventory** section with sub-routes:

- **On hand** (read-only SKUMS ATS)  
- **Receive delivery** (Loft)  
- **Floor report** (damage / found / cycle count)  
- **Request stock** (HQ signal)  

Do not merge “receive stock free-form” into the same flow as Loft receive.

---

## 3. Store binding (required for every write)

Every SKUMS write must identify the **store**.

| Field | Source |
|-------|--------|
| `pos_location_code` | Bound terminal store code (e.g. `FRAN01`) from `getActiveStore()` |
| `inventory_location_id` | SKUMS inventory location UUID for that store (from bind / store config) |
| `register_id` / session | Optional audit |

SKUMS seeds default **ST-MAIN** + POS **FRAN01** when missing (migration 062). Live multi-store: bind via POS settings → SKUMS `pos_locations.inventory_location_id`.

**Catalog** must request store-scoped stock:

```http
GET /api/v1/pos/catalog?pos_location_code=FRAN01
```

or Fran alias:

```http
GET /fran/pos/catalog?pos_location_code=FRAN01
```

Response stock fields are **ATS at that store** — treat as cache; refresh after receive / sale sync.

---

## 4. Auth & scopes

### Connector config

- Base URL: `VITE_SKUMS_URL` / settings → e.g. `https://fran-skums.vercel.app`
- Header: `Authorization: Bearer sk_live_…` or `X-API-Key`
- Never put service role in POS

### Required key package (pos_connector)

```text
pos:read
pos:write
store_ops:read
store_ops:write
products:read
```

### Forbidden on POS keys

```text
store_ops:approve
store_ops:verify
store_ops:execute_3pl
store_ops:inbound
credentials:*
integrations:execute   (mutating OFS)
```

### Local PIN roles (UI gates)

| POS role | Sale | Floor report | Receive delivery | Request stock | Approve / Loft / verify |
|----------|------|--------------|------------------|---------------|-------------------------|
| cashier | ✓ | ✓ | ✓ | ✗ | ✗ |
| manager+ | ✓ | ✓ | ✓ | ✓ | ✗ |
| admin / owner | ✓ | ✓ | ✓ | ✓ | ✗ (still no SKUMS HQ powers) |

Server still rejects over-scoped actions even if UI is wrong.

---

## 5. Inventory movement map (what POS may do)

| Floor action | POS does | SKUMS does | Ledger when? |
|--------------|----------|------------|--------------|
| **Sale / return** | `POST …/sales` (or fran sales) | Commit stock at store location | Immediately on successful ingest |
| **Receive Loft delivery** | List expected + `POST` receive | Apply **good** qty; open exceptions | On receive submit (good units) |
| **Report short/damaged/wrong** | On receive lines | Exception queue for HQ | HQ verify may adjust |
| **Damage** | `inventory.damage.reported` | Pending `inventory_adjustments` | **HQ Apply** on Floor adjustments |
| **Found stock** | `inventory.found_stock.reported` | Pending adjustment | **HQ Apply** |
| **Cycle count** | `inventory.cycle_count.reported` | Pending stocktake (`quantity` = **physical counted on-hand**) | **HQ Apply** |
| **Request stock** | `POST /fran/store-ops/requests` | HQ queue / waves | Never on request |
| **Free-form receive stock** | **Disabled in live mode** | — | Do not implement as ledger |

SKUMS HQ UI for apply: **Store Ops → Floor adjustments** (`inventory:write`).

---

## 6. SKUMS API surface for POS (inventory-related)

All paths relative to SKUMS base URL. Prefer **Fran aliases** under `/fran/…` where present (same auth).

### 6.1 Catalog & identity

| Method | Path | Scope | Notes |
|--------|------|-------|--------|
| GET | `/api/v1/pos/catalog` | `pos:read` | Store-scoped ATS; drafts / non-POS excluded |
| GET | `/fran/pos/catalog` | same | Fran alias |
| POST | `/api/v1/pos/scan` | `pos:read` | Barcode resolve |
| POST | `/fran/pos/scan/resolve` | same | Fran alias |

### 6.2 Sales (stock decrement)

| Method | Path | Scope | Notes |
|--------|------|-------|--------|
| POST | `/api/v1/pos/sales` | `pos:write` | Idempotent `idempotency_key`; commits ledger |
| POST | `/fran/pos/sales` | same | Fran alias |
| POST | `/fran/pos/returns` | `pos:write` | Returns / exchange |

**Always** include store/register + idempotency. Queue offline failures in POS Supabase/outbox — do not invent local on_hand as SoT.

### 6.3 Floor inventory events

| Method | Path | Scope |
|--------|------|--------|
| POST | `/api/v1/pos/inventory-events` | `pos:write` |
| POST | `/fran/pos/inventory-events` | same |

**Event types (required):**

```ts
type SkumsPosInventoryEventType =
  | 'inventory.damage.reported'       // quantity = units damaged (delta down)
  | 'inventory.found_stock.reported'  // quantity = units found (delta up)
  | 'inventory.cycle_count.reported'  // quantity = ABSOLUTE physical count
  | 'inventory.transfer_receive.reported' // legacy transfer object only
```

**Minimal payload shape:**

```json
{
  "event_type": "inventory.damage.reported",
  "idempotency_key": "pos-dmg:FRAN01:20260715:SKU:1",
  "sku": "LIS-SKU-001",
  "quantity": 2,
  "pos_location_code": "FRAN01",
  "inventory_location_id": "<uuid optional if code resolves>",
  "reason_code": "damaged_on_floor",
  "note": "Shelf leak",
  "reference": "POS-FRAN01",
  "occurred_at": "2026-07-15T10:00:00.000Z",
  "product": {
    "sku": "LIS-SKU-001",
    "product_id": "<optional skums uuid>",
    "product_identity_id": null,
    "trade_unit_id": null
  }
}
```

**Response status meanings:**

| `data.status` | POS UX |
|---------------|--------|
| `pending_approval` | Show “Reported to HQ — stock not changed until approved” |
| `applied` | Rare for damage/found (transfer receive may apply) |
| `failed` | Show error; allow retry with same idempotency key carefully |

**POS code map (current):**

- Builders: `dashboard/src/pos/lib/stock-movement.ts`  
- Client: `createSkumsPosInventoryEvent` in `skums-client.ts`  
- UI: `pages/stock.tsx` (floor actions including cycle count)  
- Types: `packages/shared/src/types/skums.ts` → `SkumsPosInventoryEventType`

### 6.4 Receive Loft / HQ deliveries (Phase C)

| Method | Path | Scope | Notes |
|--------|------|-------|--------|
| GET | `/api/store-ops/expected-deliveries?pos_location_code=` | `store_ops:read` or `pos:read` | Or Fran route if exposed |
| POST | `/api/store-ops/receive` | `store_ops:write` or `pos:write` | |
| POST | `/fran/store-ops/receive` | same | Prefer this from POS |

**Receive body (conceptual):**

```json
{
  "order_id": "<store_replenishment_orders.id>",
  "idempotency_key": "recv:FRAN01:ORDER:1",
  "pos_location_code": "FRAN01",
  "received_by_ref": "cashier-pin-name",
  "collector_name": "optional self_collect",
  "lines": [
    {
      "sku": "LIS-SKU-001",
      "expected_qty": 12,
      "received_qty": 10,
      "damaged_qty": 1,
      "exception_type": "short",
      "note": "carton short"
    }
  ]
}
```

**`exception_type` enums:** `short` | `damaged` | `over` | `wrong_sku` | `unexpected_item` | `unmapped_sku` (align with SKUMS 044).

**Copy:** exceptions → “Reported to HQ for verification”, not “resolved”.

**UI:** `pages/receive-delivery.tsx` (route `/pos/receive`).

### 6.5 Replenishment request + next wave (Phase B / F)

| Method | Path | Scope | Notes |
|--------|------|-------|--------|
| POST | `/fran/store-ops/requests` | `store_ops:write` or `pos:write` | Signal only |
| GET | `/fran/store-ops/next-wave?pos_location_code=` | `store_ops:read` or `pos:read` | Cadence banner |

**Request body:**

```json
{
  "idempotency_key": "replenishment-request:FRAN01:…",
  "priority": "normal",
  "reason": "Shelf gap",
  "needed_by": "2026-07-18",
  "pos_location_code": "FRAN01",
  "inventory_location_id": "<uuid>",
  "lines": [
    { "sku": "LIS-SKU-001", "requested_qty": 6, "reason": optional }
  ]
}
```

**Success copy (required):**

> Request sent to HQ. Reviewed against Mon & Thu replenishment — not an order to Loft.

**Next-wave response (use as banner):**

```json
{
  "cadence": "Monday + Thursday",
  "message": "Next scheduled replenishment: Thursday 2026-07-17. Ad-hoc requests are for lift/urgent only…",
  "next_wave": {
    "wave_date": "2026-07-17",
    "weekday_label": "Thursday",
    "open_for_defer": true,
    "cutoff_at": "…"
  }
}
```

**UI:** `pages/request-stock.tsx` + `fetchSkumsNextWave` / `createSkumsStoreReplenishmentRequest` in `skums-client.ts`.  
**Gate:** `canRequestReplenishment(role)` — manager+.

---

## 7. Local POS database vs SKUMS

| Data | POS Supabase / local | SKUMS |
|------|----------------------|--------|
| Products cache | Optional import | Master |
| `inventory_count` on products | Display only | **levels + ledger** |
| `pos_inventory_events` (POS side) | Queue/audit until synced | Canonical intake + adjustment link |
| `pos_outbox_events` | Sale/CRM events | Sale ingest + CRM separately |
| Sale receipt | Local completed sale | `pos_sales` after write-back |

### Offline behaviour

| Action | Offline OK? | Notes |
|--------|-------------|--------|
| Sale complete | Yes | Queue SKUMS sale; receipt local |
| Floor damage/found/count | Queue | Do not change sellable as “applied” until SKUMS returns |
| Receive Loft | Prefer online | Expected list needs SKUMS |
| Request stock | Prefer online | Or queue with clear “pending HQ” |
| Redeem points | Online-first | CRM |

When reconnecting: drain outbox → inventory-events → sales. Prefer **idempotency_key** on every mutation.

---

## 8. UX / copy contract (inventory)

| Situation | Show |
|-----------|------|
| After floor report | “Reported to SKUMS for HQ approval — stock not changed until approved” |
| After receive with exceptions | “Reported to HQ for verification” |
| After clean receive | “Received — sellable stock updated in SKUMS” (if API applied) |
| After request stock | “Sent to HQ for review” + next wave banner |
| Live free-form receive button | Disabled / “Use Receive delivery” |
| Demo mode free-form receive | Display-only adjust OK |
| Stock list qty | Label as store ATS / cache, not “authoritative ledger” |

---

## 9. What is already implemented in fran-pos (baseline)

Use this as the starting structure; do not re-invent parallel clients.

| Area | Status | Files |
|------|--------|--------|
| SKUMS connector | ✓ | `lib/skums-client.ts`, settings integrations |
| Store bind | ✓ | `lib/pos-store-config.ts` |
| Sale write-back | ✓ | `skums-sale-sync.ts`, `skums-sale-adapter.ts` |
| Floor damage/found | ✓ | `stock.tsx`, `stock-movement.ts` |
| Cycle count event | ✓ | same + shared types |
| Free-form receive gated live | ✓ | `stock.tsx` |
| Request stock + next wave | ✓ | `request-stock.tsx`, next-wave GET |
| Receive delivery | ✓ | `receive-delivery.tsx` |
| CRM loyalty | ✓ | `fran/*` (separate from inventory) |

### Known gaps / polish for structure update

1. **Unify stock UX** — split display vs floor report vs receive (today Stock page is crowded).  
2. **Refresh ATS** after receive / sale sync / HQ apply (poll catalog or push).  
3. **Transfers page** — clarify legacy transfer vs Loft receive; avoid double paths.  
4. **Durable queue** for inventory-events (prefer POS Supabase `pos_inventory_events`, not only memory/localStorage).  
5. **Multi-store terminal** — settings UI to pick `pos_location_code` + verify inventory bind.  
6. **Error surfaces** — show SKUMS `statusMessage` / `data.status` clearly.  
7. **Tests** — payload enums for exception_type + event_type match SKUMS.

---

## 10. Implementation checklist for a POS restructure PR

- [ ] Single `skums-client` module for all inventory HTTP  
- [ ] All writes include `pos_location_code` + idempotency  
- [ ] Roles: cashier cannot open request-stock submit  
- [ ] Live: no free-form ledger receive  
- [ ] Floor events use correct quantity semantics (cycle count absolute)  
- [ ] Receive uses expected-deliveries + exception enums  
- [ ] Request stock shows next-wave message from SKUMS  
- [ ] Copy never says “Loft order created” from POS  
- [ ] Local stock display refreshes from catalog after mutations  
- [ ] No Loft/WorldSyntech imports in POS  
- [ ] CRM remains separate (`fran/`) — points not in inventory modules  

---

## 11. Quick smoke (against production SKUMS)

```bash
# POS env
VITE_SKUMS_URL=https://fran-skums.vercel.app
# + API key with pos_connector scopes
```

1. Bind store FRAN01 / ST-MAIN.  
2. Catalog loads store ATS.  
3. Sale completes → SKUMS stock down.  
4. Stock → Damage report → SKUMS status `pending_approval` → HQ Floor apply → ATS down.  
5. Request stock → HQ queue; banner shows Mon/Thu next wave.  
6. Receive delivery (if order shipped) → good qty up; exception → HQ Exceptions.  

HQ verification: SKUMS `/store-ops` (Queue, Floor adjustments, Exceptions, Waves & calendar).

---

## 12. Changelog

| Date | Note |
|------|------|
| 2026-07-15 | Initial POS structure handoff after SKUMS Phases P–F (ledger apply, receive, waves, next-wave, cycle count, free-form receive gate). |
