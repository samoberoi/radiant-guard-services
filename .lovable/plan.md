# HyperOps Portfolio PDF — Plan

A polished, multi-page PDF (`/mnt/documents/HyperOps_Portfolio.pdf`) presenting the security-guard operations platform as **HyperOps**, branded by **Hyper Revamp**. Generic, client-agnostic — no Radiant Guard naming anywhere.

## Brand & Design System
- **Identity**: Hyper Revamp logo (top-left) + small "HyperOps" wordmark on every page; footer with `hyperrevamp.com`, contact info pulled from the site.
- **Palette (Editorial Slate)**: `#FAFAFA` page, `#E5E5E5` rules/dividers, `#1A1A1A` text, `#6366F1` accent (used sparingly for module icons, dividers, callout numbers).
- **Type**: Inter/Helvetica family via ReportLab built-ins (Helvetica + Helvetica-Bold). Tight tracking on display, generous line height on body.
- **Grid**: 12-col, 0.6" margins, consistent 24px gutters. Page numbers bottom-right.

## Page Structure (≈14 pages)
1. **Cover** — Dark/light split, large "HyperOps" wordmark, tagline *"Security Operations, Reimagined."*, Hyper Revamp logo, year.
2. **Index / Contents** — numbered chapters.
3. **About HyperOps** — what it is, who it's for (security firms managing guards, units, payroll, inventory, vehicles).
4. **Problems We Solve** — 4-card grid (manual attendance, payroll errors, asset leakage, fragmented ops).
5. **Platform Overview** — architecture diagram (org → branches → units → guards) with icons.
6. **Module Map** — visual grid of all modules grouped: Workforce, Customers & Contracts, Attendance & Payroll, Inventory, Vehicles, Billing, Admin.
7–12. **Module Deep-Dives** (one page each, 2 modules per page where compact):
   - Dashboard & Control Center
   - Organizations / Customers / Branches / Units
   - Attendance (unit register, codes, OCR)
   - Payroll (allowances, deductions, PT/LWF/ESIC, payroll runs)
   - Inventory (PO → GRN → Transfer → Issuance → Write-off chain)
   - Vehicles (FASTag, insurance, PUC, service, expenses)
   - Billing & Invoicing
   - RBAC & System Logs
   
   Each page = icon + module name + 3-line description + bulleted features + a **mockup image**.
13. **Why Hyper Revamp** — capabilities (custom internal platforms, AI integrations, modern stack).
14. **Contact** — full-bleed accent, contact details + website + "Let's build yours."

## Mockups (per module)
Render real-looking app screenshots using HTML + Puppeteer/Playwright OR direct ReportLab vector mockups. Approach:
- Build a small **HTML/CSS mockup template** matching the actual app shell (sidebar with HyperOps logo + module name, top-bar, content area with cards/tables/KPIs).
- Inspect real routes (`admin.dashboard`, `admin.attendance.index`, `admin.payroll.index`, `admin.inventory.dashboard`, `admin.vehicles.tsx`, `admin.customers.tsx`, `admin.invoice.index`, `admin.rbac`, `admin.system-logs`) to mirror layout, columns, KPI tiles.
- Populate with **dummy data** (e.g., "Acme Facilities", "Unit 14 — Tech Park", guard names like "Rohit S.", numbers like ₹4,82,300).
- Replace branding: top-left = **HyperOps** wordmark only (no Radiant Guard, no client name).
- Render each HTML template to PNG at 1600px wide via headless Chromium, then embed in PDF inside a macOS-style window frame (rounded corners + soft shadow) for a premium product-shot look.

## Generation Pipeline
1. Fetch `hyperrevamp.com` for contact/about copy.
2. Save the Hyper Revamp logo from upload to `/tmp/hyperrevamp-logo.png`.
3. Write `/tmp/mockups/<module>.html` for each module screen.
4. Use Playwright (already-installed or `npx playwright`) to screenshot each to `/tmp/mockups/<module>.png`.
5. Frame each PNG with the product-shot script (window chrome + soft shadow on light gradient).
6. Build the PDF with **ReportLab Platypus** (multi-page flow, header/footer template that stamps logo + page number on every page).
7. QA: convert PDF → images via `pdftoppm`, view each page, check for overflow, contrast, alignment, missing branding, leftover Radiant Guard text. Iterate until clean.

## Deliverable
- `/mnt/documents/HyperOps_Portfolio.pdf` (final)
- Presented via `<presentation-artifact>` tag for download.

## Out of Scope
- No changes to the live app code.
- No real screenshots from the logged-in app (mockups will be visually identical but populated with dummy data, ensuring no client information leaks).
