# Idea: special staff e-paper nametags

**Date:** 2026-09-08  
**Status:** future idea · not a build · not opening-day scope  
**Audience:** store staff / BA / floor leads (Fran Bugis+ and later stores)  
**Spark:** color e-paper badge form factor (ESP32-class, magnet/clip, NFC, long battery) — e.g. products like TICKEY. Treat the **category** as interesting; do not lock to one Kickstarter SKU.

---

## One-liner

Staff nametags that feel **special** — always-on, calm, paper-like — and can show more than a printed name: who you are, what you’re into today, and a light bridge into Fran membership.

---

## Why it fits Fran

- Beauty retail is personal. Guests remember **people**, not fixtures.
- We already invest in lightboxes, heroes, and endcap themes. A nametag is the **human** end of that same story.
- E-paper stays readable in bright mall light without glowing like another phone.
- Content can rotate (hero of the day, brand crush, language, pronouns) without reprinting plastic.

**Not this:** shelf price labels (that’s Hanshow ESL), or Screen B at checkout (that’s `docs/SCREEN_A_B_PLAN.md`).

---

## What “special” means for a staff nametag

| Layer | Default | Optional / rotating |
|-------|---------|---------------------|
| Identity | Name + role (BA / Lead) | Pronouns, languages spoken |
| Warmth | Soft Fran / store mark | Mini mood art (seasonal, non-noisy) |
| Merch hook | — | “Ask me about **{hero / brand}**” (Fern/Tiff pick, not random) |
| Membership | — | NFC → FWB join / “scan to see my picks” landing (CRM-owned URL) |

Rules:
- One clear face at a time — nametag, not a billboard.
- Staff can opt into rotating “ask me about”; never forced promo spam.
- Name + role always readable from conversational distance.

---

## Who owns content (forced lanes)

1. **People / store lead** — legal name, role, pronouns, languages (HR / roster truth).  
2. **Fern & Tiff (+ fran-skums check)** — today’s “ask me about” hero/brand pool.  
3. **Staff** — optional personal flavour within a Fran template (favourite category, not unofficial discounts).  
4. **Bots** — push approved art packs to devices; no freestyle Canva chaos as SoT.

Wrong-lane: Merch designing permanent HR badges; staff inventing prices on the tag.

---

## Pilot shape (when we ever do this)

- **5–10 units** for Bugis+ floor staff only.  
- Start **app-updated art + NFC link** before any custom ESP32 firmware.  
- Templates: (A) name-only special, (B) name + ask-me-about, (C) event-night variant.  
- Success = guests mention the tag / ask about the hero; staff still want to wear it after week two.

---

## Dependencies / park until

- Hanshow ESL path clear (so nobody confuses nametags with shelf labels).  
- Screen B P0 exists (so “displays” mental model is already split: shelf / face / human).  
- Simple CRM or web landing for NFC (even a static Heyfran page is enough for v0).  
- Hardware that **ships** (avoid opening-day dependence on crowdfunding).

---

## Explicit non-goals

- Replacing printed legal ID requirements if any still apply — e-paper is additive / primary floor face, confirm ops/legal later.  
- Tap-to-pay or POS controls on the badge.  
- Fleet CMS before a paper process for “today’s ask-me list” exists.

---

## Related

- Checkout face display: [`docs/SCREEN_A_B_PLAN.md`](./SCREEN_A_B_PLAN.md)  
- Stripe / S700 kit: [`docs/stripe-terminal-acceptance.md`](./stripe-terminal-acceptance.md)  
- Store grounding / lanes: fran-skums `docs/FRAN_GROUNDING_PLAN.md`

---

*Heyfran CoS idea note for a future staff program — special nametags, human layer next to the store’s digital faces.*