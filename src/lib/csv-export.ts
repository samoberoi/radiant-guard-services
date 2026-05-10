// Tiny CSV export helper used by the customer admin screens.

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (value instanceof Date) s = value.toISOString();
  else if (typeof value === "object") s = JSON.stringify(value);
  else s = String(value);
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsv<T extends Record<string, unknown>>(
  filename: string,
  rows: T[],
  columns?: { key: keyof T | string; header: string }[],
) {
  const cols =
    columns ??
    (rows.length
      ? Object.keys(rows[0]).map((k) => ({ key: k, header: k }))
      : []);
  const head = cols.map((c) => escapeCell(c.header)).join(",");
  const body = rows
    .map((r) =>
      cols.map((c) => escapeCell((r as Record<string, unknown>)[c.key as string])).join(","),
    )
    .join("\n");
  const csv = `\ufeff${head}\n${body}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  a.href = url;
  a.download = filename.endsWith(".csv")
    ? filename
    : `${filename}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
