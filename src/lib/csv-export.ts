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
        alignment: { vertical: "center", horizontal: "left", wrapText: false },
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
      const isNum = numericCols[c];
      cell.s = {
        font: { name: "Calibri", sz: 10, color: { rgb: "0F172A" } },
        alignment: {
          vertical: "center",
          horizontal: isNum ? "right" : "left",
          wrapText: false,
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
    i === 0 ? { hpt: 22 } : { hpt: 18 },
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, `${stripExtension(filename)}-${timestamp()}.xlsx`);
}

export async function writePdf(payload: ExportRequestPayload) {
  const { filename, rows, columns } = payload;
  const [jspdfMod, html2canvasMod] = await Promise.all([
    import("jspdf"),
    import("html2canvas-pro"),
  ]);
  const jsPDF = (jspdfMod as { jsPDF?: typeof import("jspdf").jsPDF; default?: typeof import("jspdf").jsPDF }).jsPDF
    ?? (jspdfMod as { default: typeof import("jspdf").jsPDF }).default;
  const html2canvas = (html2canvasMod as { default: typeof import("html2canvas-pro").default }).default;

  const numericCols = detectNumericColumns(rows, columns);
  const title = stripExtension(filename)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());

  // Build an off-screen container with a styled HTML table. Rendering to a
  // canvas guarantees the PDF shows EXACTLY what the table looks like — no
  // missing rows, no autotable layout quirks, no font-embedding surprises.
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-100000px";
  container.style.top = "0";
  container.style.background = "#ffffff";
  container.style.padding = "24px";
  container.style.fontFamily = "Arial, Helvetica, sans-serif";
  container.style.color = "#0f172a";
  container.style.width = "max-content";

  const titleEl = document.createElement("div");
  titleEl.style.fontSize = "18px";
  titleEl.style.fontWeight = "700";
  titleEl.style.marginBottom = "4px";
  titleEl.textContent = title;
  container.appendChild(titleEl);

  const metaEl = document.createElement("div");
  metaEl.style.fontSize = "11px";
  metaEl.style.color = "#64748b";
  metaEl.style.marginBottom = "12px";
  metaEl.textContent = `Generated ${new Date().toLocaleString("en-IN")}  •  ${rows.length} row${rows.length === 1 ? "" : "s"}`;
  container.appendChild(metaEl);

  const table = document.createElement("table");
  table.style.borderCollapse = "collapse";
  table.style.background = "#ffffff";
  table.style.fontSize =
    columns.length > 18 ? "9px" : columns.length > 12 ? "10px" : "11px";

  const thead = document.createElement("thead");
  const headTr = document.createElement("tr");
  columns.forEach((c) => {
    const th = document.createElement("th");
    th.textContent = cleanText(c.header);
    th.style.background = "#1e293b";
    th.style.color = "#ffffff";
    th.style.fontWeight = "700";
    th.style.textAlign = "left";
    th.style.padding = "8px 10px";
    th.style.border = "1px solid #1e293b";
    th.style.whiteSpace = "nowrap";
    headTr.appendChild(th);
  });
  thead.appendChild(headTr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((r, ri) => {
    const tr = document.createElement("tr");
    tr.style.background = ri % 2 === 0 ? "#ffffff" : "#f8fafc";
    columns.forEach((c, ci) => {
      const td = document.createElement("td");
      td.textContent = cleanText(r[c.key as string]);
      td.style.padding = "6px 10px";
      td.style.border = "1px solid #e2e8f0";
      td.style.textAlign = numericCols[ci] ? "right" : "left";
      td.style.whiteSpace = "nowrap";
      td.style.color = "#0f172a";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      logging: false,
    });

    // Pick orientation based on aspect ratio so wide tables become landscape.
    const isWide = canvas.width > canvas.height;
    const orientation: "portrait" | "landscape" = isWide ? "landscape" : "portrait";
    const pageW = orientation === "landscape" ? 842 : 595; // A4 pts
    const pageH = orientation === "landscape" ? 595 : 842;
    const margin = 24;
    const usableW = pageW - margin * 2;
    const usableH = pageH - margin * 2;

    const doc = new jsPDF({ orientation, unit: "pt", format: "a4" });
    const imgWidthPt = usableW;
    const pxPerPt = canvas.width / imgWidthPt;
    const pageSliceHeightPx = Math.floor(usableH * pxPerPt);

    let renderedPx = 0;
    let page = 0;
    while (renderedPx < canvas.height) {
      const sliceHeightPx = Math.min(pageSliceHeightPx, canvas.height - renderedPx);
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeightPx;
      const ctx = sliceCanvas.getContext("2d");
      if (!ctx) break;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(
        canvas,
        0,
        renderedPx,
        canvas.width,
        sliceHeightPx,
        0,
        0,
        canvas.width,
        sliceHeightPx,
      );
      const sliceHeightPt = sliceHeightPx / pxPerPt;
      if (page > 0) doc.addPage("a4", orientation);
      doc.addImage(
        sliceCanvas.toDataURL("image/jpeg", 0.92),
        "JPEG",
        margin,
        margin,
        imgWidthPt,
        sliceHeightPt,
      );
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Page ${page + 1}`, pageW - margin, pageH - 10, { align: "right" });
      doc.setTextColor(0);
      renderedPx += sliceHeightPx;
      page++;
    }

    doc.save(`${stripExtension(filename)}-${timestamp()}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
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
