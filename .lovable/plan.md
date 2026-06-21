## Goal

Take the uploaded `Employee_Master_Data` sheet (filtered to `UNIT NAME = FPL TECHNOLOGIES PRIVATE LIMITED`, 64 rows) and make sure every populated cell lands on the matching `candidates` row in the database. Existing non-empty values stay; only blanks get filled.

## What I already verified

- 64 FPL rows in the upload; 67 candidates currently on the FPL Pune unit (the 3 extras = Ankit Tyagi, Sumit Kumar Mahunta, Madan Mohan added during attendance import — they aren't in this sheet, so they're left untouched).
- Match key per row: `AADHAR NO` first, fall back to `EMPLOYEE ID` → `candidates.other_info->>'legacy_employee_id'` (added on initial import), then mobile.
- Most identity, bank, address, PF/ESIC fields are already filled (verified against a sample). Gaps are concentrated in: city/district, emergency contacts, blood group, education, birthplace, identification marks, secondary phone, agency-branch/zone tags, EPF number, ESIC subcode.

## Field map (Excel → candidate row)

Plain columns (only written if current DB value is null/empty):

| Excel column | DB target |
|---|---|
| PHONE | `mobile` |
| SECONDARY PHONE | `alt_mobile` |
| EMAIL / PERSONNEL EMAIL ID | `email` (personnel preferred if both) |
| GENDER, DOB, MARITAL STATUS, RELIGION, CATEGORY, BIRTH PLACE | `gender`, `date_of_birth`, `marital_status`, `religion`, `caste_category`, `birthplace` |
| LANGUAGES | `languages` (jsonb array, split on comma) |
| PRESENT/PERMANENT ADDRESS 1/2, CITY, DISTRICT, STATE, COUNTRY, PINCODE, POLICE STATION | matching `present_*` / `permanent_*` columns + `present_police_station` / `permanent_police_station` |
| AADHAR NO, PAN NO | `aadhaar_number`, `pan_number` |
| BANK NAME, BRANCH, A/C, IFSC, ACCOUNT HOLDER | `bank_name`, `bank_branch`, `bank_account_number`, `bank_ifsc`, `bank_account_holder` |
| EMERGENCY CONTACT NAME / NO / RELATIONSHIP | `emergency_contact_name` / `_mobile` / `_relation` |
| HEIGHT, WEIGHT, CHEST | `physical_health` jsonb (`height_cm`, `weight_kg`, `chest_cm`) |
| PF DEDUCT, UAN, EPF NO, ESI DEDUCT, ESIC NO, ESIC DISPENSARY, ESIC BRANCH, ESIC SUBCODE, PREVIOUS ESIC NO, PT DEDUCT | `compliance` jsonb (`pf_deduct`, `uan`, `epf_number`, `esi_deduct`, `esic_number`, `esic_dispensary`, `esic_branch`, `esic_subcode`, `previous_esic_number`, `pt_deduct`) |
| FATHER / MOTHER / SPOUSE NAME, REFERENCE NAME + ADDRESS 1/2 | `references` jsonb (add only missing relations) |

Fields that don't have a dedicated column go into `other_info` jsonb (merged, never overwritten):

`client_employee_id`, `zone_id`, `zone_name`, `agency_branch_id`, `agency_branch_name`, `unit_short_name`, `gross_salary_legacy`, `net_salary_legacy`, `is_verified`, `is_active_legacy`, `education_level`, `vaccination_status`, `blood_group`, `identification_mark_1`, `identification_mark_2`, `is_immigrant_worker`, `ex_service_man`, `details_of_service`, `driving_license_type`, `driving_license_number`, `voter_id`, `paycard_number`, `secondary_bank_account`, `secondary_bank_ifsc`, `accident_insurance_no`, `health_insurance_no`, `classification`, `created_by_legacy`, `created_at_legacy`, `legacy_employee_id`, `legacy_employee_candidate_id`.

Plus, if `EX-SERVICE MAN = YES`, set `is_ex_service = true` (only if currently null/false).

## Safety rules

1. **No overwrites.** For every column the update is `SET col = COALESCE(NULLIF(col,''), <excel>)`. For jsonb (`compliance`, `physical_health`, `other_info`, `references`, `languages`), I merge missing keys only — existing keys keep their current value.
2. **Match guard.** Skip a row if no candidate is found by aadhaar/legacy id/mobile, and report it back instead of creating a new candidate.
3. **No new candidates, no new units, no contract changes.** Only the existing 64 FPL candidate rows are touched.
4. **Activity log.** One `logActivity` entry per touched candidate ("FPL master refresh — filled N blank fields") so the System Logs page records the change.
5. **Dry-run summary first.** Before writing, I print a per-row diff (which fields will be filled). If nothing surprising, the same script does the writes in one transaction.

## Deliverable

- A migration-free data load via `supabase--insert` (UPDATEs only) that processes all 64 rows.
- A short report at the end: rows updated, fields filled per category, and any rows that couldn't be matched.

## Open question

The Excel `EMAIL` column is the system-generated `<empid>@radiantguards.com`; the `PERSONNEL EMAIL ID` column is the real personal email (mostly blank in this sheet). I'll prefer `PERSONNEL EMAIL ID` when present; otherwise keep the existing DB email. Tell me if you'd rather force the radiantguards.com address everywhere.
