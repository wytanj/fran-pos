# Fran POS auth plan (fleet + HRM PIN)

Status: **draft for J T lock** (2026-09-15, rev PIN 8-digit + 12m validity + bot confirm-disable in P0) â€” not unlocked for Engineer build until approved.  
Repo: `wytanj/fran-pos` `docs/POS_AUTH_PLAN.md` (PR #5).  
Related: `docs/SCREEN_A_B_PLAN.md` (customer display pair â€” **separate**; do not conflate).

## Goal

~500 Galaxy Tabs across ~180 stores:

1. Device boots into Fran POS **with no Google login**.
2. App updates are **OTA** (Capacitor shell â†’ `https://fran-pos.vercel.app`) â€” rare APK only via Knox / managed Play.
3. Staff (FT or temp) unlock a register with **`employee_code` + PIN** only after hire is approved in **fran-hrm**.
4. Jarellâ€™s seat is **judgment**: approve / reject / hold â€” **not** device CRUD, not typing passcodes into POS admin UIs.

## Locked product shape (J T 2026-09-11 + 2026-09-15)

| Layer | Authority | Human does |
| --- | --- | --- |
| Fleet image | Knox / AE + Capacitor shell | Ops images device once |
| Register bind | Store pair / device token | One-time counter setup (SM or ops) |
| Staff secret | **fran-hrm only** (`employee_code` + bcrypt PIN, `pos_access_enabled`) | Jarell approves hire â†’ system issues access |
| HQ / admin | Google SSO on **fran-hrm / web** only | Never on Live POS register |

**Unify:** Today POS has Google â†’ pick `pos_staff_member` â†’ **register passcode**, while HRM has its own PIN **decoupled by design**. Target collapses to **one staff secret in HRM**. Kill Live POS â€œContinue with Googleâ€ and POS-local passcode as the staff auth path.

## Flows

### A. Device (once per tab)

1. Fleet loads `com.fran.pos` pointing at production Vercel URL.
2. First boot â†’ **Register bind** screen: store + short pair code (or QR from HRM/ops). No Google.
3. Server issues durable `device_token` â†’ store + register lane. Survives app updates.
4. Idle lock shows **employee_code + PIN** only.

Screen B / customer display keeps existing **kiosk store+6-char pair** (SCREEN_A_B). Still not cashier auth.

### B. Hire â†’ POS access (Jarell minimal)

1. Hire record lands in fran-hrm (existing intake).
2. Jarell sees one card: name, role, store, FT/temp â€” actions enum only: `approve` | `reject` | `hold`.
3. On **approve**:
   - set / keep `pos_access_enabled`
   - ensure `employee_code`
   - generate PIN (or force rotate if rehire)
   - deliver PIN **out of band** once (prefer existing Telegram staff channel / `/link` path; else one-time reveal on the approve toast â€” no multi-field form)
4. Terminate / disable in HRM clears `pos_access` and ends POS sessions (already intended).
5. **Theft / urgent disable (P0):** Jarell tells the ops bot who to cut â†’ bot asks confirm â†’ on confirm, same disable path as terminate (PIN dead, sessions killed). No waiting on a dashboard hunt.

Jarell does **not**: edit device lists, set per-register passcodes, click through POS dashboard staff CRUD, or manage Google accounts per tab.

### C. Shift unlock (cashier)

1. Bound register â†’ enter `employee_code` + PIN.
2. HRM (or POSâ†’HRM verify API) checks hash, lockout, `pos_access_enabled`, store eligibility.
3. `start_pos_staff_session` against bound `registerId`.
4. Idle timeout re-locks to PIN (default **3 min**).

Manager overrides (void/refund) = same PIN path with role gate, not a second secret system.

## Defaults (CoS â€” change only if J T overrides)

- PIN: **8 digits**, bcrypt in HRM only  
- Validity / rotate: **12 months** (floor was â€œat least 6 months or 1 yearâ€; pick 12m to cut friction â€” override to 6m if wanted). No naggy short rotations.  
- Lockout: **5 fails â†’ 15 min** (reuse HRM fields if present)  
- Issuance: **auto on hire approve** + one-time delivery (Telegram preferred)  
- Identity: **reuse HRM `employee_code`** (no second POS code)  
- `pos_access` defaults: roles cashier / SM / area_manager (temp included when approved)  
- Idle lock Screen A: **3 min**  
- Google on POS Live: **removed**  
- POS register passcode RPCs / dashboard staff passcode UI: **deprecated â†’ remove after cutover**
- **Disable (theft / exit):** Jarell informs a bot â†’ **confirm** â†’ system clears `pos_access` + invalidates PIN + ends live POS sessions. Enum confirm only â€” not a multi-field form.

## P0 / P1 / Reject

### P0 (pilot S10 + small staff set)

- Written verify API: POS â†’ HRM `employee_code`+**8-digit** PIN â†’ session on bound register  
- Register bind without Google (store pair / device token)  
- Hire-approve â†’ `pos_access` + PIN issue + one-time delivery  
- PIN expiry metadata (**12 months** default); verify rejects expired  
- **Bot disable with confirm** (theft/exit): Jarell â†’ bot â†’ confirm â†’ clear `pos_access` + kill PIN + end sessions  
- Remove / hide Continue with Google on Live POS  
- Audit: who unlocked which register when; who disabled whom when  

### P1

- Migrate / disable legacy POS passcodes  
- Knox Manage playbook for ~500 devices  
- Cross-store eligibility rules if staff float  

### Reject / defer

- Per-device Gmail  
- Sheets or WhatsApp as PIN SoT  
- Jarell editing passcodes in a POS admin CRUD grid  
- Conflating Screen B Tap overflow with this auth redesign  

## Human-verifiable artifacts

- This plan in git (`fran-pos/docs/POS_AUTH_PLAN.md`)  
- HRM rows: `employee_code`, `pin_hash`, `pos_access_enabled`, lockout  
- POS: `device_token` â†” store/register; staff session stamps HRM employee id + `rules`/auth version if any  

## Open only if J T cares (else ship defaults)

1. PIN delivery: Telegram-only vs also SMS  
2. Float staff across stores in P0 or P1  
3. Exact idle minutes (2 vs 3 vs 5)  
4. Validity **6 vs 12 months** (default **12**)  
5. Which bot channel for disable confirm (Fran Tech Ops Telegram vs dedicated HR bot) â€” P0 can be Telegram confirm callback wired to HRM disable API

## Unlock

J T says unlock â†’ Engineer implements P0 against this doc (Claude/open-pstack optional). No build until unlock.
