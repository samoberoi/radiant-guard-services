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

// Heuristic: a column is numeric if most non-empty cells parse as numbers.
function detectNumericColumns(
  rows: Array<Record<string, unknown>>,
  columns: ExportColumn[],
): boolean[] {
  return columns.map((c) => {
    let hits = 0;
    let total = 0;
    for (const r of rows) {
      const v = r[c.key as string];
      if (v === null || v === undefined || v === "") continue;
      total++;
      if (typeof v === "number") hits++;
      else if (typeof v === "string" && /^-?[\d,]+(\.\d+)?%?$/.test(v.trim())) hits++;
    }
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
  for (const r of rows) {
    aoa.push(
      columns.map((c, idx) => {
        const v = r[c.key as string];
        if (v === null || v === undefined) return "";
        if (typeof v === "number" || typeof v === "boolean") return v;
        if (v instanceof Date) return v;
        if (typeof v === "object") return cleanText(v);
        const s = cleanText(v);
        if (numericCols[idx] && /^-?[\d,]+(\.\d+)?$/.test(s)) {
          const n = Number(s.replace(/,/g, ""));
          if (Number.isFinite(n)) return n;
        }
        return s;
      }),
    );
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Auto-fit column widths from max content length per column.
  const colWidths = columns.map((c, idx) => {
    let max = String(c.header ?? "").length;
    for (let r = 1; r < aoa.length; r++) {
      const cell = aoa[r][idx];
      const s = cell === null || cell === undefined ? "" : String(cell);
      if (s.length > max) max = s.length;
    }
    // Min 12 for readability, max 50 to avoid runaway columns; +2 padding.
    return { wch: Math.min(Math.max(max + 2, 12), 50) };
  });
  (ws as unknown as { ["!cols"]?: unknown })["!cols"] = colWidths;
  (ws as unknown as { ["!freeze"]?: unknown })["!freeze"] = { xSplit: 0, ySplit: 1 };
  (ws as unknown as { ["!autofilter"]?: unknown })["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: Math.max(aoa.length - 1, 0), c: Math.max(columns.length - 1, 0) },
    }),
  };
  (ws as unknown as Record<string, unknown>)["!sheetView"] = { state: "frozen", ySplit: 1 };

  const border = {
    top: { style: "thin", color: { rgb: "E2E8F0" } },
    bottom: { style: "thin", color: { rgb: "E2E8F0" } },
    left: { style: "thin", color: { rgb: "E2E8F0" } },
    right: { style: "thin", color: { rgb: "E2E8F0" } },
  };

  // Style header row.
  for (let c = 0; c < columns.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    const cell = (ws as Record<string, unknown>)[addr] as { s?: unknown } | undefined;
    if (cell) {
      cell.s = {
        font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
        fill: { patternType: "solid", fgColor: { rgb: "1E293B" } },
        alignment: { vertical: "center", horizontal: "left", wrapText: true },
        border,
      };
    }
  }

  // Style body cells.
  for (let r = 1; r < aoa.length; r++) {
    const zebra = r % 2 === 0;
    for (let c = 0; c < columns.length; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = (ws as Record<string, unknown>)[addr] as { s?: unknown } | undefined;
      if (!cell) continue;
      cell.s = {
        font: { name: "Calibri", sz: 10, color: { rgb: "0F172A" } },
        alignment: {
          vertical: "center",
          horizontal: "left",
          wrapText: true,
        },
        fill: zebra
          ? { patternType: "solid", fgColor: { rgb: "F8FAFC" } }
          : { patternType: "none" },
        border,
      };
    }
  }

  // Standard row height for consistent look.
  (ws as unknown as Record<string, unknown>)["!rows"] = aoa.map((_, i) =>
    i === 0 ? { hpt: 24 } : { hpt: 20 },
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

  // Estimate max content width per column to decide orientation.
  const maxLens = columns.map((c) => {
    let m = cleanText(c.header).length;
    for (const r of rows) {
      const l = cleanText(r[c.key as string]).length;
      if (l > m) m = l;
    }
    return Math.min(m, 60); // cap to avoid one giant column blowing the layout
  });
  const totalLen = maxLens.reduce((a, b) => a + b, 0) || 1;
  // Wider tables → landscape. Many columns → also landscape.
  const orientation: "portrait" | "landscape" =
    columns.length > 6 || totalLen > 70 ? "landscape" : "portrait";

  const doc = new jsPDF({ orientation, unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 28;
  const usableW = pageW - margin * 2;

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

  // Compute proportional column widths from content length so wide cells get
  // proportionally more room. Enforce a small minimum so single-char columns
  // don't collapse, but never let the per-column minimum exceed what fits.
  const minColWidth = Math.min(
    Math.max(28, Math.min(60, usableW / columns.length)),
    Math.floor(usableW / columns.length),
  );
  let rawWidths = maxLens.map((l) => Math.max(minColWidth, (l / totalLen) * usableW));
  const sum = rawWidths.reduce((a, b) => a + b, 0);
  // Scale so total = usableW (autotable will use these as relative anyway).
  rawWidths = rawWidths.map((w) => (w / sum) * usableW);

  const fontSize = columns.length > 18 ? 7 : columns.length > 12 ? 8 : columns.length > 8 ? 9 : 10;
  const cellPadding = columns.length > 12 ? 2.5 : 4;

  const columnStyles: Record<number, Record<string, unknown>> = {};
  columns.forEach((_c, i) => {
    columnStyles[i] = {
      cellWidth: rawWidths[i],
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
      overflow: "linebreak", // wrap long cells onto multiple lines so data isn't truncated
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
    },
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
