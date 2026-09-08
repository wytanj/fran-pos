# Fran POS — Screen A / Screen B plan

**Date:** 2026-09-08  
**Status:** plan locked for implementation sequencing · **no build until J T unlocks**  
**Repo:** `fran-pos`  
**Related:** `docs/stripe-terminal-acceptance.md`, `MOBILE-TODO.md`, `to-decide.md`

---

## Hardware kit (locked)

| Role | Device | Job |
|------|--------|-----|
| **Screen A** | Samsung Galaxy Tab **S10 FE+** | Cashier POS (`/pos/login` → `/pos/sale`) |
| **Screen B** | Samsung Galaxy Tab **Active5** | Customer-facing display (not a second POS) |
| **Checkout** | Stripe Reader **S700** × **3** (first store) | Card + PayNow/WeChat on reader screen |
| **Mobile POS** | Phones / other tablets | Full POS; can activate an S700 **or** Tap to Pay |

### Locked decisions
1. **S700 remains checkout** — Active5 does **not** replace the reader.
2. Staff on mobile POS can activate **S700** or **their Tap to Pay**.
3. First store = **3 hard terminals** (3× S700) from day one.
4. Screen A is obviously the POS; Screen B is a flexible face we can update often.

### Still open (do not block P0)
- Active5 face-only vs Tap overflow later
- B auth details (store short code vs store token vs staff session)
- Sync transport (Realtime vs poll vs LAN) — pick during build
- Whether ties-to-hit ships in the same unlock as cart mirror or immediately after

---

## North star

- **A** runs the sale (only place that mutates cart / tenders).
- **S700** takes money (primary card + QR methods on the reader).
- **B** shows what the **guest** should see — “airport gate board” fidelity: big type, high contrast, few states, no cashier chrome.
- B is a **thin display client**; content rules can change server-side / from A without treating B as a second register.

---

## What exists today (gap)

- Documented kit = Galaxy Tab register + **one** S700; Tap on tablet backup (`CHANGES.md` 2026-08-14, `stripe-terminal-acceptance.md`).
- No literal Screen A/B routes. Integrations stub: “Customer display — Coming soon”.
- No BroadcastChannel / pair / `/pos/customer-display`.
- Company settings store a **single** `s700_reader_id` — all clients would hit one reader until multi-reader assignment exists.
- S700 path is **server-driven** Stripe API (`process_payment_intent`), not Bluetooth 1:1 phone↔reader.

### Mobile POS ↔ 3× S700 (theory)
- **No hard Stripe cap** on how many mobiles may *call* readers (authenticated API clients).
- **Concurrent card-present collects** = **one active collect per S700** → **3 parallel** with the first-store kit.
- Tap to Pay does **not** consume an S700 slot.
- Product need: multi-reader **picker / assignment** (free reader, lane label, or sticky counter) so N mobiles don’t all slam one `s700_reader_id`.

---

## Screen B — what goes on it

### States
`idle` → `cart` → `paying` → `done` → (back to idle)

### Priority map

#### P0 — must ship for dual-tab to mean anything
1. Pair B as **kiosk** (store code / token) — **not** cashier login  
2. Idle **brand** screen  
3. Live **cart mirror**: lines · qty · running total (read-only from A)  
4. **Amount due** when Pay starts on A  
5. **Thank-you / done** flash  

#### P1 — loyalty money on the face (still passive)
6. Member name / tier once tagged on A  
7. **Ties-to-hit** strip under total (“$X more → Y”) from loyalty quote — **one** line max  

#### P2 — when 3 terminals get real
8. Multi-S700 picker / assignment on **A** (free / lane / sticky)  
9. QR handoff to **B only if** S700 QR fails (fallback, not primary)  

#### P3 — flexible B content (iterate often; B stays dumb)
10. Staff-pushed **upsell** card from A (guest does **not** tap; A adds to cart)  
11. Campaign / hero creative on idle  
12. Post-pay receipt summary / points earned flash  

#### Explicitly later / maybe never
- Guest input on B (phone entry, tips, choose upsell)  
- Tap on B as overflow  
- Auto upsell carousels / catalog browse on B  
- B as a second full POS  

### Fidelity rules
- Max **one** promo strip at a time under the total  
- Never steals focus during S700 pay  
- Never requires guest input on B  
- A is the only place that changes the cart  
- Pretty enough for Bugis+; dumb enough to trust  

### Upsells / rewards (phased)
| Phase | Behaviour |
|-------|-----------|
| P0 | None |
| P1 | Passive ties-to-hit when member tagged |
| P3 | Staff-triggered upsell card from A |
| Later / never | Auto attach-rate carousels |

---

## Suggested build slices (when unlocked)

1. **Docs already done** — this file  
2. **P0 display shell** — `/pos/customer-display` (or equivalent) + pair + idle + cart mirror + amount due + thank-you  
3. **P0 sync** — A publishes cart/pay state; B subscribes (Realtime preferred; poll acceptable for MVP)  
4. **P1 loyalty strips** — member + ties-to-hit from existing loyalty quote path  
5. **P2 multi-reader** — register 3× S700 at one Location; replace single `s700_reader_id` with reader list + assignment UI on A / mobile  
6. **P2 QR fallback** — only when S700 QR unavailable  
7. **P3 content** — staff upsell push + idle campaigns  

Do **not** rewrite Tap-to-Pay or dual full registers as part of B.

---

## Out of scope for this plan
- Replacing S700 with Active5  
- Planogram / Merch / Studio J (see fran-skums `docs/FRAN_GROUNDING_PLAN.md`)  
- Production APK store rollout checklist beyond what’s in `MOBILE-TODO.md` (track separately)

---

## J T unlock checklist
- [x] Unlock **P0** build (pair + cart mirror + pay/due + thank-you)  
- [x] Include **P1** ties-to-hit in same unlock? (yes � passive strip in P0 ship)  
- [ ] Unlock **P2** multi-S700 picker when hardware lands  
- [ ] Confirm Active5 remains **face-only** for P0–P1  

---

*Drafted with Heyfran CoS from Engineer Screen A/B read + J T kit locks. Engineer may optionally use Claude CLI when implementing — plan first, build only after unlock.*