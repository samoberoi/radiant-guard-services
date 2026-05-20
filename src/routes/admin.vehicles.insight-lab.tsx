import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  Download,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv } from "@/lib/csv-export";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/vehicles/insight-lab")({
  component: InsightLabPage,
});

/* ----------------------------- Schema metadata ---------------------------- */

type FieldType = "text" | "number" | "date" | "boolean";

type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  /** When this field is a foreign key to vehicles, hydrate to vehicle_number */
  vehicleRef?: boolean;
};

type DatasetDef = {
  key: string;
  label: string;
  table: string;
  description: string;
  fields: FieldDef[];
};

const VEHICLE_FIELDS: FieldDef[] = [
  { key: "vehicle_number", label: "Vehicle Number", type: "text" },
  { key: "name", label: "Name", type: "text" },
  { key: "brand", label: "Brand", type: "text" },
  { key: "make", label: "Make", type: "text" },
  { key: "type", label: "Type", type: "text" },
  { key: "fuel_type", label: "Fuel Type", type: "text" },
  { key: "owner", label: "Owner", type: "text" },
  { key: "color", label: "Color", type: "text" },
  { key: "year", label: "Year", type: "number" },
  { key: "registration_date", label: "Registration Date", type: "date" },
  { key: "enabled", label: "Enabled", type: "boolean" },
  { key: "created_at", label: "Created At", type: "date" },
];

const DATASETS: DatasetDef[] = [
  {
    key: "vehicles",
    label: "Vehicles",
    table: "vehicles",
    description: "Master fleet records.",
    fields: VEHICLE_FIELDS,
  },
  {
    key: "fuel",
    label: "Fuel Entries",
    table: "vehicle_fuel_entries",
    description: "Every refuel / top-up event.",
    fields: [
      { key: "vehicle_id", label: "Vehicle", type: "text", vehicleRef: true },
      { key: "entry_date", label: "Entry Date", type: "date" },
      { key: "fuel_type", label: "Fuel Type", type: "text" },
      { key: "payment_mode", label: "Payment Mode", type: "text" },
      { key: "amount", label: "Amount (₹)", type: "number" },
      { key: "quantity", label: "Quantity (L/kg)", type: "number" },
      { key: "rate", label: "Rate", type: "number" },
      { key: "odometer_km", label: "Odometer (km)", type: "number" },
      { key: "location_text", label: "Location", type: "text" },
      { key: "created_at", label: "Created At", type: "date" },
    ],
  },
  {
    key: "insurances",
    label: "Insurances",
    table: "vehicle_insurances",
    description: "Policy history per vehicle.",
    fields: [
      { key: "vehicle_id", label: "Vehicle", type: "text", vehicleRef: true },
      { key: "insurance_company", label: "Insurance Company", type: "text" },
      { key: "policy_number", label: "Policy Number", type: "text" },
      { key: "start_date", label: "Start Date", type: "date" },
      { key: "end_date", label: "End Date", type: "date" },
      { key: "premium_amount", label: "Premium (₹)", type: "number" },
      { key: "enabled", label: "Enabled", type: "boolean" },
    ],
  },
  {
    key: "pucs",
    label: "PUC Certificates",
    table: "vehicle_pucs",
    description: "Pollution-under-control certificate history.",
    fields: [
      { key: "vehicle_id", label: "Vehicle", type: "text", vehicleRef: true },
      { key: "issuing_authority", label: "Issuing Authority", type: "text" },
      { key: "issued_date", label: "Issued Date", type: "date" },
      { key: "expiry_date", label: "Expiry Date", type: "date" },
      { key: "enabled", label: "Enabled", type: "boolean" },
    ],
  },
  {
    key: "fastags",
    label: "FastTags",
    table: "vehicle_fastags",
    description: "FastTag accounts and balances.",
    fields: [
      { key: "vehicle_id", label: "Vehicle", type: "text", vehicleRef: true },
      { key: "bank_name", label: "Bank", type: "text" },
      { key: "balance", label: "Balance (₹)", type: "number" },
      { key: "status", label: "Status", type: "text" },
      { key: "issued_date", label: "Issued Date", type: "date" },
      { key: "expiry_date", label: "Expiry Date", type: "date" },
      { key: "enabled", label: "Enabled", type: "boolean" },
    ],
  },
];

/* -------------------------------- Operators ------------------------------- */

type Op =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte"
  | "contains" | "in" | "is_null" | "not_null";

const OPS_BY_TYPE: Record<FieldType, Op[]> = {
  text: ["eq", "neq", "contains", "in", "is_null", "not_null"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "is_null", "not_null"],
  date: ["eq", "gt", "gte", "lt", "lte", "is_null", "not_null"],
  boolean: ["eq", "neq"],
};

const OP_LABEL: Record<Op, string> = {
  eq: "equals",
  neq: "not equals",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  contains: "contains",
  in: "in (comma list)",
  is_null: "is empty",
  not_null: "is not empty",
};

type Filter = { id: string; field: string; op: Op; value: string };

type Aggregation = "count" | "sum" | "avg" | "min" | "max";

type DateBucket = "day" | "week" | "month" | "quarter" | "year";

type ChartKind = "bar" | "stackedBar" | "line" | "pie" | "table";

const PALETTE = [
  "hsl(220 70% 55%)",
  "hsl(35 92% 55%)",
  "hsl(150 65% 45%)",
  "hsl(265 70% 60%)",
  "hsl(200 80% 55%)",
  "hsl(0 75% 60%)",
  "hsl(45 85% 50%)",
  "hsl(180 60% 45%)",
  "hsl(310 65% 60%)",
  "hsl(95 55% 45%)",
];

/* ------------------------------ Page component ---------------------------- */

function InsightLabPage() {
  const [datasetKey, setDatasetKey] = useState<string>("fuel");
  const dataset = DATASETS.find((d) => d.key === datasetKey)!;

  const [xField, setXField] = useState<string>("entry_date");
  const [xBucket, setXBucket] = useState<DateBucket>("month");
  const [agg, setAgg] = useState<Aggregation>("sum");
  const [yField, setYField] = useState<string>("amount");
  const [seriesField, setSeriesField] = useState<string>("__none__");
  const [chart, setChart] = useState<ChartKind>("bar");
  const [filters, setFilters] = useState<Filter[]>([]);
  const [rowLimit, setRowLimit] = useState<number>(10000);

  // Reset axes when dataset changes
  const onDatasetChange = (k: string) => {
    setDatasetKey(k);
    const ds = DATASETS.find((d) => d.key === k)!;
    const dateField = ds.fields.find((f) => f.type === "date");
    const numField = ds.fields.find((f) => f.type === "number");
    setXField(dateField?.key ?? ds.fields[0].key);
    setYField(numField?.key ?? "");
    setAgg(numField ? "sum" : "count");
    setSeriesField("__none__");
    setFilters([]);
  };

  /* Vehicle lookup for foreign keys */
  const vehiclesQ = useQuery({
    queryKey: ["insight-lab", "vehicle-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles" as never)
        .select("id,vehicle_number");
      if (error) throw error;
      return (data as unknown as { id: string; vehicle_number: string }[]) ?? [];
    },
  });
  const vehMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vehiclesQ.data ?? []) m.set(v.id, v.vehicle_number);
    return m;
  }, [vehiclesQ.data]);

  /* Fetch dataset with filters */
  const dataQ = useQuery({
    queryKey: ["insight-lab", dataset.table, filters, rowLimit],
    queryFn: async () => {
      let q = supabase.from(dataset.table as never).select("*").limit(rowLimit);
      for (const f of filters) {
        if (!f.field) continue;
        const fd = dataset.fields.find((x) => x.key === f.field);
        if (!fd) continue;
        const v = f.value;
        const cast = castVal(v, fd.type);
        switch (f.op) {
          case "eq": if (cast !== null) q = q.eq(f.field, cast as never); break;
          case "neq": if (cast !== null) q = q.neq(f.field, cast as never); break;
          case "gt": if (cast !== null) q = q.gt(f.field, cast as never); break;
          case "gte": if (cast !== null) q = q.gte(f.field, cast as never); break;
          case "lt": if (cast !== null) q = q.lt(f.field, cast as never); break;
          case "lte": if (cast !== null) q = q.lte(f.field, cast as never); break;
          case "contains": q = q.ilike(f.field, `%${v}%`); break;
          case "in":
            q = q.in(
              f.field,
              v.split(",").map((s) => castVal(s.trim(), fd.type)).filter((x) => x !== null) as never,
            );
            break;
          case "is_null": q = q.is(f.field, null); break;
          case "not_null": q = q.not(f.field, "is", null); break;
        }
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as Record<string, unknown>[]) ?? [];
    },
  });

  const rows = dataQ.data ?? [];

  /* ----------------------------- Aggregation ----------------------------- */

  const aggregated = useMemo(() => {
    if (!xField) return { rows: [], seriesKeys: [] as string[] };
    const xDef = dataset.fields.find((f) => f.key === xField);
    const sDef = seriesField !== "__none__"
      ? dataset.fields.find((f) => f.key === seriesField)
      : undefined;

    type Bucket = { count: number; sum: number; min: number; max: number };
    const grouped = new Map<string, Map<string, Bucket>>(); // x -> series -> bucket

    for (const r of rows) {
      const xRaw = r[xField];
      const xKey = formatBucket(xRaw, xDef?.type ?? "text", xBucket, vehMap, !!xDef?.vehicleRef);
      if (xKey === null) continue;

      const sKey = sDef
        ? formatBucket(r[seriesField], sDef.type, "day", vehMap, !!sDef.vehicleRef) ?? "—"
        : "value";

      if (!grouped.has(xKey)) grouped.set(xKey, new Map());
      const inner = grouped.get(xKey)!;
      if (!inner.has(sKey)) inner.set(sKey, { count: 0, sum: 0, min: Infinity, max: -Infinity });
      const b = inner.get(sKey)!;
      const num = Number(r[yField]);
      b.count += 1;
      if (Number.isFinite(num)) {
        b.sum += num;
        if (num < b.min) b.min = num;
        if (num > b.max) b.max = num;
      }
    }

    const seriesSet = new Set<string>();
    for (const inner of grouped.values()) for (const k of inner.keys()) seriesSet.add(k);
    const seriesKeys = Array.from(seriesSet).sort();

    const out: Record<string, string | number>[] = [];
    const sortedX = Array.from(grouped.keys()).sort((a, b) => sortKeys(a, b, xDef?.type));
    for (const x of sortedX) {
      const row: Record<string, string | number> = { x };
      for (const s of seriesKeys) {
        const b = grouped.get(x)!.get(s);
        row[s] = b ? computeAgg(b, agg) : 0;
      }
      out.push(row);
    }
    return { rows: out, seriesKeys };
  }, [rows, xField, yField, agg, seriesField, xBucket, dataset.fields, vehMap]);

  /* ---------------------------------- UI --------------------------------- */

  const xDef = dataset.fields.find((f) => f.key === xField);
  const yNumericFields = dataset.fields.filter((f) => f.type === "number");

  const exportCsv = () => {
    const cols = [
      { key: "x", header: xField || "x" },
      ...aggregated.seriesKeys.map((s) => ({ key: s, header: s })),
    ];
    downloadCsv(`insight-lab-${dataset.key}`, aggregated.rows as never, cols);
  };

  return (
    <div>
      <PageHeader
        title="Insight Lab"
        description="Build any chart from the fleet data — pick a dataset, an X-axis, a measure, optional series, and filters."
        crumbs={[
          { label: "Vehicles", to: "/admin/vehicles" },
          { label: "Insight Lab" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Builder panel */}
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <div className="font-display text-sm font-bold tracking-tight">Report Builder</div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Dataset</Label>
            <Select value={datasetKey} onValueChange={onDatasetChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DATASETS.map((d) => (
                  <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">{dataset.description}</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">X-axis (group by)</Label>
            <Select value={xField} onValueChange={setXField}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {dataset.fields.map((f) => (
                  <SelectItem key={f.key} value={f.key}>
                    {f.label} <span className="text-muted-foreground">· {f.type}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {xDef?.type === "date" && (
              <Select value={xBucket} onValueChange={(v) => setXBucket(v as DateBucket)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["day", "week", "month", "quarter", "year"] as DateBucket[]).map((b) => (
                    <SelectItem key={b} value={b}>by {b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Y measure</Label>
              <Select value={agg} onValueChange={(v) => setAgg(v as Aggregation)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="count">Count</SelectItem>
                  <SelectItem value="sum">Sum</SelectItem>
                  <SelectItem value="avg">Average</SelectItem>
                  <SelectItem value="min">Min</SelectItem>
                  <SelectItem value="max">Max</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Of field</Label>
              <Select value={yField || "__count__"} onValueChange={(v) => setYField(v === "__count__" ? "" : v)} disabled={agg === "count"}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {agg === "count" && <SelectItem value="__count__">rows</SelectItem>}
                  {yNumericFields.map((f) => (
                    <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Series (split by, optional)</Label>
            <Select value={seriesField} onValueChange={setSeriesField}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— none —</SelectItem>
                {dataset.fields
                  .filter((f) => f.type === "text" || f.type === "boolean")
                  .map((f) => (
                    <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Chart type</Label>
            <Select value={chart} onValueChange={(v) => setChart(v as ChartKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bar">Bar (grouped)</SelectItem>
                <SelectItem value="stackedBar">Bar (stacked)</SelectItem>
                <SelectItem value="line">Line</SelectItem>
                <SelectItem value="pie">Pie (totals)</SelectItem>
                <SelectItem value="table">Table</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Row cap</Label>
            <Input
              type="number"
              min={100}
              max={50000}
              value={rowLimit}
              onChange={(e) => setRowLimit(Math.max(100, Math.min(50000, Number(e.target.value) || 10000)))}
            />
            <p className="text-[11px] text-muted-foreground">
              Loaded {rows.length.toLocaleString("en-IN")} rows.
            </p>
          </div>

          {/* Filters */}
          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Filters</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters((f) => [...f, { id: crypto.randomUUID(), field: dataset.fields[0].key, op: "eq", value: "" }])}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add
              </Button>
            </div>
            {filters.length === 0 && (
              <p className="text-[11px] text-muted-foreground">No filters — using all rows.</p>
            )}
            {filters.map((f) => {
              const fd = dataset.fields.find((x) => x.key === f.field);
              const ops = fd ? OPS_BY_TYPE[fd.type] : (["eq"] as Op[]);
              const showValue = f.op !== "is_null" && f.op !== "not_null";
              return (
                <div key={f.id} className="space-y-1.5 rounded-lg border border-border bg-background p-2">
                  <div className="grid grid-cols-[1fr_auto] gap-1.5">
                    <Select
                      value={f.field}
                      onValueChange={(v) => setFilters((arr) => arr.map((x) => x.id === f.id ? { ...x, field: v, op: "eq" } : x))}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {dataset.fields.map((f2) => (
                          <SelectItem key={f2.key} value={f2.key}>{f2.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFilters((arr) => arr.filter((x) => x.id !== f.id))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-[110px_1fr] gap-1.5">
                    <Select value={f.op} onValueChange={(v) => setFilters((arr) => arr.map((x) => x.id === f.id ? { ...x, op: v as Op } : x))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ops.map((o) => <SelectItem key={o} value={o}>{OP_LABEL[o]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {showValue && (
                      <Input
                        className="h-8 text-xs"
                        type={fd?.type === "date" ? "date" : fd?.type === "number" ? "number" : "text"}
                        value={f.value}
                        onChange={(e) => setFilters((arr) => arr.map((x) => x.id === f.id ? { ...x, value: e.target.value } : x))}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Result panel */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <BarChart3 className="h-4 w-4 text-accent" />
              <span>
                <span className="font-semibold text-foreground">{dataset.label}</span> ·{" "}
                {agg.toUpperCase()}{agg !== "count" && yField ? `(${labelOf(dataset, yField)})` : ""}{" "}
                by {labelOf(dataset, xField)}
                {xDef?.type === "date" ? ` (${xBucket})` : ""}
                {seriesField !== "__none__" ? ` split by ${labelOf(dataset, seriesField)}` : ""}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!aggregated.rows.length}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            {dataQ.isLoading ? (
              <div className="grid h-80 place-items-center text-sm text-muted-foreground">Loading…</div>
            ) : dataQ.error ? (
              <div className="grid h-80 place-items-center text-sm text-destructive">
                {(dataQ.error as Error).message}
              </div>
            ) : aggregated.rows.length === 0 ? (
              <div className="grid h-80 place-items-center text-sm text-muted-foreground">
                No data — adjust filters or pick a different X-axis.
              </div>
            ) : (
              <ChartView
                kind={chart}
                rows={aggregated.rows}
                seriesKeys={aggregated.seriesKeys}
                xLabel={labelOf(dataset, xField)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Helpers -------------------------------- */

function labelOf(ds: DatasetDef, key: string): string {
  return ds.fields.find((f) => f.key === key)?.label ?? key;
}

function castVal(v: string, type: FieldType): string | number | boolean | null {
  if (v === "") return null;
  if (type === "number") return Number(v);
  if (type === "boolean") return v === "true" || v === "1";
  return v;
}

function formatBucket(
  raw: unknown,
  type: FieldType,
  bucket: DateBucket,
  vehMap: Map<string, string>,
  vehicleRef: boolean,
): string | null {
  if (raw === null || raw === undefined || raw === "") return "(empty)";
  if (vehicleRef) return vehMap.get(String(raw)) ?? String(raw);
  if (type === "date") {
    const d = new Date(String(raw));
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = d.getMonth();
    if (bucket === "year") return `${y}`;
    if (bucket === "quarter") return `${y}-Q${Math.floor(m / 3) + 1}`;
    if (bucket === "month") return `${y}-${String(m + 1).padStart(2, "0")}`;
    if (bucket === "week") {
      const onejan = new Date(y, 0, 1);
      const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
      return `${y}-W${String(week).padStart(2, "0")}`;
    }
    return d.toISOString().slice(0, 10);
  }
  if (type === "boolean") return raw ? "true" : "false";
  return String(raw);
}

function computeAgg(b: { count: number; sum: number; min: number; max: number }, agg: Aggregation): number {
  switch (agg) {
    case "count": return b.count;
    case "sum": return round2(b.sum);
    case "avg": return b.count ? round2(b.sum / b.count) : 0;
    case "min": return Number.isFinite(b.min) ? round2(b.min) : 0;
    case "max": return Number.isFinite(b.max) ? round2(b.max) : 0;
  }
}

function round2(n: number) { return Math.round(n * 100) / 100; }

function sortKeys(a: string, b: string, type?: FieldType): number {
  if (type === "number") return Number(a) - Number(b);
  return a.localeCompare(b);
}

/* --------------------------------- Charts --------------------------------- */

function ChartView({
  kind,
  rows,
  seriesKeys,
  xLabel,
}: {
  kind: ChartKind;
  rows: Record<string, string | number>[];
  seriesKeys: string[];
  xLabel: string;
}) {
  if (kind === "table") {
    return (
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">{xLabel}</th>
              {seriesKeys.map((s) => (
                <th key={s} className="px-3 py-2 text-right">{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={cn(i % 2 ? "bg-muted/20" : "")}>
                <td className="px-3 py-2 font-medium">{String(r.x)}</td>
                {seriesKeys.map((s) => (
                  <td key={s} className="px-3 py-2 text-right tabular-nums">
                    {Number(r[s] ?? 0).toLocaleString("en-IN")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (kind === "pie") {
    const totals = seriesKeys.map((s, i) => ({
      name: s,
      value: rows.reduce((acc, r) => acc + Number(r[s] ?? 0), 0),
      color: PALETTE[i % PALETTE.length],
    }));
    return (
      <ResponsiveContainer width="100%" height={360}>
        <PieChart>
          <Pie data={totals} dataKey="value" nameKey="name" outerRadius={120} label>
            {totals.map((t, i) => <Cell key={i} fill={t.color} />)}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (kind === "line") {
    return (
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="x" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          {seriesKeys.map((s, i) => (
            <Line key={s} type="monotone" dataKey={s} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  const stacked = kind === "stackedBar";
  return (
    <ResponsiveContainer width="100%" height={360}>
      <BarChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="x" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        {seriesKeys.map((s, i) => (
          <Bar
            key={s}
            dataKey={s}
            stackId={stacked ? "a" : undefined}
            fill={PALETTE[i % PALETTE.length]}
            radius={stacked ? 0 : [4, 4, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
