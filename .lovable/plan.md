## Problems

1. **EPF employer shows ₹1,800 in MIS but ₹1,950 in contract.**
   Reason: payroll-calc forces *every* EPF row (employee + employer) to the statutory **12% × ₹15,000 = ₹1,800** ceiling. Contracts usually load the employer side at **13% (12% PF + 0.5% EDLI + 0.5% admin) = ₹1,950**. The override is wiping out that 13%.

2. **LWF employer keeps fluctuating (12.5 → 11/12/13).**
   Reason: employer LWF is being scaled by the attendance ratio (earned/contract gross). Only `Uniform` is currently treated as a fixed (non-prorated) item; LWF is statutory flat per month and must not move with attendance.

## Fixes — `src/lib/payroll-calc.ts`

### A. Split EPF override into employee vs employer

- **Employee EPF** stays at statutory: `12% of (earned Gross − earned HRA)`, capped so the *base* never exceeds ₹15,000 → max ₹1,800.
- **Employer EPF** uses the **contract's defined amount** (so 13% → ₹1,950 stays intact), but still:
  - Capped against a ₹15,000 wage base. If contract employer EPF > `13% × 15,000 = ₹1,950` we cap to that ceiling proportional to the contract's own employer rate (derived as `contractEmployerEPF / (contractGross − contractHRA)`).
  - **Not prorated** by attendance (treated as a fixed monthly statutory cost, matching what the contract page shows).
  - If `(earned Gross − earned HRA) ≤ 15,000`, employer share = `employerRate × (earned Gross − earned HRA)`.
  - If above ceiling, employer share = `employerRate × 15,000` (i.e. the contract's full ₹1,950).

This makes the MIS employer EPF column reconcile to the contract resource view.

### B. Make LWF a fixed (non-prorated) item

Extend `isFixedItem` so the regex matches LWF as well as Uniform:

```ts
const isFixedItem = (name: string) =>
  /\buniform\b/i.test(name) || /\blwf\b/i.test(name) || /labour\s*welfare/i.test(name);
```

Applies to both deductions (employee LWF) and employer contributions (employer LWF), so ₹12.50 stays ₹12.50 every month regardless of P-Days.

## Where it shows up (no UI changes needed)

- Payroll Compute Wages table
- Wage Register XLS
- Pay Sheet PDF
- MIS XLS
- Contract resources salary breakdown (already reads from the same engine via `computeWages`)

## Out of scope

- No DB / schema changes.
- ESI rules untouched.
- PT, Bonus, Gratuity untouched.
- Half-yearly LWF states (e.g. Karnataka ₹20 / 6 months) are not modeled here — flat monthly contract amount is treated as the source of truth.
