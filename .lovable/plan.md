I found the current saved contract resource still has Uniform Charges stored as ₹300 in the backend, so the ₹925 edit is not being persisted into `contract_resources.deductions`.

Plan:
1. Fix the resource-save flow in Client Contracts so changing a fixed deduction amount updates the in-memory resource row reliably before the contract save.
2. Keep percentage/statutory deductions unchanged, only apply this to editable fixed/manual deductions like Uniform Charges.
3. Add a save verification step after persisting resources: refetch the saved resource deductions and confirm the edited amount is what comes back from the backend.
4. Verify the same updated amount flows into Payroll and export, because Payroll reads Uniform Charges from `contract_resources.deductions`.