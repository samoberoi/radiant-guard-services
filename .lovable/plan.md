Plan:

1. Upgrade the shared export engine
- Update the global export helper so every existing Export button benefits without changing each page individually.
- Normalize cell text before export: remove embedded line breaks/tabs, collapse excessive spaces, and keep values single-line so cells do not look tangled.
- Preserve numbers as numbers for spreadsheets so totals, dates, and amounts align correctly.

2. Fix XLS layout globally
- Generate cleaner Excel workbooks with a bold dark header row, frozen header, filters, consistent font, vertical centering, and no text wrapping.
- Auto-size columns from actual content with sensible min/max widths so long columns remain readable without causing messy wrapped rows.
- Right-align numeric/amount/date-like columns where appropriate and keep text columns left-aligned.
- Use stable row heights so exports look consistent and professional.

3. Fix PDF layout globally
- Rework the PDF table layout to use professional margins, compact but readable fonts, repeated headers, clean grid lines, alternating row fills, and page numbers.
- Detect wide tables like wage registers and use a wider landscape PDF page instead of squeezing many columns into unreadable widths.
- Apply column width and alignment rules so employee names, IDs, dates, amounts, and remarks remain visible and do not overlap.
- Keep long text single-line/ellipsized where needed instead of wrapping into broken table rows.

4. Review all export call sites
- Re-scan every `downloadCsv` usage across payroll, invoice, employees, inventory, vehicle, system logs, customer/admin managers, contracts, additions, and deductions.
- Confirm each call sends clean column headers and structured rows into the shared exporter.
- Only adjust individual pages if a specific export has unusually bad columns/data that cannot be solved globally.

5. Test and inspect generated files
- Create representative export payloads for narrow, medium, and very wide tables, including wage register and invoice-style data.
- Generate both XLS and PDF outputs from the same export code.
- Inspect XLS workbook dimensions/styles and visually inspect generated PDFs by rendering pages to images.
- Iterate until headers, rows, long text, and wide tables are readable and clean.

Technical notes:
- Most work will be in `src/lib/csv-export.ts`, because all export buttons already route through this shared helper.
- If the current spreadsheet library cannot reliably apply styles, I will switch the XLS writer to a style-capable workbook approach while keeping the existing user flow unchanged.
- I’ll also address the preview dynamic-import runtime issue if it blocks testing.