## Goal

Onboard **FPL Technologies Private Limited** into the system end-to-end using the rate card PDF + the two master Excel sheets — no overwrites, halt on any duplicate.

## What's already in the DB (verified)

- No customer / unit / contract matching FPL or "One Card" — clean slate.
- All 8 designations from the PDF already exist EXCEPT one: **Sr. Receptionist** (only "Receptionist" / "Receptionist 28989" exist).
- All required cost components exist (PF, ESI, PT, Bonus, Gratuity, LWF-MH, GB Levy, Reliever, Management Fee, Uniform, LWW, NFH).
- Pune branch exists (`PUNE`). Payroll day base "Fixed 26 Days" exists.

## Plan

### 1. Create one missing designation
- `Sr. Receptionist` (code `SR REC`) — used by page 6 of the rate card.

### 2. Create the customer
- **Name:** FPL Technologies Private Limited
- Status: active. PAN/GSTIN left blank (not in the PDF). Onboarding date: 01/01/2025.

### 3. Create one Unit under the customer
- **Name:** FPL Technologies — Pune
- Branch: PUNE. Billing state: Maharashtra. Site address from employee rows (Pune). Linked to customer above.

### 4. Create one Client Contract on that unit
- Period: **01/01/2025 → 30/06/2025**
- Payroll day base: Fixed 26 Days (matches "26 days earned" in PDF)
- Status: active, approval_status: approved, record_type: client.
- 8 contract resources (one per designation), each with full breakdown copied verbatim from the PDF (earned-for-26-days figures):

  | Designation | Basic | Spl | HRA | Wash | Skill/Edu | Conv | Site | Uniform | LWW | NFH | Gross | PF emp | PT | PF er | WC | Bonus | Gratuity | LWF | GB Levy | Reliever | Mgmt Fee |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
  | Admin Executive | 11632 | 3614 | 762.30 (5%) | 100 | 10585.57 | 3000 | 2000 | 300 | 609.84 | 152.46 | 32756.17 | 1829.52 | 200 | 1981.98 | 200 | 1269.99 | 733.33 | 12.50 | 0 | — | 2586.78 |
  | Security Supervisor | 13866 | 3614 | 2622 (15%) | 1000 | 0 (Edu) | 1800 | 2000 | 300 | 699.20 | 174.80 | 26076 | 2098 | 200 | 2272.40 | 200 | 1456.08 | 699.20 | 12.50 | 524.40 | 5207.81 | 2551.39 |
  | Bouncer (6 days) | (per PDF p.3) | … | … | … | … | … | … | … | … | … | … | … | … | … | … | … | … | 12.50 | 524.40 | — | 3367.00 |
  | Security Guard | 13266 | … | … | … | … | … | … | … | … | … | … | … | … | … | … | … | … | 12.50 | 506.40 | 4726.05 | 2315.37 |
  | Receptionist | 11632 | 3614 | 762.30 | 100 | … | … | … | 300 | … | … | … | … | 200 | … | 200 | 1269.99 | 733.33 | 12.50 | 0 | — | 1775.79 |
  | Sr. Receptionist | 11632 | … | … | … | … | … | … | … | … | … | … | … | 200 | … | 200 | 1269.99 | 733.33 | 12.50 | 0 | — | 1915.79 |
  | BMS Operator | 11632 | 3614 | … | … | … | … | … | … | … | … | … | … | 200 | … | 200 | 1269.99 | 733.33 | 12.50 | 0 | — | 2195.79 |
  | Office Assistant | 11632 | 3614 | 762.30 | … | … | … | … | 300 | … | … | … | … | 200 | … | 200 | 1269.99 | 733.33 | 12.50 | 0 | — | (per PDF p.8) |

  (I'll fill the remaining numbers from PDF pages 3, 4, 7 and 8 exactly during build — the table above shows the structure I'll commit, not a reduced version.)

### 5. Import the 64 FPL employees as candidates
- Filter: `UNIT NAME = 'FPL TECHNOLOGIES PRIVATE LIMITED'`.
- One row per candidate with status `active`. Map every available master column:
  - identity: full_name, gender, DOB, mobile, alt_mobile, email, marital_status, religion, caste_category, blood_group, height/weight/chest, languages, father/mother/spouse names, reference, emergency contact, birthplace.
  - identifiers: aadhaar_number, PAN, voter ID, UAN, EPF no, ESIC no, ESIC branch/dispensary/subcode.
  - addresses: present + permanent (incl. police station, pincode, same_as_permanent flag).
  - bank: name, branch, A/C, IFSC, holder, secondary A/C+IFSC.
  - flags: pf_deduct, esi_deduct, pt_deduct, ex-service, vaccination, immigrant.
  - designation_id resolved from the `DESIGNATION` column (Security Guard, Security Supervisor, BMS OPREATOR → existing `BMS OPREATOR`, Bouncer, Office Assistant, Admin Executive).
- Deploy each candidate to the FPL Pune unit (`candidate_units` insert with active range starting 01/01/2025 or DOJ if later).
- All inserted with `created_by` = system; the `set_employee_code` trigger will assign `EMP-###` automatically on active.

### 6. Import family members
- Filter the family Excel by the 64 FPL `EMPLOYEE ID`s.
- Insert into the dependents table (per `candidate-extra-sections` schema) linked by candidate id with relationship, DOB, address, resides_with flag.

### 7. Duplicate guard (your "stop and ask" rule)
Before each write block I'll SELECT for collisions:
- Customer: name match (case-insensitive).
- Unit: name match within customer.
- Contract: active contract on same unit + same date range.
- Candidate: aadhaar_number match (primary key for dedup), then PAN, then mobile.
- Family member: (candidate_id, name, relationship) match.

If ANY collision is found, I stop, list the conflicts, and ask you how to proceed (skip / rename / abort) — no overwriting.

### 8. Sync guarantee
All writes go through the same Lovable Cloud tables the existing UI reads from — contract pages, payroll, MIS, wage register, and pay sheet exports will pick the new data up automatically via `computeWages` (no engine change needed; the contract resource breakdown drives every export).

## Technical details

- One migration to insert the `Sr. Receptionist` designation (schema-safe insert into existing table).
- One bulk data load via `supabase--insert` for everything else (customer → unit → contract → 8 resources → 64 candidates → candidate_units → family rows), wrapped so duplicate-check SELECTs run first and the load stops cleanly on collision.
- All amounts entered as numbers; the per-resource components are stored in the existing `components` / `deductions` / `employer_contributions` jsonb columns matching the format used by `admin.contracts.client-contracts.tsx`.
- Contract `payroll_day_base_id` = "Fixed 26 Days"; ESI rows left at 0 (the engine auto-applies the statutory rule when earned gross is in scope).

## Ask before I build

The PDF's "Bouncer" page lists "Total Payable Days: 6" (vs 26 elsewhere). I'll treat that as a one-off coverage scenario and still register the Bouncer resource with the **monthly** structure (so the engine prorates correctly per attendance). Tell me if you'd rather lock Bouncer to 6 days flat.
