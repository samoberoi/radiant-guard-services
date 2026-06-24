# Platform Feature Inventory

A topic-and-bullet overview of every module currently shipped in the system.
Use this as the canonical reference for scope, demos, RBAC planning, and
onboarding new team members.

---

## 1. Candidates & Employees

End-to-end people lifecycle, from first contact to offboarding.

- **Candidate onboarding** — create candidate, capture personal / contact / KYC details, upload documents
- **Aadhaar verification** — OCR-based Aadhaar capture and field auto-fill
- **Document management** — PAN, Aadhaar, bank proof, photo, police verification, ex-service records
- **Designation, branch & unit assignment** — map candidate to org hierarchy
- **Approval workflow** — submit → approve → convert to employee
- **Employee directory** — searchable list with advanced filters (branch, unit, designation, status)
- **Profile edit & history** — update master data with audit trail
- **Offboarding** — reason capture (resignation / termination / absconding / death), exit date, final settlement flag
- **Languages, ex-service rank, family / nominee details**

## 2. Contracts

Client contract lifecycle.

- **Client contracts** — create, edit, version
- **Service-line configuration** — designations, rates, billing type, allowances per contract
- **Document upload & e-sign** — signature pad and signed-document storage
- **Approval workflow** — draft → pending → approved
- **Linked units & deployment** — tie contract lines to specific units

## 3. Organizations

Multi-level customer hierarchy.

- **State Manager** — master list of operating states
- **Branch Manager** — internal branches with regional scoping
- **Organization (Customer) Manager** — client companies with GSTIN, PAN, billing address
- **Unit Manager** — customer sites/units, service mix, deployed headcount

## 4. Vehicles

Fleet management.

- **Vehicle inventory** — register vehicles, ownership, assignment
- **FastTag manager** — tag numbers, balances, linkage
- **Insurance manager** — policy details, expiry tracking
- **PUC manager** — pollution certificates with expiry
- **Service manager** — service logs and schedules
- **Expense manager** — fuel, tolls, repairs
- **Insight lab** — analytics on fleet usage and cost

## 5. Assets

Company-issued and fixed assets.

- **Asset inventory** — register assets, assign to employees/units
- **Loan manager** — asset loans and recovery
- **Expense manager** — asset-related cost tracking
- **Asset master** — categories (Uniform, ID Card, Laptop, SIM, etc.)

## 6. Inventory

Stores and consumables.

- **Products (Item master)** — items with sizes, categories, UoM
- **Vendors** — vendor master with GSTIN, contact, payment terms
- **Vendor rate cards** — item-wise negotiated rates per vendor
- **Warehouses** — physical stock locations
- **Purchase Orders** — create, approve, print PDF
- **Delivery Challans (Goods Receipts)** — receive against PO, invoice number, invoice upload
- **Demands** — unit-level requisitions with requester tracking
- **Transfers** — warehouse-to-warehouse or warehouse-to-unit movement
- **Issuances** — issue stock to employees/units
- **Stock report** — current on-hand by warehouse
- **Stock ledger** — chronological movement history
- **My Inventory** — unit user view of own stock
- **Inventory dashboard** — KPIs, low-stock alerts, in-transit visibility

## 7. Attendance

Daily attendance capture and approval.

- **Period selection** — payroll-month aware, per-unit
- **Daily grid entry** — per-candidate, per-designation, per-date
- **Attendance codes** — P, A, L, HD, WO, CL, SL and custom codes
- **OCR import** — upload attendance sheets for auto-parse
- **Sheet header** — status, approver, submission timestamps
- **Approval workflow** — draft → submitted → approved
- **Unit listing** — pick unit then drill into its sheet

## 8. Payroll

Salary processing built on approved attendance.

- **Per-unit payroll sheet** — generate from attendance + contract rates
- **Additions** — bonus, incentive, paid holidays (configurable types)
- **Deductions** — advances, uniform, fines (configurable types)
- **Cost components** — EPF, ESI, Bonus, Gratuity, LWF auto-calculated
- **Statutory lookups** — Professional Tax and LWF by state
- **Payroll manager** — windows and salary day
- **Payroll-days basis** — actual / fixed 26 / actual-minus-Sundays
- **Approval workflow** — draft → approved → locked

## 9. Invoice

Customer billing from approved payroll/attendance.

- **Per-unit invoice generation** — pulls from approved attendance + contract
- **Billing types** — Man-Hours, Man-Days, Man-Months, Special
- **Tax handling** — CGST/SGST/IGST per customer state
- **Approval workflow** — draft → approved
- **Invoice listing & search** — filter by unit, period, status

## 10. Dashboards

- **Admin dashboard** — cross-module KPIs
- **Field dashboard** — operations / field-team view
- **Inventory dashboard** — stock health

## 11. Control Center (Configuration Masters)

Platform-wide statutory and configuration settings.

- **Professional Tax Manager** — state-wise PT slabs
- **Labour Welfare Fund (LWF) Manager** — state-wise LWF rules
- **Duty Manager** — duty types (8 hr, 12 hr, etc.)
- **Attendance Code Manager** — P / A / L / HD / WO / CL / SL and custom codes
- **Service Type Manager** — Security, Manpower, Facility, Staff
- **Payroll Manager** — payroll window + processing day
- **Payroll Days Manager** — salary day basis presets
- **Allowance Manager** — earning components
- **Addition Type Manager** — bonus/incentive/paid-holiday categories
- **Deduction Type Manager** — advance/uniform/fine categories
- **Billing Type Manager** — Man-Hours / Man-Days / Man-Months / Special
- **Designation Manager** — employee designations
- **Cost Component Manager** — EPF, ESI, Bonus, Gratuity, LWF setup
- **Ex-Service Manager** — ranks across Army, Navy, Air Force, CAPF
- **Offboarding Reason Manager** — Resignation, Termination, Absconding, Death
- **ESIC Branch Manager** — ESIC branch codes by zone
- **Asset Manager** — Uniform, ID Card, Laptop, SIM master
- **Language Manager** — languages used in employee profiles
- **Company Documents** — NDA & Appointment Letter templates
- **System Logs** — activity audit across all modules (filtered, CSV export)

## 12. Notification Center

- **In-app bell** — unread badge and dropdown
- **Notifications page** — full history, mark read
- **Module-driven events** — approvals, exceptions, deadlines

## 13. Role-Based Access Control (RBAC)

- **Roles & module/sub-module registry** — single source in `rbac-modules.ts`
- **Permissions** — view / edit / delete / approve per module
- **Approval-capable modules** — Contracts, Attendance, Payroll, Invoice
- **Branch-scoped visibility** — users see only their branch's data
- **Super-admin bypass**

## 14. Cross-Cutting Capabilities

Available across every module above.

- **Activity logging** — every create / update / enable / disable / delete recorded
- **CSV export** — on listings and System Logs (filtered rows)
- **Advanced filters & sorting** — reusable filter and sortable header components
- **Delete guard** — confirmation on destructive actions
- **Document upload & signed-URL storage**
- **Auth** — Lovable Cloud auth with managed sessions, Google OAuth ready
- **Audit trail metadata** — created_by, updated_by, timestamps on all entities
