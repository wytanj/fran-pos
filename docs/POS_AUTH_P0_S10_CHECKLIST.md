# S10 device test checklist — POS auth P0

Pilot tablet: Galaxy Tab S10 FE+ (Screen A). Do **not** conflate with Screen B Active5 customer display.

## Prerequisites
- [ ] Deploy fran-hrm with migration `031_pos_auth_p0.sql`
- [ ] Deploy fran-pos with migration `00016_pos_register_devices.sql`
- [ ] Vercel env on POS: `FRAN_HRM_URL`, `FRAN_HRM_API_KEY` (key scopes include `pos:verify` or `pos:sync`)
- [ ] Ops minted a pair row: `create_pos_register_pair(company_id, store_code, register_id)` → note **pair_code**

## 1. Register bind (no Google)
1. Open Live POS on a fresh tablet (or Unbind first).
2. Live mode → **Bind this register**.
3. Enter store code + pair code → Bind.
4. Confirm header shows `STORE / REG-…`.
5. Confirm **no** “Continue with Google” on Live.

## 2. Unlock with 8-digit PIN
1. Hire-approve a pilot staff in HRM (or call `POST /api/v1/pos/hire-approve` with `decision: approve`) → save one-time PIN.
2. On bound register: enter **employee_code** + **8-digit PIN** → Unlock.
3. Land on `/pos/sale` with staff name.
4. Confirm `pos_auth_events` has `unlock_ok`.

## 3. Expired PIN reject
1. In DB set `pin_expires_at` to yesterday for that staff.
2. Unlock again → expect reject (“PIN expired”).
3. Confirm `unlock_fail` / reason `pin_expired`.

## 4. Hire-approve delivery
1. As SM/area/HQ session: `POST /api/v1/pos/hire-approve` `{ staff_id|employee_code, decision: "approve" }`.
2. Response includes one-time `pin` + `pin_expires_at` (~12 months).
3. PIN works once on register; re-approve rotates PIN.

## 5. Bot disable confirm
1. As SM (same store) or area/HQ: `POST /api/v1/pos/disable` `{ employee_code, confirm: true }`.
2. Without `confirm: true` → 400.
3. After disable: unlock fails; `pos_access_enabled=false`; `pin_hash` null; sessions ended; audit `disable`.

## 6. Google hidden on Live
1. Live mode (bound or unbound): no Continue with Google.
2. Demo mode may still offer optional Connect Account / HQ dashboard link.
3. `/login` dashboard Google unchanged (HQ only).

## Pass criteria
All six sections checked on one S10 + one small staff set.
