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

export function csvJoin(
  parts: Array<unknown>,
  separator = ", ",
): string {
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
