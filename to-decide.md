# To decide

## Cross-workspace readiness â€” is a "waterfall lock" the right UX?

None of SKUMS, Fran CRM, or Stripe should be able to operate in silos: a feature should never
appear ready in the POS UI until every system it depends on has actually confirmed it is.
Concretely â€” Charge shouldn't be tappable as a loyalty-earning sale until SKUMS confirms the
catalog *and* CRM confirms the workspace/policy; nothing downstream should assume an upstream
state it hasn't been told about.

Two shapes on the table:

1. **Literal waterfall** â€” check SKUMS, then wait, then check CRM, then unlock. Simple to
   reason about, but makes the register slow to become usable and directly undoes the payment
   warm-up work (see `dashboard/src/pos/lib/stripe-tap-to-pay.ts` `warmUpTapToPay`).
2. **Composed status, independent checks** (leaning this way) â€” each system reports its own
   readiness in the background, same pattern as the Stripe warm-up and the existing
   `posCapabilities.ready_for_member_loyalty` gate in `sale.tsx`. POS composes those into one
   gate per feature. Cash sales stay instant; loyalty greys out until SKUMS + CRM both say
   ready; nothing silently pretends readiness it doesn't have.

Open questions for tomorrow:

- What's the actual set of "systems" and "features" in the composed-status model? (SKUMS
  catalog, SKUMSâ†’CRM workspace link, CRM policy freshness, Stripe Terminal reader, Stripe QR
  reachability â€” is that the full list?)
- Where does the composed status live â€” a single hook (`use-pos-readiness`?) that every payment
  mode and the loyalty UI reads from, or per-feature hooks that each compose their own inputs?
  Related: [docs/pos-crm-workspace-routing-plan.md](docs/pos-crm-workspace-routing-plan.md)
- What does the cashier actually see when something is degraded â€” a banner, per-tile greying
  (like the existing disabled payment mode tiles), or both? Does it differ for "not configured"
  vs. "configured but currently unreachable"?
- Does this replace or wrap the existing ad hoc checks (`posCapabilitiesError`, Stripe
  `stripeS700Ready`, tap-to-pay readiness chip idea from the payment-speed conversation), or
  do those stay as the per-system inputs feeding the composed gate?

## Screen A/B (parked plan)

See [docs/SCREEN_A_B_PLAN.md](docs/SCREEN_A_B_PLAN.md). Kit locked: S10 FE+ = A, Active5 = B face, S700×3 checkout; mobile can call S700 or Tap. Build only after J T unlock.
