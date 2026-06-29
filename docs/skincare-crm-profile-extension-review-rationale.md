# Skincare CRM Profile Extension Review Rationale

This is feedback on `docs/skincare-crm-profile-extension-plan.md`.

Verdict: use the plan, but implement it as a thin generic profile-pack foundation first. Skincare is a good first vertical test, but the CRM slice should avoid creating a second value store, should tighten workspace scoping, and should make sensitivity rules enforceable rather than cosmetic.

## Why The Direction Is Right

The plan correctly keeps skincare out of core POS and CRM customer columns.

The right product boundary is:

```text
CRM owns field definitions, packs, provenance, sensitivity, and projections.
POS consumes a compact counter-safe projection.
```

That matches the current Open Spine CRM shape. The CRM already has:

- Generic field definitions in `C:\Users\Jeremy Tan\CodeProjects\crm\supabase\migrations\0001_headless_crm.sql`.
- JSON-backed entities in `crm_entities.attributes`.
- Provenance-capable facts in `crm_customer_facts`.
- Computed read models in `crm_customer_profiles`.
- Nuxt API routes that can sit between POS and Supabase.

So the plan's main idea is sound: use skincare to prove profile packs, not to create a skincare CRM.

## Why I Would Keep MVP Storage Simple

The plan proposes two possible current-value stores:

- `crm_entities.attributes.profile_packs`
- Optional `crm_profile_field_values`

For the first CRM UI slice, do not add `crm_profile_field_values`.

Use this MVP write path:

```text
current state:
  crm_entities.attributes.profile_packs[pack_key][field_key]

provenance/history:
  crm_customer_facts
```

Reasoning:

- `crm_entities.attributes` is already the flexible entity state container.
- `crm_customer_facts` already gives the provenance timeline.
- A separate current-value table introduces sync risk immediately: one API update now has to keep entity attributes, current value rows, and facts consistent.
- The first UI slice does not yet need advanced value-table queries.
- The API can still be shaped as pack-scoped, so storage can move later without changing POS.

The important contract is not the storage table. The important contract is:

```text
pack_key + field_key + value + provenance + sensitivity + projection context
```

## Required Schema Adjustment

The current CRM table has this uniqueness shape:

```text
crm_field_definitions unique(workspace_id, entity_type, key)
```

That is fine for base fields, but it is too tight for profile packs. Multiple packs may reasonably want the same field key, such as:

- `notes`
- `goals`
- `preferences`
- `size`
- `risk_note`

The profile-pack migration should make uniqueness pack-aware.

Recommended shape:

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

The exact constraint name should be verified in the local database before writing the migration.

## Required Supabase Grant Adjustment

The plan mentions RLS, but a new table also needs service-role access in this repo's current migration style.

The CRM repo already has `supabase/migrations/0003_data_api_service_role_grants.sql`, which grants `service_role` access to the existing tables. A new `crm_profile_packs` table will not automatically be covered by that older explicit table list.

The profile-pack migration should include:

```sql
alter table public.crm_profile_packs enable row level security;

grant select, insert, update, delete on table
  public.crm_profile_packs
to service_role;
```

If a future `crm_profile_field_values` table is added, it needs the same treatment.

Do not grant `anon` access. Browser access should go through Nuxt API routes unless the project deliberately changes its Data API exposure model.

## Why Workspace Scoping Needs To Be Explicit

The plan says "work inside a workspace boundary". That needs to be enforced in each new route.

The CRM repo already has a good helper:

```text
server/utils/supabase-auth.ts
  requireSupabaseUser()
  requireWorkspaceMembership()
```

And `server/api/graph/search.get.ts` already follows the safer pattern:

```text
parse workspaceId
require authenticated user
require workspace membership
query rows by workspace_id
```

The new profile routes should copy that pattern.

This matters because `person_id` alone is not a sufficient API boundary. Even if UUIDs are globally unique, the route should prove the requested person belongs to the requested workspace before returning profile data.

Recommended route rules:

```text
GET /api/v1/people/[person_id]/counter-profile
  requires workspaceId in Supabase mode
  requires bearer token
  requires workspace membership
  verifies crm_entities.id = person_id and workspace_id = workspaceId and type = person

PATCH /api/v1/people/[person_id]/profile-fields
  requires workspaceId
  requires bearer token
  requires owner/admin/member, depending on edit policy
  verifies person belongs to workspace
  validates pack installation
  validates fields against crm_field_definitions
```

Pack installation should be stricter:

```text
POST /api/profile-packs/[pack_key]/install
  requires workspaceId
  requires owner/admin
  idempotent by workspace and pack key
```

## Sensitivity Must Be Enforced, Not Just Displayed

The plan correctly marks `reported_sensitivities` and `reported_sensitivity_note` as confidential and not marketing-usable.

That should affect API behavior:

- `counter-profile` should include only fields with `pos_visible = true`.
- Marketing or segment APIs should exclude fields where `marketing_usable = false`.
- Export or agent routes should treat `confidential` and `restricted` as policy-bearing values, not labels.
- UI badges are useful, but they are not enforcement.

For skincare specifically, this distinction matters:

```text
skin_type = merchandising/profile preference
reported_sensitivities = self-reported risk signal
reported_sensitivity_note = confidential operational note
```

The POS counter can show the latter two for advisory review, but they should not silently become campaign targeting fields.

## Value Type Notes

Adding these value types makes sense:

```text
single_select
multi_select
tag_list
```

But validation should be precise:

- `single_select`: value is one option from `enum_values`.
- `multi_select`: value is an array; every item must be in `enum_values`.
- `tag_list`: value is an array of strings; `enum_values` can be suggestions or an allow-list depending on field metadata.

Do not make `tag_list` behave exactly like `multi_select` unless the field explicitly says the tag list is closed.

This matters because future packs may need open-ended tags:

- reported sensitivities
- preferred brands
- alteration notes
- pet diet restrictions
- supplement constraints

## Public API Boundary For POS

POS should not read CRM field definitions directly.

The stable POS-facing boundary should be:

```text
GET /api/v1/people/[person_id]/counter-profile
```

That route should return a compact projection:

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
        "reported_sensitivities": ["retinol", "fragrance"]
      }
    }
  },
  "warnings": [
    {
      "type": "reported_sensitivity",
      "label": "Retinol",
      "severity": "review"
    }
  ]
}
```

This lets POS stay simple:

- fast customer lookup
- attach customer to sale
- show compact advisory context
- later compare cart/product metadata against reported sensitivities

The POS checkout should not block sales by default based only on CRM profile data.

## UI Implementation Order

The current CRM UI is still simple:

- `SchemaDesigner.vue` has a small field list and add-field form.
- `GraphWorkspace.vue` shows selected entity attributes in a detail panel.

That is good timing for this change. The pack abstraction can be added before the UI grows around hardcoded customer fields.

Recommended UI approach:

```text
Schema page:
  show available packs
  install skincare pack
  show pack badges, value types, visibility, sensitivity

Graph page:
  show a generic ProfilePackPanel for selected person
  render fields from definitions
  use skincare only as installed demo data
```

Avoid a large customer form on the graph page. Keep the panel operational and compact.

## Documentation/Test Requirement

The CRM repo has an explicit maintenance rule: API route changes must update documentation in the same change.

The tests also enforce public route coverage. When new API files are added under `server/api`, update both:

```text
docs/agents/API_CONTRACT.md
content/docs/api.md
```

Because this change touches data model surfaces, also update:

```text
docs/agents/DATA_MODEL.md
content/docs/model.md
```

If the public docs UI renders those content files, updating only `docs/agents/*` is not enough.

## Suggested Final Build Order

Use the original plan's build order, with these edits:

1. Add `crm_profile_packs` and extend `crm_field_definitions`.
2. Do not add `crm_profile_field_values` yet.
3. Fix `crm_field_definitions` uniqueness for packed fields.
4. Add service-role grants and RLS for new tables.
5. Extend value type contracts and tests.
6. Add demo pack definitions and Ava Tan skincare values.
7. Add dynamic pack read/install APIs.
8. Add `counter-profile` API with workspace membership enforcement.
9. Add `profile-fields` PATCH API with validation and fact writes.
10. Add Schema page pack installer and richer field display.
11. Add generic `ProfilePackPanel`.
12. Wire the Graph page to render installed profile packs.
13. Update API console examples.
14. Update agent docs and public docs.
15. Add tests for migration shape, route contracts, demo fixtures, and docs coverage.

## Bottom Line

The plan is good because it protects the platform shape:

```text
generic CRM spine -> installable profile packs -> context-specific projections -> POS consumes only counter-safe output
```

The changes above keep that shape from drifting into:

- skincare-specific CRM core
- duplicate current-value storage
- weak workspace scoping
- sensitivity flags that only appear in the UI
- POS depending on CRM schema internals

That is why the recommended implementation is narrower than the plan in storage, stricter than the plan in route authorization, and more explicit than the plan in documentation and projection rules.
