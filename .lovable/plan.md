## Problem

In the **Resource editor dialog** (opened from Contracts → edit a contract → Resources → ✏️ on a row), clicking the ✕ next to a Deduction (or Benefit / Wage Component / Employer Contribution) updates the list in state, but the **Save Resource** button stays disabled.

Root cause is in `src/components/ui/dialog.tsx`: the dialog tracks "dirty" only via DOM `input`/`change` events. A Remove (✕) click is neither, so the dialog remains `data-pristine="true"`, and `src/styles.css` (`[data-pristine="true"] button[data-save-intent="true"]`) disables Save Resource. Because the user can't save the inner dialog, the outer **Save Changes** button never gets the `data-force-enabled` flag either, so the chain is stuck.

The Add-via-picker path has the same flaw (also a click), and the wage-component amount fields work only because they fire `input`. Editing/removing should behave identically.

## Fix

In `src/routes/admin.contracts.client-contracts.tsx`, inside `ResourceFormDialog`, call the existing `useDialogDirty().markDirty()` helper from every mutation handler so the dialog correctly becomes dirty regardless of input source.

Handlers to wire:
- Wage components: `addComponent`, `removeComponent`, `updateComponent` (line ~3147 area)
- Benefits: `addBenefit`, `updateBenefitAmount`, `removeBenefit`
- Deductions: `addDeduction`, `updateDeductionAmount`, `removeDeduction` (lines 3300–3312)
- Employer contributions: `addEmployerContribution`, `updateEmployerContributionAmount`, `removeEmployerContribution`

Implementation:
1. At the top of `ResourceFormDialog`, add `const { markDirty } = useDialogDirty();` and import `useDialogDirty` from `@/components/ui/dialog`.
2. Call `markDirty()` as the first statement in each of the handlers above (one line each).
3. Do not touch the initial-hydration `useEffect` that seeds state from `initial` — that already runs before the user interacts and the guard resets on open.

No changes needed to the outer dialog logic — once Save Resource works, the existing `hasStagedResourceChanges` + `resourcesSnapshot !== savedResourcesSnapshot` path already force-enables **Save Changes** on the contract form.

## Verification

- Open a contract → Edit a resource → remove a deduction → **Save Resource** becomes enabled.
- Same for removing a benefit, wage component, or employer contribution, and for adding any of them via the picker.
- After saving the resource, the outer **Save Changes** button is enabled and persisting the contract works end-to-end.
- Editing an amount field (existing behaviour) continues to work.
