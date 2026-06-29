# CRM Profile Extension Plan: Skincare Pack As First Test Case

## Purpose

This document is the handoff plan for moving from the POS customer/CRM foundation into the Open Spine CRM repo UI work.

The goal is to let a skincare merchant extend the customer model with domain fields such as skin type, skin concerns, and reported sensitivities, then test those fields in the CRM UI before wiring them back into POS counter workflows.

Skincare is the first vertical pack, not the permanent platform model. The implementation should let future merchants install other domain packs without forking the customer schema or building a separate CRM UI per industry.

Current CRM repo target:

```text
C:/Users/Jeremy Tan/CodeProjects/crm
```

Relevant existing CRM surfaces:

```text
supabase/migrations/0001_headless_crm.sql
supabase/migrations/0002_customer_memory_foundation.sql
app/pages/schema.vue
app/components/SchemaDesigner.vue
app/pages/graph.vue
app/components/GraphWorkspace.vue
app/types/crm.ts
server/api/schema/fields.post.ts
server/api/v1/people/[person_id]/index.get.ts
server/api/v1/people/[person_id]/computed-profile/index.get.ts
server/utils/demo-crm.ts
docs/agents/API_CONTRACT.md
docs/agents/DATA_MODEL.md
content/docs/api.md
content/docs/model.md
```

## Product Position

Do not hardcode skincare fields as permanent POS columns, CRM core columns, route names, or UI assumptions.

The right model is:

```text
generic CRM profile field system
-> domain profile pack
-> CRM profile/fact/projection APIs
-> POS counter-safe profile projection
```

POS should only need a compact counter profile:

```text
Skin: Combination
Concerns: Acne, Pigmentation
Avoid: Retinol, Fragrance
```

CRM owns:

- Field definitions.
- Field packs.
- Profile values.
- Provenance.
- Sensitivity level.
- Segmentation and campaign usability.
- Rich customer memory.

POS owns:

- Fast customer lookup.
- Customer attachment to sale.
- Purchase history.
- Counter-safe display.
- Advisory warning surfaces.

## Platform Guardrails

The CRM should treat skincare as one pack among many.

Allowed extension pattern:

```text
core customer graph
-> profile pack registry
-> pack-scoped field definitions
-> pack-scoped current profile values
-> facts/provenance timeline
-> context-specific projections for POS, marketing, support, agents, and exports
```

Avoid these lock-ins:

- Do not add `skin_*` columns to shared customer tables.
- Do not name generic APIs only around skincare.
- Do not make `reported_sensitivities` the only kind of risk field.
- Do not assume every pack is about product compatibility.
- Do not assume every profile field is safe for POS, campaigns, or agents.
- Do not assume enum fields are enough; some packs need measurements, dates, numbers, nested JSON, or computed facts.
- Do not tie profile packs to one UI page; schema, graph, customer detail, POS, and API console should all consume the same pack contracts.

The pack contract must support examples beyond skincare:

```text
fashion_fit
  body_measurements, preferred_fit, size_by_brand, alteration_notes

pet_care
  pet_species, pet_breed, pet_age, diet_restrictions, medical_notes

sports_retail
  sport_type, skill_level, dominant_hand, injury_considerations, preferred_brands

wellness_supplements
  goals, dietary_constraints, stimulant_sensitivity, medication_warning_note

b2b_account
  buying_role, account_tier, procurement_rules, invoice_preferences
```

These examples should use the same tables, APIs, validation, and UI components as the skincare pack.

## Skincare Field Pack

Seed a first profile pack called `skincare`.

Fields:

```text
skin_type
  label: Skin type
  value_type: single_select
  options: Oily, Dry, Combination, Sensitive, Normal
  pos_visible: true
  cashier_editable: true
  marketing_usable: true
  sensitivity_level: internal

skin_concerns
  label: Skin concerns
  value_type: multi_select
  options: Acne, Pigmentation, Ageing, Redness, Dehydration, Uneven texture
  pos_visible: true
  cashier_editable: true
  marketing_usable: true
  sensitivity_level: internal

reported_sensitivities
  label: Reported sensitivities
  value_type: tag_list
  options: fragrance, retinol, AHA, BHA, parabens, essential oils, benzoyl peroxide
  pos_visible: true
  cashier_editable: true
  marketing_usable: false
  sensitivity_level: confidential

reported_sensitivity_note
  label: Sensitivity note
  value_type: text
  pos_visible: true
  cashier_editable: true
  marketing_usable: false
  sensitivity_level: confidential
```

Use `reported_sensitivities`, not `known_allergies`, because staff-entered data is self-reported unless clinically verified.

Treat `Sensitive` skin type as a risk modifier, not as the full safety model. A customer can have `Sensitive` skin plus explicit reported sensitivities such as `retinol` or `fragrance`.

## CRM Migration Plan

Add a new CRM migration:

```text
supabase/migrations/0004_profile_field_packs.sql
```

Schema changes:

```text
crm_profile_packs
  id uuid primary key
  workspace_id uuid references crm_workspaces(id)
  key text
  label text
  description text
  vertical text
  status active|archived
  install_mode manual|default|system
  metadata jsonb
  created_at timestamptz
  updated_at timestamptz
  unique(workspace_id, key)
```

Extend `crm_field_definitions`:

```text
pack_key text
description text
help_text text
sensitivity_level text default 'internal'
pos_visible boolean default false
cashier_editable boolean default false
marketing_usable boolean default false
ui_contexts text[] default '{}'
sort_order integer default 0
metadata jsonb default '{}'
```

Do not add a separate current-value table in this first CRM UI slice.

Use this MVP write path:

```text
current state:
  crm_entities.attributes.profile_packs[pack_key][field_key]

provenance/history:
  crm_customer_facts
```

Reason:

- `crm_entities.attributes` is already the flexible entity state container.
- `crm_customer_facts` already gives the provenance timeline.
- A separate current-value table introduces immediate sync risk between entity attributes, value rows, and facts.
- The first UI slice does not need advanced value-table queries.
- The API can still be pack-scoped so storage can move later without changing POS.

The durable contract is:

```text
pack_key + field_key + value + provenance + sensitivity + projection context
```

If a future phase needs query-optimized current values, add `crm_profile_field_values` later behind the same API contract.

### Pack-Aware Field Uniqueness

The current CRM table uses:

```text
unique(workspace_id, entity_type, key)
```

That is too tight for profile packs because multiple packs may need generic field keys like `notes`, `goals`, `preferences`, `size`, or `risk_note`.

The migration should make uniqueness pack-aware:

```sql
alter table public.crm_field_definitions
  add column pack_key text,
  add column description text,
  add column help_text text,
  add column sensitivity_level text not null default 'internal',
  add column pos_visible boolean not null default false,
  add column cashier_editable boolean not null default false,
  add column marketing_usable boolean not null default false,
  add column ui_contexts text[] not null default '{}',
  add column sort_order integer not null default 0,
  add column metadata jsonb not null default '{}'::jsonb;

alter table public.crm_field_definitions
  drop constraint crm_field_definitions_workspace_id_entity_type_key_key;

create unique index crm_field_definitions_base_key_idx
  on public.crm_field_definitions(workspace_id, entity_type, key)
  where pack_key is null;

create unique index crm_field_definitions_pack_key_idx
  on public.crm_field_definitions(workspace_id, entity_type, pack_key, key)
  where pack_key is not null;
```

Verify the exact existing constraint name in the database before writing the migration.

Update `value_type` support from:

```text
text, number, date, boolean, email, phone, json, enum
```

to:

```text
text, number, date, boolean, email, phone, json, enum, single_select, multi_select, tag_list
```

RLS:

- Workspace members can read profile packs and field definitions.
- Owner/admin can install packs and mutate field definitions.
- Service role keeps API access for server routes.
- `anon` should not have access.

The migration must include explicit service-role access for the new table because `supabase/migrations/0003_data_api_service_role_grants.sql` only grants access to the older explicit table list:

```sql
alter table public.crm_profile_packs enable row level security;

grant select, insert, update, delete on table
  public.crm_profile_packs
to service_role;
```

Do not grant `anon`. Browser access should continue to go through Nuxt API routes unless the project deliberately changes its Data API exposure model.

Seed behavior:

- For hosted workspace setup, seed core fields as today.
- Add an install action for the skincare pack rather than forcing every workspace to have skincare fields.
- Demo mode should show the skincare pack installed for Ava Tan.

## Profile Value Storage

For MVP, store current editable values on the person entity:

```text
crm_entities.attributes.profile_packs = {
  "skincare": {
    "skin_type": "Combination",
    "skin_concerns": ["Acne", "Pigmentation"],
    "reported_sensitivities": ["retinol", "fragrance"],
    "reported_sensitivity_note": "Customer reports irritation with strong actives."
  }
}
```

Also write provenance facts into `crm_customer_facts`:

```text
fact_type: customer_profile
fact_key: skincare.skin_type | skincare.skin_concerns | skincare.reported_sensitivities | skincare.reported_sensitivity_note
value: jsonb
source_system: crm_ui | pos | customer_form | ecommerce
sensitivity_level: internal | confidential
occurred_at
```

Reason:

- `crm_entities.attributes` gives the UI a simple current-state read/write path.
- `crm_customer_facts` preserves timeline/provenance for later agent reasoning and audits.

Computed projections can later summarize these into `crm_customer_profiles.affinity_profile`, `intent_profile`, or `metric_values`.

## Value Validation Rules

The profile-field update route must validate values by `value_type`:

```text
single_select
  value must be one option from enum_values

multi_select
  value must be an array
  every item must be in enum_values

tag_list
  value must be an array of strings
  enum_values are suggestions unless metadata.closed_list = true

text
  value must be a string or null

number
  value must be numeric or null

boolean
  value must be boolean or null

json
  value may be structured JSON
```

Do not make `tag_list` behave exactly like `multi_select` unless the field explicitly says the tag list is closed. Future packs may need open-ended tags for preferred brands, alteration notes, pet diet restrictions, supplement constraints, or staff-entered risk notes.

## CRM API Plan

Add or extend these routes:

```text
GET /api/profile-packs
GET /api/profile-packs/[pack_key]
POST /api/profile-packs/[pack_key]/install
GET /api/v1/people/[person_id]/counter-profile
PATCH /api/v1/people/[person_id]/profile-fields
```

Use `skincare` as the initial `pack_key`, but keep route handlers dynamic.

### `GET /api/profile-packs/[pack_key]`

Returns the pack definition and field options.

Response shape:

```json
{
  "key": "skincare",
  "label": "Skincare profile",
  "fields": [
    {
      "key": "skin_type",
      "label": "Skin type",
      "valueType": "single_select",
      "options": ["Oily", "Dry", "Combination", "Sensitive", "Normal"],
      "posVisible": true,
      "cashierEditable": true,
      "marketingUsable": true,
      "sensitivityLevel": "internal"
    }
  ]
}
```

### `POST /api/profile-packs/skincare/install`

Installs the pack into a workspace by inserting `crm_profile_packs` and matching `crm_field_definitions`.

Implementation route should be dynamic:

```text
POST /api/profile-packs/[pack_key]/install
```

Rules:

- Requires `workspaceId`.
- Supabase mode requires authenticated owner/admin.
- Demo mode returns an accepted demo response.
- Idempotent by `(workspace_id, key)` and `(workspace_id, entity_type, field key)`.

### `GET /api/v1/people/[person_id]/counter-profile`

Returns only fields safe for POS counter use.

Supabase mode rules:

- Requires `workspaceId`.
- Requires bearer token.
- Requires workspace membership.
- Verifies `crm_entities.id = person_id`.
- Verifies `crm_entities.workspace_id = workspaceId`.
- Verifies `crm_entities.type = person`.
- Returns only installed pack fields where `pos_visible = true`.

Response shape:

```json
{
  "personId": "person uuid",
  "displayName": "Ava Tan",
  "source": "crm",
  "packs": {
    "skincare": {
      "fields": {
        "skin_type": "Combination",
        "skin_concerns": ["Acne", "Pigmentation"],
        "reported_sensitivities": ["retinol", "fragrance"],
        "reported_sensitivity_note": "Customer reports irritation with strong actives."
      }
    }
  },
  "warnings": [
    {
      "type": "reported_sensitivity",
      "label": "Retinol",
      "severity": "review"
    }
  ],
  "provenance": {
    "sourceSystems": ["crm_ui", "pos"],
    "updatedAt": "2026-06-24T00:00:00.000Z"
  }
}
```

### `PATCH /api/v1/people/[person_id]/profile-fields`

Updates profile fields for a person and records facts.

Payload:

```json
{
  "workspaceId": "workspace uuid",
  "packKey": "skincare",
  "fields": {
    "skin_type": "Combination",
    "skin_concerns": ["Acne", "Pigmentation"],
    "reported_sensitivities": ["retinol", "fragrance"],
    "reported_sensitivity_note": "Customer reports irritation with strong actives."
  },
  "sourceSystem": "crm_ui"
}
```

Rules:

- Validate field keys against `crm_field_definitions`.
- Validate enum values against `enum_values`.
- Store values under the supplied `packKey`; do not branch logic only for `skincare`.
- Requires `workspaceId`.
- Requires bearer token in Supabase mode.
- Requires workspace membership.
- Verifies the person belongs to the requested workspace.
- Requires installed pack definitions for the requested `packKey`.
- Allows owner/admin/member to edit unless the workspace later adds stricter field-level policy.
- Keep `reported_sensitivities` out of marketing-usable segments by default.
- Write both current entity attributes and `crm_customer_facts`.

Pack installation should be stricter:

```text
POST /api/profile-packs/[pack_key]/install
  requires workspaceId
  requires bearer token in Supabase mode
  requires owner/admin
  idempotent by workspace and pack key
```

Use the existing CRM auth helpers:

```text
server/utils/supabase-auth.ts
  requireSupabaseUser()
  requireWorkspaceMembership()
```

Follow the safer pattern already used by `server/api/graph/search.get.ts`: parse `workspaceId`, require the signed-in user, require workspace membership, then query rows by `workspace_id`.

## Sensitivity Enforcement

Sensitivity fields must affect behavior, not only UI badges.

Rules:

- `counter-profile` returns only fields where `pos_visible = true`.
- Marketing and segment APIs must exclude fields where `marketing_usable = false`.
- Export and agent routes should treat `confidential` and `restricted` as policy-bearing values.
- UI badges help staff understand the risk, but backend filters enforce the rule.

For skincare:

```text
skin_type
  merchandising/profile preference
  marketing_usable = true

skin_concerns
  merchandising/profile preference
  marketing_usable = true

reported_sensitivities
  self-reported risk signal
  marketing_usable = false

reported_sensitivity_note
  confidential operational note
  marketing_usable = false
```

POS can show confidential counter-visible fields for advisory review, but they should not silently become campaign targeting fields.

## CRM UI Plan

### Schema Page

Files:

```text
app/pages/schema.vue
app/components/SchemaDesigner.vue
```

Add a profile-pack installer area:

```text
Available packs
- Skincare profile
  Skin type, Skin concerns, Reported sensitivities
  [Install pack]
```

After install, the schema field list should show:

- Pack badge: `skincare`
- Value type: `single_select`, `multi_select`, `tag_list`, `text`
- Counter visibility: `POS`
- Marketing eligibility: `Campaigns` or `Not marketing usable`
- Sensitivity level: `internal` or `confidential`

Update `SchemaDesigner.vue` to support:

- field pack display
- enum option preview
- new value types
- sensitivity/visibility badges
- idempotent install state

### Graph Page Person Detail

Files:

```text
app/pages/graph.vue
app/components/GraphWorkspace.vue
```

Add a person detail panel section for skincare fields when the selected entity is a person.

Suggested new generic component:

```text
app/components/ProfilePackPanel.vue
```

Optional thin wrapper for the first demo:

```text
app/components/SkincareProfilePanel.vue
```

The wrapper should only pass `packKey="skincare"` and display copy. The field rendering, validation display, chips, and save behavior should live in `ProfilePackPanel.vue`.

Display:

```text
Skin type: Combination
Concerns: Acne, Pigmentation
Reported sensitivities: Retinol, Fragrance
Note: Customer reports irritation with strong actives.
```

Editing:

- Skin type: single-select chips or compact select.
- Concerns: multi-select chips.
- Sensitivities: tag chips plus optional note.
- Save button calls `PATCH /api/v1/people/[person_id]/profile-fields`.

Do not add a large CRM form to the graph page. Keep it as an operational profile panel.

### Demo Data

File:

```text
server/utils/demo-crm.ts
```

Update `demoCrmGraph.entities[person_001].attributes`:

```json
{
  "profile_packs": {
    "skincare": {
      "skin_type": "Combination",
      "skin_concerns": ["Acne", "Pigmentation"],
      "reported_sensitivities": ["retinol", "fragrance"],
      "reported_sensitivity_note": "Customer reports irritation with strong actives."
    }
  }
}
```

Also add skincare fields to `shopifyCustomerFields` or a separate `skincareProfileFields` export.

Better structure:

```text
commerceCustomerFields
profilePackDefinitions
skincareProfileFields
demoProfilePacks
```

Then `demoCrmGraph.customerFields` can merge commerce + installed pack fields. The merge should not assume the only installed pack is skincare.

Also add a small non-skincare demo fixture, for example:

```text
fashion_fit
  preferred_fit
  size_by_brand
  alteration_notes
```

It does not need full UI polish in this slice. Its job is to prove routes, demo fixtures, tests, and type contracts do not special-case skincare.

### API Console

File:

```text
app/pages/api-console.vue
```

Add examples for:

```text
GET /api/profile-packs/skincare
POST /api/profile-packs/skincare/install
GET /api/v1/people/person_001/counter-profile
PATCH /api/v1/people/person_001/profile-fields
```

Also include a second non-skincare example in API docs or demo fixtures, even if it is not implemented in UI yet. `fashion_fit` is a good small fixture because it proves the pack contract handles measurements/preferences instead of only health/sensitivity fields.

## POS Contract To Test Later

Once CRM UI works, POS should consume:

```text
GET /api/v1/people/[person_id]/counter-profile
```

POS should not need to understand `crm_field_definitions` directly.

Expected POS counter payload:

```json
{
  "displayName": "Ava Tan",
  "packs": {
    "skincare": {
      "fields": {
        "skin_type": "Combination",
        "skin_concerns": ["Acne", "Pigmentation"],
        "reported_sensitivities": ["retinol", "fragrance"]
      }
    }
  },
  "warnings": [
    { "type": "reported_sensitivity", "label": "Retinol", "severity": "review" }
  ]
}
```

Later POS cart compatibility can compare this with product metadata:

```text
product.active_ingredients includes retinol
customer.reported_sensitivities includes retinol
-> show review warning
```

This is advisory. Do not block checkout by default.

## Tests To Add In CRM Repo

Update existing test files:

```text
tests/contracts.test.ts
tests/customer-memory.test.ts
tests/demo-crm.test.ts
tests/docs.test.ts
```

Add coverage:

- Migration creates `crm_profile_packs`.
- Migration extends `crm_field_definitions` with pack/visibility/sensitivity columns.
- Skincare pack is seeded or installable.
- `SchemaDesigner.vue` supports `single_select`, `multi_select`, and `tag_list`.
- Demo graph includes skincare fields for Ava Tan.
- Counter profile API excludes non-POS-visible fields.
- Generic profile pack API works for at least one non-skincare fixture.
- Generic profile panel renders fields from definitions rather than hardcoded skincare keys.
- Profile update API validates enum values and writes customer facts.
- Docs mention the new APIs and data model.
- Public docs under `content/docs/*` mention the new APIs and data model, not only `docs/agents/*`.

Run:

```text
npm test
npm run typecheck
npm run build
```

## Build Order In CRM Repo

1. Add migration `0004_profile_field_packs.sql`.
2. Extend `crm_field_definitions` with pack metadata and pack-aware uniqueness.
3. Add `crm_profile_packs` with RLS and service-role grants.
4. Do not add `crm_profile_field_values` yet.
5. Extend `app/types/crm.ts` for pack, field metadata, validation metadata, and profile values.
6. Update `server/utils/demo-crm.ts` with skincare pack, Ava Tan skincare values, and one non-skincare fixture.
7. Add dynamic pack read/install API routes.
8. Add `counter-profile` API with workspace membership enforcement.
9. Add `profile-fields` PATCH API with validation, workspace enforcement, and fact writes.
10. Update `SchemaDesigner.vue` and `schema.vue` for pack install and richer field display.
11. Add generic `ProfilePackPanel.vue`.
12. Add optional `SkincareProfilePanel.vue` wrapper only if useful for demo copy.
13. Wire `GraphWorkspace.vue` to show/edit installed profile packs on selected person.
14. Update API console examples.
15. Update `docs/agents/API_CONTRACT.md`, `docs/agents/DATA_MODEL.md`, `content/docs/api.md`, and `content/docs/model.md`.
16. Add tests for migration shape, route contracts, demo fixtures, UI contract, and docs coverage.

## Acceptance Criteria

CRM UI:

- Schema page shows the skincare pack.
- User can install the skincare pack into a workspace.
- The pack system can represent at least one non-skincare fixture without schema changes.
- Installed fields show value type, options, POS visibility, marketing usability, and sensitivity level.
- Graph page selected person shows skincare profile values.
- User can edit skin type, concerns, and reported sensitivities.
- Save persists after refresh in Supabase mode.
- Demo mode still works without Supabase credentials.

API:

- Pack install is idempotent.
- Counter profile returns only POS-visible fields.
- Sensitive fields are marked correctly.
- Invalid enum values are rejected.
- Updates create provenance facts in `crm_customer_facts`.
- Workspace membership is enforced before person profile reads or writes.
- Pack install requires owner/admin.
- Marketing-unsafe fields are excluded from marketing/segment projections.

POS-readiness:

- A future POS call can fetch a compact counter profile without querying CRM schema internals.
- Reported sensitivities are structured enough for product/cart warnings.
- Marketing segmentation can use skin type and concerns, but not reported sensitivities by default.

## Non-Goals For This CRM Slice

- Do not implement POS cart warnings yet.
- Do not build ingredient-level INCI parsing yet.
- Do not make skincare fields global core fields for every workspace.
- Do not name generic routes, components, tables, or tests as if skincare is the only extension type.
- Do not treat staff-entered sensitivities as verified medical allergy data.
- Do not block sales or recommendations automatically from CRM alone.
- Do not expose service-role credentials or CRM connector secrets in browser code.

## Next POS Slice After CRM UI

After the CRM repo proves the skincare pack:

1. Add POS Open Spine connector setting for counter profile lookup.
2. Add customer modal skincare summary.
3. Add product metadata tags for active ingredients and avoid-if sensitivities.
4. Add cart advisory warnings.
5. Emit `pos.customer.profile.updated` when POS edits counter-safe fields.
