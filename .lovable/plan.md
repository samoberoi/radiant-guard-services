# Block deleting parents that still have dependents

## Goal

Wherever a record is referenced by other records, the delete button is **disabled** and shows a tooltip:
> "Cannot delete — N {dependent} still linked to this {entity}. Remove them first."

Same treatment everywhere: list rows, detail screens, and any bulk-delete affordance.

## Shared building block

Create `src/lib/dependency-checks.ts` exporting:

- `useDependencyCounts(entity, id)` — React Query hook that runs the right Supabase count queries for that entity and returns `{ total, breakdown: [{ label, count, route? }] }`.
- `<DeleteGuardButton entity id onConfirmDelete />` — wraps the existing trash/delete button, disables it when `total > 0`, and renders a Tooltip with the breakdown. Falls back to the existing confirm dialog when `total === 0`.

This keeps each page's diff to: swap `<Button …Trash2…>` → `<DeleteGuardButton …>`.

## Relationship map (parent → blockers)

```text
customers           ← units, customer_gst_numbers
units               ← client_contracts, candidates, candidate_units, employee_scope_assignments
indian_states       ← branches.state_id, + string refs in lwf.state, pt_slabs.state,
                       cost_components.state, customers.*_state, units.*_state, pincode_ranges.state
branches            ← units (by branch fields, if any) — verify
client_contracts    ← contract_resources
designations        ← candidates, contract_resources
service_types       ← client_contracts, contract_resources
billing_types       ← client_contracts
payroll_windows     ← client_contracts
payroll_day_bases   ← contract_resources
roles               ← candidates.role_key, role_permissions.role_key
ex_services         ← candidates.ex_service_id
offboarding_reasons ← candidates.offboarding_reason_id
esic_branches       ← candidates / units (verify usage)
languages           ← candidates.languages (jsonb)            ⚠ jsonb scan
assets              ← candidates.assigned_asset_ids (uuid[])  ⚠ array scan
allowance_types     ← contract_resources.components (jsonb)   ⚠ jsonb scan
cost_components     ← contract_resources.* (jsonb)            ⚠ jsonb scan
duties              ← (verify; likely standalone)
company_document_templates ← employee_signed_documents.template_id
candidates          ← employee_signed_documents, candidate_units, employee_scope_assignments
```

The ⚠ jsonb/array ones need a Postgres function (e.g. `count_allowance_usage(allowance_id)`) to scan efficiently. I'll add those as `SECURITY DEFINER` SQL functions in a single migration.

## Files touched (22 admin pages)

`admin.customers.customer-manager`, `admin.customers.unit-manager`, `admin.customers.branch-manager`, `admin.customers.state-manager`, `admin.contracts.client-contracts`, `admin.designation-manager`, `admin.service-type-manager`, `admin.billing-type-manager`, `admin.payroll-manager`, `admin.payroll-days-manager`, `admin.rbac` (roles), `admin.ex-service-manager`, `admin.offboarding-reason-manager`, `admin.esic-branch-manager`, `admin.language-manager`, `admin.asset-manager`, `admin.allowance-manager`, `admin.cost-component-manager`, `admin.lwf-manager`, `admin.professional-tax-manager`, `admin.duty-manager`, `admin.employees` (candidates).

## Out of scope (confirm)

- **Soft-delete / disable** stays untouched — only hard delete is guarded.
- **System tables** with `is_system = true` (e.g. system roles) already block delete — I'll keep that behavior and stack the dependency tooltip on top.
- **Cascading auto-delete** is not introduced — we only inform & block.

## Rollout order

1. Migration: jsonb/array count functions.
2. Shared `DeleteGuardButton` + `useDependencyCounts`.
3. Wire into the 4 most-used parents first: **customers, units, states, client_contracts**.
4. Roll out to the remaining 18 pages in a follow-up batch.

Shall I proceed with step 1+2+3 in this turn, and the rest in the next?
