// Generic client-side advanced filter system.
// Lets any list page expose a "build any query" UI: pick a column, an operator,
// a value, and AND-chain as many conditions as needed.

export type FieldType = "text" | "number" | "date" | "boolean" | "enum";

export type FilterField = {
  key: string;
  label: string;
  type: FieldType;
  options?: string[]; // for enum
  // optional accessor when row value isn't simply row[key]
  accessor?: (row: Record<string, unknown>) => unknown;
};

export type Op =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "in"
  | "not_in"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "is_empty"
  | "not_empty"
  | "is_true"
  | "is_false";

export type FilterCondition = {
  id: string;
  field: string;
  op: Op;
  value: string;
  value2?: string; // for "between"
};

export const OPS_BY_TYPE: Record<FieldType, Op[]> = {
  text: ["contains", "not_contains", "eq", "neq", "starts_with", "ends_with", "in", "not_in", "is_empty", "not_empty"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "between", "in", "not_in", "is_empty", "not_empty"],
  date: ["eq", "neq", "gt", "gte", "lt", "lte", "between", "is_empty", "not_empty"],
  boolean: ["is_true", "is_false"],
  enum: ["eq", "neq", "in", "not_in", "is_empty", "not_empty"],
};

export const OP_LABEL: Record<Op, string> = {
  eq: "equals",
  neq: "not equals",
  contains: "contains",
  not_contains: "does not contain",
  starts_with: "starts with",
  ends_with: "ends with",
  in: "is one of",
  not_in: "is not one of",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  between: "between",
  is_empty: "is empty",
  not_empty: "is not empty",
  is_true: "is true",
  is_false: "is false",
};

export function newCondition(field: string, type: FieldType): FilterCondition {
  const ops = OPS_BY_TYPE[type];
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    field,
    op: ops[0],
    value: "",
  };
}

function readValue(row: Record<string, unknown>, field: FilterField): unknown {
  return field.accessor ? field.accessor(row) : row[field.key];
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toDate(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : null;
}

function toStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function evalCondition(row: Record<string, unknown>, field: FilterField, c: FilterCondition): boolean {
  const raw = readValue(row, field);

  if (c.op === "is_empty") return raw === null || raw === undefined || raw === "";
  if (c.op === "not_empty") return !(raw === null || raw === undefined || raw === "");
  if (c.op === "is_true") return Boolean(raw) === true;
  if (c.op === "is_false") return Boolean(raw) === false;

  if (field.type === "number") {
    const n = toNum(raw);
    if (n === null) return false;
    if (c.op === "between") {
      const a = toNum(c.value);
      const b = toNum(c.value2);
      if (a === null || b === null) return true;
      return n >= Math.min(a, b) && n <= Math.max(a, b);
    }
    if (c.op === "in" || c.op === "not_in") {
      const list = c.value.split(",").map((s) => toNum(s.trim())).filter((x): x is number => x !== null);
      const has = list.includes(n);
      return c.op === "in" ? has : !has;
    }
    const t = toNum(c.value);
    if (t === null) return true;
    switch (c.op) {
      case "eq": return n === t;
      case "neq": return n !== t;
      case "gt": return n > t;
      case "gte": return n >= t;
      case "lt": return n < t;
      case "lte": return n <= t;
    }
  }

  if (field.type === "date") {
    const n = toDate(raw);
    if (n === null) return false;
    if (c.op === "between") {
      const a = toDate(c.value);
      const b = toDate(c.value2);
      if (a === null || b === null) return true;
      return n >= Math.min(a, b) && n <= Math.max(a, b);
    }
    const t = toDate(c.value);
    if (t === null) return true;
    switch (c.op) {
      case "eq": return new Date(n).toDateString() === new Date(t).toDateString();
      case "neq": return new Date(n).toDateString() !== new Date(t).toDateString();
      case "gt": return n > t;
      case "gte": return n >= t;
      case "lt": return n < t;
      case "lte": return n <= t;
    }
  }

  // text / enum
  const s = toStr(raw).toLowerCase();
  const v = c.value.toLowerCase();
  if (c.op === "in" || c.op === "not_in") {
    const list = c.value.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
    const has = list.includes(s);
    return c.op === "in" ? has : !has;
  }
  switch (c.op) {
    case "eq": return s === v;
    case "neq": return s !== v;
    case "contains": return s.includes(v);
    case "not_contains": return !s.includes(v);
    case "starts_with": return s.startsWith(v);
    case "ends_with": return s.endsWith(v);
  }
  return true;
}

export function applyFilters<T extends Record<string, unknown>>(
  rows: T[],
  fields: FilterField[],
  conditions: FilterCondition[],
): T[] {
  if (conditions.length === 0) return rows;
  return rows.filter((row) =>
    conditions.every((c) => {
      const fd = fields.find((f) => f.key === c.field);
      if (!fd) return true;
      return evalCondition(row as Record<string, unknown>, fd, c);
    }),
  );
}

export function describeCondition(fields: FilterField[], c: FilterCondition): string {
  const fd = fields.find((f) => f.key === c.field);
  const label = fd?.label ?? c.field;
  const opl = OP_LABEL[c.op];
  if (c.op === "is_empty" || c.op === "not_empty" || c.op === "is_true" || c.op === "is_false") {
    return `${label} ${opl}`;
  }
  if (c.op === "between") return `${label} ${opl} ${c.value || "…"} – ${c.value2 || "…"}`;
  return `${label} ${opl} ${c.value || "…"}`;
}
