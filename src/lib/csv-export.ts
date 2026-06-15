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

function formatPlainCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
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
  const XLSX = await import("xlsx");
  const aoa: unknown[][] = [columns.map((c) => c.header)];
  for (const r of rows) {
    aoa.push(
      columns.map((c) => {
        const v = r[c.key as string];
        if (v === null || v === undefined) return "";
        if (typeof v === "number" || typeof v === "boolean") return v;
        if (v instanceof Date) return v;
        if (typeof v === "object") return JSON.stringify(v);
        return String(v);
      }),
    );
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, `${stripExtension(filename)}-${timestamp()}.xlsx`);
}

export async function writePdf(payload: ExportRequestPayload) {
  const { filename, rows, columns } = payload;
  const [{ default: jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = (autoTableMod as { default: typeof import("jspdf-autotable").default }).default;
  const orientation = columns.length > 6 ? "landscape" : "portrait";
  const doc = new jsPDF({ orientation, unit: "pt", format: "a4" });
  doc.setFontSize(12);
  doc.text(stripExtension(filename), 40, 32);
  autoTable(doc, {
    startY: 48,
    head: [columns.map((c) => c.header)],
    body: rows.map((r) => columns.map((c) => formatPlainCell(r[c.key as string]))),
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    theme: "striped",
    margin: { left: 24, right: 24 },
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
  const event = new CustomEvent<ExportRequestPayload>(EXPORT_EVENT, { detail: payload });
  const dispatched = window.dispatchEvent(event);
  // If no listener consumed it (chooser not mounted), fall back to CSV.
  if (!dispatched) writeCsv(payload);
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
