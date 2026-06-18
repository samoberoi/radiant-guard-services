// Global export helper.
//
// `downloadCsv` is kept as the public API for back-compat with existing call
// sites, but it no longer writes a CSV directly. Instead it opens a small
// chooser dialog (mounted once in __root.tsx) that lets the user pick
// between an Excel (.xlsx) or PDF download. The name is preserved so the
// many existing call sites continue to work without churn.

export type ExportColumn<T = Record<string, unknown>> = {
  key: keyof T | string;
  header: string;
};

export type ExportRequestPayload = {
  filename: string;
  rows: Array<Record<string, unknown>>;
  columns: ExportColumn[];
};

const EXPORT_EVENT = "lovable:export-request";

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (value instanceof Date) s = value.toISOString();
  else if (typeof value === "object") s = JSON.stringify(value);
  else s = String(value);
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Clean a value for tabular display: strip line breaks/tabs, collapse
// excessive whitespace so cells stay on a single line and do not look tangled.
function cleanText(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (value instanceof Date) s = value.toLocaleString("en-IN");
  else if (typeof value === "object") s = JSON.stringify(value);
  else s = String(value);
  return s.replace(/\s*[\r\n\t]+\s*/g, " ").replace(/[ ]{2,}/g, " ").trim();
}

function formatPlainCell(value: unknown): string {
  return cleanText(value);
}

function timestamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

function resolveColumns(
  rows: Array<Record<string, unknown>>,
  columns?: ExportColumn[],
): ExportColumn[] {
  if (columns && columns.length) return columns;
  if (!rows.length) return [];
  return Object.keys(rows[0]).map((k) => ({ key: k, header: k }));
}

function stripExtension(name: string): string {
  return name.replace(/\.(csv|xlsx|xls|pdf|json)$/i, "");
}

// Header keys that should ALWAYS be treated as text (identifiers, long
// numeric codes) — never coerced to Number, which would produce scientific
// notation like 1.23E+11 for account numbers / UAN / Aadhaar / phone, or
// drop leading zeros.
const TEXT_ID_RE = /account|a\/?c|ifsc|uan|\bpf\b|esi|esic|aadhaar|aadhar|\bpan\b|gst|phone|mobile|contact|whatsapp|pincode|pin\s*code|\bzip\b|employee\s*code|emp\s*code|\bcode\b|number|\bno\.?\b|\bid\b/i;

function isTextIdentifierHeader(header: string): boolean {
  return TEXT_ID_RE.test(header);
}

// A digit-only string that is long (>=8) or has a leading zero should be
// kept as text — otherwise Excel turns it into a number and strips leading
// zeros or shows it in scientific notation.
function looksLikeLongNumericId(s: string): boolean {
  const t = s.trim();
  if (!/^\d+$/.test(t)) return false;
  return t.length >= 8 || t.startsWith("0");
}

// Heuristic: a column is numeric if most non-empty cells parse as numbers.
function detectNumericColumns(
  rows: Array<Record<string, unknown>>,
  columns: ExportColumn[],
): boolean[] {
  return columns.map((c) => {
    if (isTextIdentifierHeader(String(c.header))) return false;
    let hits = 0;
    let total = 0;
    let longIds = 0;
    for (const r of rows) {
      const v = r[c.key as string];
      if (v === null || v === undefined || v === "") continue;
      total++;
      if (typeof v === "number") hits++;
      else if (typeof v === "string" && /^-?[\d,]+(\.\d+)?%?$/.test(v.trim())) {
        hits++;
        if (looksLikeLongNumericId(v)) longIds++;
      }
    }
    if (total > 0 && longIds / total > 0.3) return false;
    return total > 0 && hits / total > 0.6;
  });
}

// ---------------------------------------------------------------------------
// Writers (used by the chooser, or as a fallback)
// ---------------------------------------------------------------------------

export function writeCsv(payload: ExportRequestPayload) {
  const { filename, rows, columns } = payload;
  const head = columns.map((c) => escapeCsvCell(c.header)).join(",");
  const body = rows
    .map((r) => columns.map((c) => escapeCsvCell(r[c.key as string])).join(","))
    .join("\n");
  const csv = `\ufeff${head}\n${body}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, `${stripExtension(filename)}-${timestamp()}.csv`);
}

export async function writeXlsx(payload: ExportRequestPayload) {
  const { filename, rows, columns } = payload;
  const XLSX = await import("xlsx-js-style");
  const numericCols = detectNumericColumns(rows, columns);

  // Build the array-of-arrays, coercing numeric strings to numbers so Excel
  // right-aligns them and totals work correctly.
  const aoa: unknown[][] = [columns.map((c) => c.header)];
  const textCols = columns.map((c) => isTextIdentifierHeader(String(c.header)));
  for (const r of rows) {
    aoa.push(
      columns.map((c, idx) => {
        const v = r[c.key as string];
        if (v === null || v === undefined) return "";
        if (textCols[idx]) {
          // Always render identifier columns as raw text — preserves leading
          // zeros and prevents scientific notation on long digit strings.
          if (typeof v === "number") return String(v);
          return cleanText(v);
        }
        if (typeof v === "number" || typeof v === "boolean") return v;
        if (v instanceof Date) return v;
        if (typeof v === "object") return cleanText(v);
        const s = cleanText(v);
        // Long digit runs (account #, UAN, Aadhaar, phone) stay as text even
        // when the header didn't match the heuristic.
        if (looksLikeLongNumericId(s)) return s;
        if (numericCols[idx] && /^-?[\d,]+(\.\d+)?$/.test(s)) {
          const n = Number(s.replace(/,/g, ""));
          if (Number.isFinite(n)) return n;
        }
        return s;
      }),
    );
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Auto-fit column widths from max content length per column. Bumped cap
  // to 80 so 16-digit account numbers + IFSC + long names fit fully.
  const colWidths = columns.map((c, idx) => {
    let max = String(c.header ?? "").length;
    for (let r = 1; r < aoa.length; r++) {
      const cell = aoa[r][idx];
      const s = cell === null || cell === undefined ? "" : String(cell);
      if (s.length > max) max = s.length;
    }
    return { wch: Math.min(Math.max(max + 4, 14), 80) };
  });
  (ws as unknown as { ["!cols"]?: unknown })["!cols"] = colWidths;
  (ws as unknown as { ["!autofilter"]?: unknown })["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: Math.max(aoa.length - 1, 0), c: Math.max(columns.length - 1, 0) },
    }),
  };
  (ws as unknown as Record<string, unknown>)["!sheetView"] = { state: "frozen", ySplit: 1 };

  // Force identifier cells to text type with "@" format so Excel never
  // re-parses them as numbers.
  for (let r = 1; r < aoa.length; r++) {
    for (let c = 0; c < columns.length; c++) {
      if (!textCols[c]) continue;
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = (ws as Record<string, unknown>)[addr] as
        | { t?: string; v?: unknown; z?: string }
        | undefined;
      if (!cell) continue;
      cell.t = "s";
      cell.v = cell.v === null || cell.v === undefined ? "" : String(cell.v);
      cell.z = "@";
    }
  }

  const border = {
    top: { style: "thin", color: { rgb: "CBD5E1" } },
    bottom: { style: "thin", color: { rgb: "CBD5E1" } },
    left: { style: "thin", color: { rgb: "CBD5E1" } },
    right: { style: "thin", color: { rgb: "CBD5E1" } },
  };

  // Header row — dark navy fill + white bold text, with bgColor set so Excel
  // and LibreOffice both render the fill (some engines need both fg and bg).
  for (let c = 0; c < columns.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    const cell = (ws as Record<string, unknown>)[addr] as { s?: unknown } | undefined;
    if (cell) {
      cell.s = {
        font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
        fill: { patternType: "solid", fgColor: { rgb: "1E293B" }, bgColor: { rgb: "1E293B" } },
        alignment: { vertical: "center", horizontal: "left", wrapText: true },
        border,
      };
    }
  }

  // Body cells — explicit dark text + solid white/zebra fill so text is
  // always visible (previously some engines rendered white-on-white when the
  // fill pattern resolved to "none").
  for (let r = 1; r < aoa.length; r++) {
    const zebra = r % 2 === 0;
    const bg = zebra ? "F8FAFC" : "FFFFFF";
    for (let c = 0; c < columns.length; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = (ws as Record<string, unknown>)[addr] as { s?: unknown } | undefined;
      if (!cell) continue;
      cell.s = {
        font: { name: "Calibri", sz: 10, color: { rgb: "0F172A" } },
        alignment: { vertical: "center", horizontal: "left", wrapText: true },
        fill: { patternType: "solid", fgColor: { rgb: bg }, bgColor: { rgb: bg } },
        border,
      };
    }
  }

  // Taller header row so wrapped header text is fully visible.
  const longestHeader = columns.reduce((m, c) => Math.max(m, String(c.header ?? "").length), 0);
  const headerHeight = longestHeader > 18 ? 42 : 28;
  (ws as unknown as Record<string, unknown>)["!rows"] = aoa.map((_, i) =>
    i === 0 ? { hpt: headerHeight } : { hpt: 20 },
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, `${stripExtension(filename)}-${timestamp()}.xlsx`);
}

export async function writePdf(payload: ExportRequestPayload) {
  const { filename, rows, columns } = payload;
  const [jspdfMod, autotableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const jsPDF =
    (jspdfMod as { jsPDF?: typeof import("jspdf").jsPDF; default?: typeof import("jspdf").jsPDF }).jsPDF ??
    (jspdfMod as { default: typeof import("jspdf").jsPDF }).default;
  const autoTable =
    (autotableMod as { default?: (doc: unknown, opts: unknown) => void }).default ??
    (autotableMod as unknown as (doc: unknown, opts: unknown) => void);

  const numericCols = detectNumericColumns(rows, columns);
  const title = stripExtension(filename)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());

  // Per-column max content length (header + body), capped so a single huge
  // value doesn't blow up the page.
  const maxLens = columns.map((c) => {
    let m = cleanText(c.header).length;
    for (const r of rows) {
      const l = cleanText(r[c.key as string]).length;
      if (l > m) m = l;
    }
    return Math.min(m, 40);
  });
  // Per-column WIDEST single word in the header — this is the true minimum
  // width needed to avoid breaking header text character-by-character.
  const headerWordLens = columns.map((c) =>
    cleanText(c.header)
      .split(/\s+/)
      .reduce((m, w) => Math.max(m, w.length), 0),
  );

  // Pick font size + padding based on column count.
  const fontSize = columns.length > 22 ? 7 : columns.length > 16 ? 8 : columns.length > 10 ? 9 : 10;
  const cellPadding = columns.length > 16 ? 2.5 : columns.length > 10 ? 3.5 : 4.5;
  // Helvetica avg char ~0.5em; bold (header) ~0.55em.
  const charW = fontSize * 0.52;
  const padX = cellPadding * 2;

  // Desired width per column: enough to fit the widest header word AND a
  // reasonable amount of body content on one line.
  const desiredWidths = columns.map((_c, i) => {
    const headerMin = headerWordLens[i] * charW + padX;
    const contentTarget = Math.min(maxLens[i], 24) * charW + padX; // 24-char target line
    return Math.max(headerMin, contentTarget, 38);
  });

  const margin = 28;
  const neededW = desiredWidths.reduce((a, b) => a + b, 0) + margin * 2;

  // Decide paper format: pick the smallest landscape sheet whose usable
  // width >= neededW so columns don't get squeezed.
  const LANDSCAPE_FORMATS: Array<{ name: string; w: number }> = [
    { name: "a4", w: 842 },
    { name: "a3", w: 1191 },
    { name: "a2", w: 1684 },
    { name: "a1", w: 2384 },
    { name: "a0", w: 3370 },
  ];
  const orientation: "portrait" | "landscape" =
    columns.length > 6 || neededW > 560 ? "landscape" : "portrait";
  const format =
    orientation === "landscape"
      ? (LANDSCAPE_FORMATS.find((f) => f.w >= neededW)?.name ?? "a0")
      : "a4";

  const doc = new jsPDF({ orientation, unit: "pt", format });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const usableW = pageW - margin * 2;

  // Final per-column widths: start from desired, then scale to fit usableW
  // (scale up to use full page when there's slack, scale down only as a
  // last resort if we ran out of paper sizes).
  const desiredTotal = desiredWidths.reduce((a, b) => a + b, 0);
  const scale = usableW / desiredTotal;
  const colWidths = desiredWidths.map((w) => w * scale);

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(title, margin, margin + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Generated ${new Date().toLocaleString("en-IN")}  •  ${rows.length} row${rows.length === 1 ? "" : "s"}`,
    margin,
    margin + 20,
  );

  const columnStyles: Record<number, Record<string, unknown>> = {};
  columns.forEach((_c, i) => {
    columnStyles[i] = {
      cellWidth: colWidths[i],
      halign: "left",
      valign: "middle",
    };
  });

  autoTable(doc, {
    head: [columns.map((c) => cleanText(c.header))],
    body: rows.map((r) => columns.map((c) => cleanText(r[c.key as string]))),
    startY: margin + 32,
    margin: { left: margin, right: margin, top: margin + 32, bottom: margin + 16 },
    tableWidth: usableW,
    styles: {
      font: "helvetica",
      fontSize,
      cellPadding,
      overflow: "linebreak",
      valign: "middle",
      halign: "left",
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
      textColor: [15, 23, 42],
      minCellHeight: fontSize + 6,
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "left",
      valign: "middle",
      lineColor: [30, 41, 59],
      overflow: "linebreak",
      cellPadding: { top: cellPadding + 1, bottom: cellPadding + 1, left: cellPadding, right: cellPadding },
    },
    bodyStyles: { halign: "left", valign: "middle" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles,
    showHead: "everyPage",

    didDrawPage: () => {
      const page = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(`Page ${page}`, pageW - margin, pageH - 8, { align: "right" });
      doc.setTextColor(0);
    },
  });

  // Silence unused-var lint for numericCols (kept for future right-align).
  void numericCols;

  doc.save(`${stripExtension(filename)}-${timestamp()}.pdf`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Public API — opens the chooser
// ---------------------------------------------------------------------------

export function downloadCsv<T extends Record<string, unknown>>(
  filename: string,
  rows: T[],
  columns?: { key: keyof T | string; header: string }[],
) {
  const payload: ExportRequestPayload = {
    filename,
    rows: rows as Array<Record<string, unknown>>,
    columns: resolveColumns(rows as Array<Record<string, unknown>>, columns as ExportColumn[] | undefined),
  };
  if (typeof window === "undefined") {
    writeCsv(payload);
    return;
  }
  const w = window as unknown as { __lovableExportChooserMounted?: boolean };
  if (!w.__lovableExportChooserMounted) {
    writeCsv(payload);
    return;
  }
  window.dispatchEvent(new CustomEvent<ExportRequestPayload>(EXPORT_EVENT, { detail: payload }));
}

export const EXPORT_REQUEST_EVENT = EXPORT_EVENT;

// ---------------------------------------------------------------------------
// Existing tiny helpers kept for compatibility
// ---------------------------------------------------------------------------

export function csvJoin(parts: Array<unknown>, separator = ", "): string {
  return parts
    .map((part) => {
      if (part === null || part === undefined) return "";
      return String(part).trim();
    })
    .filter(Boolean)
    .join(separator);
}

export function csvYesNo(value: boolean | null | undefined): string {
  return value ? "Yes" : "No";
}

export function csvDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(value);
  }
}

export function csvStatus(value: string | null | undefined): string {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function csvMapLink(
  latitude: number | string | null | undefined,
  longitude: number | string | null | undefined,
): string {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
    return "";
  }
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}
