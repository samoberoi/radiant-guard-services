# Fix duplicate save confirmation + add unsaved-changes guard

## What's happening today

I reviewed the form dialogs across the admin section and found two patterns that match your complaints exactly:

1. **Double save confirmation.** ~40 form dialogs (designation, duty, allowance, customer/branch/unit, vehicles, inventory, etc.) call `confirmAction({ title: "Save changes?" })` *before* actually submitting. So clicking Save shows "Do you want to save these changes?", then on confirm it saves and shows a success toast — that's the two messages you're seeing.
2. **No discard guard.** All form dialogs use the shadcn `Dialog`, which closes immediately on:
   - the top-right ✕ icon
   - clicking outside the panel
   - pressing Escape
   - the Cancel button
   None of these check whether the user has typed anything, so half-filled forms are lost silently.

## Plan

### 1. Remove the pre-save confirmation (everywhere)

Strip the `confirmAction({ title: "Save changes?", ... })` guard from every Save handler. Clicking the Save button is already an explicit intent — the only feedback should be the success/error toast. Files touched (one or two lines each):

`admin.designation-manager`, `admin.duty-manager`, `admin.allowance-manager`, `admin.language-manager`, `admin.service-type-manager`, `admin.billing-type-manager`, `admin.attendance-code-manager`, `admin.cost-component-manager`, `admin.payroll-manager`, `admin.payroll-days-manager`, `admin.offboarding-reason-manager`, `admin.ex-service-manager`, `admin.asset-manager`, `admin.lwf-manager`, `admin.professional-tax-manager`, `admin.esic-branch-manager`, `admin.company-documents`, `admin.contracts.client-contracts`, `admin.candidates.$id.details`, `admin.rbac`, `admin.customers.{state,branch,unit,customer}-manager`, `admin.vehicles.{pucs,fastags,insurances,inventory}`, `admin.inventory.{items,vendors,warehouses}`.

Destructive actions (Delete / Disable) keep their existing confirm — those are not what you're complaining about.

### 2. Global "Discard unsaved changes?" guard

Build one reusable primitive instead of patching every dialog ad-hoc:

- **New file `src/components/DirtyDialog.tsx`** — thin wrapper around shadcn `Dialog` + `DialogContent` that accepts a `dirty: boolean` prop. It intercepts:
  - `onOpenChange(false)` (Cancel button, programmatic close)
  - `onPointerDownOutside` (clicking the backdrop)
  - `onEscapeKeyDown` (Esc key)
  - the built-in top-right ✕ (replaced with our own so it routes through the same handler)
  
  When `dirty` is true it calls `confirmAction({ title: "Discard unsaved changes?", description: "Any information you've entered will be lost.", confirmText: "Discard", destructive: true })` and only closes on confirm. When `dirty` is false it closes immediately (current behaviour).

- **Dirty tracking helper `useDirtyForm(initialValues)`** in the same file — returns `{ dirty, markPristine, bind }` so each form can wire it up with two lines: compare current state to a snapshot taken when the dialog opens, reset on successful save.

- **Migrate the form dialogs** in the files listed above from `<Dialog>` / `<DialogContent>` to `<DirtyDialog dirty={...}>`. Cancel buttons keep calling `onOpenChange(false)` so they go through the same guard automatically.

- **Leave alone:** `AlertDialog` confirmations (already modal-by-intent), `Sheet` side panels not used for editing, dropdown/command popovers, and read-only view dialogs — no dirty state to protect.

### 3. Verification

- Open any form (e.g. Designation → Add): typing then clicking outside / Esc / ✕ / Cancel → shows "Discard unsaved changes?". Clicking Save → saves directly with one success toast, no "Save changes?" prompt.
- Opening a form and closing without typing → closes immediately, no prompt (so we don't annoy users who just peeked).

## Technical notes

- The wrapper hides Radix's default `DialogPrimitive.Close` and renders its own ✕ that calls the guarded close, so the existing absolute-positioned close icon in `ui/dialog.tsx` stays untouched for non-form dialogs.
- `confirmAction` from `ConfirmProvider` already works module-level, so the wrapper has no extra context wiring.
- Dirty comparison uses a shallow JSON snapshot of the tracked field object — adequate for the flat form shapes used here; nested arrays (e.g. line-item editors in goods-receipts/PO) will pass the whole object so any change still flips dirty=true.
- No backend, schema, or business-logic changes.
