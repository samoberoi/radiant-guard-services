import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, Building2, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight,
  ClipboardList, Clock3, FileEdit, MapPinned, Search, Sparkles, UserCircle2, Users, Wallet, X,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/invoice/")({
  component: PayrollUnitsPage,
});


type SheetStatus = "approved" | "pending" | "draft" | "rejected";

type SheetRow = {
  id: string;
  unit_id: string;
  period_start: string;
  period_end: string;
  approved_at: string | null;
  status: SheetStatus;
};

type UnitRow = {
  id: string;
  code: string;
  name: string;
  location: string;
  customer_id: string;
  customer_name: string;
  active_employee_count: number;
  employee_ids: string[];
  periods: { period_start: string; period_end: string; status: SheetStatus }[];
  statuses: Set<SheetStatus>;
};


type EmployeeOption = { id: string; label: string; name: string; code: string; unit_ids: string[] };

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function fmtPeriod(start: string, end: string) {
  const f = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return `${String(d).padStart(2, "0")} ${MONTH_NAMES[m - 1].slice(0, 3)} ${y}`;
  };
  return `${f(start)} – ${f(end)}`;
}

function deriveStatus(raw: string | null | undefined): SheetStatus {
  const s = (raw || "").toLowerCase();
  if (s === "approved") return "approved";
  if (s === "submitted" || s === "pending") return "pending";
  if (s === "rejected") return "rejected";
  return "draft";
}

function PayrollUnitsPage() {
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth()); // 0-indexed
  const [q, setQ] = useState("");
  const [orgFilter, setOrgFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState<string>("all");
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | SheetStatus | "unapproved">("all");

  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = (() => {
    const d = new Date(year, month + 1, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const { data, isLoading, error } = useQuery({
    queryKey: ["payroll-dashboard-v2", year, month],
    queryFn: async () => {
      // Include any sheet whose period overlaps the selected calendar month
      // (e.g. a 21 May – 20 Jun sheet shows up under both May and June).
      const { data: sheetsRaw, error: sErr } = await supabase
        .from("attendance_sheets" as never)
        .select("id, unit_id, period_start, period_end, approved_at, status")
        .lte("period_start", monthEnd)
        .gte("period_end", monthStart);
      if (sErr) throw sErr;
      const sheets: SheetRow[] = ((sheetsRaw ?? []) as unknown as Array<{
        id: string; unit_id: string; period_start: string; period_end: string;
        approved_at: string | null; status: string | null;
      }>).map((s) => ({
        id: s.id,
        unit_id: s.unit_id,
        period_start: s.period_start,
        period_end: s.period_end,
        approved_at: s.approved_at,
        status: deriveStatus(s.status),
      }));

      const counts = { approved: 0, draft: 0, pending: 0, rejected: 0 };
      for (const s of sheets) counts[s.status] += 1;

      const unitIds = Array.from(new Set(sheets.map((s) => s.unit_id)));
      if (unitIds.length === 0) {
        return {
          units: [] as UnitRow[],
          organizations: [] as { id: string; name: string }[],
          periods: [] as string[],
          employees: [] as EmployeeOption[],
          stats: { ...counts, units: 0, employees: 0, total: sheets.length },
        };
      }

      const [{ data: units }, { data: candidates }, { data: customers }, { data: links }] = await Promise.all([
        supabase
          .from("units")
          .select("id, code, name, location, customer_id")
          .in("id", unitIds),
        supabase
          .from("candidates")
          .select("id, unit_id, full_name, employee_code")
          .eq("is_enabled", true)
          .eq("status", "active"),
        supabase.from("customers").select("id, name"),
        supabase.from("candidate_units").select("candidate_id, unit_id").in("unit_id", unitIds),
      ]);

      const custMap = new Map((customers ?? []).map((c) => [c.id, c.name as string]));
      const unitIdSet = new Set(unitIds);

      const unitsByCandidate = new Map<string, Set<string>>();
      const candById = new Map<string, { id: string; unit_id: string | null; full_name: string | null; employee_code: string | null }>();
      for (const c of (candidates ?? []) as Array<{ id: string; unit_id: string | null; full_name: string | null; employee_code: string | null }>) {
        candById.set(c.id, c);
        if (c.unit_id && unitIdSet.has(c.unit_id)) {
          const s = unitsByCandidate.get(c.id) ?? new Set<string>();
          s.add(c.unit_id);
          unitsByCandidate.set(c.id, s);
        }
      }
      for (const l of (links ?? []) as Array<{ candidate_id: string; unit_id: string }>) {
        if (!unitIdSet.has(l.unit_id)) continue;
        const s = unitsByCandidate.get(l.candidate_id) ?? new Set<string>();
        s.add(l.unit_id);
        unitsByCandidate.set(l.candidate_id, s);
      }

      const employeeCountByUnit = new Map<string, number>();
      const employeeIdsByUnit = new Map<string, string[]>();
      const employees: EmployeeOption[] = [];
      for (const [candId, unitSet] of unitsByCandidate) {
        const c = candById.get(candId);
        if (!c) continue;
        for (const uid of unitSet) {
          employeeCountByUnit.set(uid, (employeeCountByUnit.get(uid) ?? 0) + 1);
          const ids = employeeIdsByUnit.get(uid) ?? [];
          ids.push(candId);
          employeeIdsByUnit.set(uid, ids);
        }
        const name = (c.full_name || "").trim() || "Unnamed";
        const code = (c.employee_code || "").trim();
        employees.push({
          id: candId,
          name,
          code,
          unit_ids: Array.from(unitSet),
          label: code ? `${name} (${code})` : name,
        });
      }
      employees.sort((a, b) => a.label.localeCompare(b.label));

      const periodsByUnit = new Map<string, { period_start: string; period_end: string; status: SheetStatus }[]>();
      for (const s of sheets) {
        const arr = periodsByUnit.get(s.unit_id) ?? [];
        arr.push({ period_start: s.period_start, period_end: s.period_end, status: s.status });
        periodsByUnit.set(s.unit_id, arr);
      }

      const rows: UnitRow[] = (units ?? []).map((u) => {
        const periods = (periodsByUnit.get(u.id) ?? []).sort((a, b) => b.period_start.localeCompare(a.period_start));
        return {
          id: u.id,
          code: u.code,
          name: u.name,
          location: u.location || "",
          customer_id: u.customer_id || "",
          customer_name: (u.customer_id && custMap.get(u.customer_id)) || "—",
          active_employee_count: employeeCountByUnit.get(u.id) ?? 0,
          employee_ids: employeeIdsByUnit.get(u.id) ?? [],
          periods,
          statuses: new Set(periods.map((p) => p.status)),
        };
      });
      rows.sort((a, b) =>
        a.customer_name !== b.customer_name
          ? a.customer_name.localeCompare(b.customer_name)
          : (a.name || a.code).localeCompare(b.name || b.code),
      );

      const orgs = Array.from(
        new Map(rows.map((r) => [r.customer_id || r.customer_name, { id: r.customer_id || r.customer_name, name: r.customer_name }])).values(),
      ).sort((a, b) => a.name.localeCompare(b.name));

      const allPeriods = Array.from(
        new Set(sheets.map((s) => `${s.period_start}|${s.period_end}`)),
      ).sort((a, b) => b.localeCompare(a));

      // count unique employees across active units this month
      const employeeUnique = unitsByCandidate.size;

      return {
        units: rows,
        organizations: orgs,
        periods: allPeriods,
        employees,
        stats: { ...counts, units: unitIds.length, employees: employeeUnique, total: sheets.length },
      };
    },
  });

  const units = data?.units ?? [];
  const organizations = data?.organizations ?? [];
  const periods = data?.periods ?? [];
  const employees = data?.employees ?? [];
  const monthlyStatsData = data?.stats;


  const employeeOptions = useMemo(() => {
    if (orgFilter === "all") return employees;
    const allowedUnitIds = new Set(units.filter((u) => (u.customer_id || u.customer_name) === orgFilter).map((u) => u.id));
    return employees.filter((e) => e.unit_ids.some((uid) => allowedUnitIds.has(uid)));
  }, [employees, orgFilter, units]);

  const employeesByUnit = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees) {
      for (const uid of e.unit_ids) {
        m.set(uid, `${m.get(uid) ?? ""} ${e.label}`);
      }
    }
    return m;
  }, [employees]);

  const selectedEmployee = useMemo(
    () => (employeeFilter !== "all" ? employees.find((e) => e.id === employeeFilter) ?? null : null),
    [employeeFilter, employees],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const selectedUnitIds = selectedEmployee ? new Set(selectedEmployee.unit_ids) : null;
    return units.filter((u) => {
      if (orgFilter !== "all" && (u.customer_id || u.customer_name) !== orgFilter) return false;
      if (selectedUnitIds && !selectedUnitIds.has(u.id)) return false;
      if (statusFilter !== "all") {
        if (statusFilter === "unapproved") {
          if (!u.periods.some((p) => p.status !== "approved")) return false;
        } else if (!u.statuses.has(statusFilter)) {
          return false;
        }
      }
      if (periodFilter !== "all") {
        const [ps, pe] = periodFilter.split("|");
        if (!u.periods.some((p) => p.period_start === ps && p.period_end === pe)) {
          return false;
        }
      }
      if (term) {
        const hay = [
          u.customer_name,
          u.name,
          u.code,
          u.location,
          employeesByUnit.get(u.id) ?? "",
        ].join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [q, orgFilter, periodFilter, statusFilter, selectedEmployee, employeesByUnit, units]);

  const summary = {
    organizations: organizations.length,
    units: units.length,
    activeEmployees: units.reduce((s, r) => s + r.active_employee_count, 0),
  };
  const anyFilter = orgFilter !== "all" || periodFilter !== "all" || employeeFilter !== "all" || statusFilter !== "all" || q.trim().length > 0;


  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Invoice"
        description="Monthly invoice dashboard. Approved attendance sheets unlock client invoicing — see what is billable to each customer this cycle."
        crumbs={[{ label: "Invoice" }]}
      />

      <MonthlyDashboard
        year={year}
        month={month}
        onChange={(y, m) => { setYear(y); setMonth(m); }}
        stats={monthlyStatsData}
        loading={isLoading}
        organizations={summary.organizations}
        activeStatus={statusFilter}
        onStatusChange={setStatusFilter}
      />



      {selectedEmployee && (
        <EmployeeSpotlight
          employee={selectedEmployee}
          units={units.filter((u) => selectedEmployee.unit_ids.includes(u.id))}
          onClear={() => setEmployeeFilter("all")}
        />
      )}


      <div className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
        <div className="space-y-4 border-b border-border/60 px-5 py-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">Invoice sheets — {MONTH_NAMES[month]} {year}</h2>
              <p className="text-sm text-muted-foreground">
                Every unit with an attendance sheet for this month. Approved sheets are ready to invoice; others show their current status.
              </p>

            </div>
            <div className="relative w-full max-w-lg">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search organization, unit, code, location, employee name"
                className="h-11 rounded-xl border-border/60 bg-background pl-10"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Filter
              label="Status"
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as typeof statusFilter)}
              options={[
                { value: "approved", label: `Approved (${monthlyStatsData?.approved ?? 0})` },
                { value: "unapproved", label: `Unapproved (${(monthlyStatsData?.pending ?? 0) + (monthlyStatsData?.draft ?? 0) + (monthlyStatsData?.rejected ?? 0)})` },
                { value: "pending", label: `Pending (${monthlyStatsData?.pending ?? 0})` },
                { value: "draft", label: `Draft (${monthlyStatsData?.draft ?? 0})` },
                { value: "rejected", label: `Rejected (${monthlyStatsData?.rejected ?? 0})` },
              ]}
              allLabel="All statuses"
            />
            <Filter
              label="Organization"
              value={orgFilter}
              onChange={(v) => {
                setOrgFilter(v);
                setEmployeeFilter("all");
              }}
              options={organizations.map((o) => ({ value: o.id, label: o.name }))}
              allLabel={`All organizations (${organizations.length})`}
            />
            <Filter
              label="Employee"
              value={employeeFilter}
              onChange={setEmployeeFilter}
              options={employeeOptions.map((e) => ({ value: e.id, label: e.label }))}
              allLabel={`All employees (${employeeOptions.length})`}
            />
            <Filter
              label="Period"
              value={periodFilter}
              onChange={setPeriodFilter}
              options={periods.map((p) => {
                const [s, e] = p.split("|");
                return { value: p, label: fmtPeriod(s, e) };
              })}
              allLabel={`All periods (${periods.length})`}
            />
          </div>



          {anyFilter && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {units.length} units
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => {
                  setQ("");
                  setOrgFilter("all");
                  setPeriodFilter("all");
                  setEmployeeFilter("all");
                  setStatusFilter("all");
                }}

              >
                <X className="h-3.5 w-3.5" /> Clear filters
              </Button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full table-auto">
            <thead className="border-b border-border/60 bg-secondary/40">
              <tr className="text-left text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <th className="px-5 py-4 font-medium">Unit</th>
                <th className="px-5 py-4 font-medium">Organization</th>
                <th className="px-5 py-4 font-medium">Periods (status)</th>
                <th className="px-5 py-4 text-right font-medium">Employees</th>
                <th className="px-5 py-4 font-medium">Status</th>
                <th className="px-5 py-4 text-right font-medium">Action</th>

              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    Loading invoice units…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-destructive">
                    {error instanceof Error ? error.message : "Could not load invoice units."}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    {units.length === 0
                      ? "No approved attendance sheets yet. Approve one in Attendance to unlock invoicing."
                      : "No units match the current filters."}
                  </td>
                </tr>
              ) : (

                filtered.map((unit) => {
                  const approvedLatest = unit.periods.find((p) => p.status === "approved");
                  const targetPeriod =
                    periodFilter !== "all"
                      ? (() => {
                          const [s, e] = periodFilter.split("|");
                          return { period_start: s, period_end: e };
                        })()
                      : approvedLatest;

                  return (
                    <tr key={unit.id} className="group transition-colors hover:bg-amber-50/30">
                      <td className="px-5 py-4 align-top">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100/80 text-emerald-700">
                            <Wallet className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-foreground">{unit.name || unit.code}</div>
                            <span className="mt-1 inline-flex rounded-md bg-secondary px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-foreground">
                              {unit.code || "—"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 align-top text-sm text-foreground">{unit.customer_name}</td>
                      <td className="px-5 py-4 align-top">
                        <div className="flex flex-wrap gap-1.5">
                          {unit.periods.slice(0, 3).map((p) => {
                            const cls =
                              p.status === "approved" ? "border-emerald-200/60 bg-emerald-100/60 text-emerald-800"
                              : p.status === "pending" ? "border-amber-200/60 bg-amber-100/60 text-amber-800"
                              : p.status === "rejected" ? "border-rose-200/60 bg-rose-100/60 text-rose-800"
                              : "border-sky-200/60 bg-sky-100/60 text-sky-800";
                            return (
                              <span
                                key={`${p.period_start}-${p.period_end}`}
                                className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}
                                title={p.status}
                              >
                                {fmtPeriod(p.period_start, p.period_end)} · {p.status}
                              </span>
                            );
                          })}
                          {unit.periods.length > 3 && (
                            <span className="text-[11px] text-muted-foreground">
                              +{unit.periods.length - 3}
                            </span>
                          )}

                        </div>
                      </td>
                      <td className="px-5 py-4 text-right align-top">
                        <div className="text-2xl font-semibold text-foreground">{unit.active_employee_count}</div>
                        <div className="text-xs text-muted-foreground">employees</div>
                      </td>
                      <td className="px-5 py-4 align-top">
                        {targetPeriod ? (
                          <span className="inline-flex rounded-full border border-emerald-200/60 bg-emerald-100/60 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
                            Ready to invoice
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-amber-200/60 bg-amber-100/60 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                            Awaiting approval
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right align-top">
                        {targetPeriod ? (
                          <Link
                            to="/admin/invoice/$unitId"
                            params={{ unitId: unit.id }}
                            search={{ start: targetPeriod.period_start, end: targetPeriod.period_end }}
                            className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:border-accent/50 hover:text-accent"
                          >
                            Show invoice <ArrowRight className="h-4 w-4" />
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}

                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type MonthlyStats = {
  approved: number; draft: number; pending: number; rejected: number;
  units: number; employees: number; total: number;
};

type StatusKey = "all" | SheetStatus | "unapproved";

function MonthlyDashboard({
  year, month, onChange, stats, loading, organizations, activeStatus, onStatusChange,
}: {
  year: number; month: number;
  onChange: (year: number, month: number) => void;
  stats: MonthlyStats | undefined;
  loading: boolean;
  organizations: number;
  activeStatus: StatusKey;
  onStatusChange: (s: StatusKey) => void;
}) {

  const monthName = MONTH_NAMES[month];
  const shift = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    onChange(d.getFullYear(), d.getMonth());
  };
  const isCurrent = (() => {
    const n = new Date();
    return n.getFullYear() === year && n.getMonth() === month;
  })();

  const s: MonthlyStats = stats ?? { approved: 0, draft: 0, pending: 0, rejected: 0, units: 0, employees: 0, total: 0 };
  const total = Math.max(s.total, 1);
  const segs = [
    { key: "approved", label: "Approved", value: s.approved, cls: "bg-emerald-500" },
    { key: "pending", label: "Pending", value: s.pending, cls: "bg-amber-500" },
    { key: "draft", label: "Draft", value: s.draft, cls: "bg-sky-500" },
    { key: "rejected", label: "Rejected", value: s.rejected, cls: "bg-rose-500" },
  ];

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-indigo-950 via-slate-900 to-emerald-900 text-white shadow-xl">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 -bottom-24 h-72 w-72 rounded-full bg-indigo-400/20 blur-3xl" />

      <div className="relative grid gap-6 p-6 sm:p-7 lg:grid-cols-[1.1fr_1.4fr]">
        {/* Left: month hero */}
        <div className="flex flex-col justify-between gap-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80 backdrop-blur">
              <CalendarDays className="h-3.5 w-3.5" /> Invoice month
            </div>
            <div className="flex items-end gap-3">
              <div className="font-display text-5xl font-bold tracking-tight sm:text-6xl">{monthName}</div>
              <div className="pb-2 text-2xl font-semibold text-white/70">{year}</div>
              {isCurrent && (
                <span className="mb-2 inline-flex rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                  Current
                </span>
              )}
            </div>
            <p className="max-w-md text-sm text-white/70">
              Snapshot of all invoice activity for this cycle — approved, pending, and in-progress sheets across every unit.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => shift(-1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white hover:bg-white/15"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <Select value={String(month)} onValueChange={(v) => onChange(year, Number(v))}>
              <SelectTrigger className="h-9 w-[140px] rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/15">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((m, i) => (
                  <SelectItem key={m} value={String(i)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => onChange(Number(v), month)}>
              <SelectTrigger className="h-9 w-[100px] rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/15">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 3 + i).map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              onClick={() => shift(1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white hover:bg-white/15"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {!isCurrent && (
              <button
                onClick={() => {
                  const n = new Date();
                  onChange(n.getFullYear(), n.getMonth());
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 text-xs font-semibold text-white hover:bg-white/15"
              >
                Jump to today
              </button>
            )}
          </div>
        </div>

        {/* Right: stats grid */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <DashStat icon={Clock3} label="Pending" value={s.pending} accent="amber" loading={loading}
              active={activeStatus === "pending"} onClick={() => onStatusChange(activeStatus === "pending" ? "all" : "pending")} />
            <DashStat icon={CheckCircle2} label="Approved" value={s.approved} accent="emerald" loading={loading}
              active={activeStatus === "approved"} onClick={() => onStatusChange(activeStatus === "approved" ? "all" : "approved")} />
            <DashStat icon={FileEdit} label="Draft" value={s.draft} accent="sky" loading={loading}
              active={activeStatus === "draft"} onClick={() => onStatusChange(activeStatus === "draft" ? "all" : "draft")} />
            <DashStat icon={ClipboardList} label="Sheets" value={s.total} accent="violet" loading={loading}
              active={activeStatus === "all"} onClick={() => onStatusChange("all")} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <DashStat icon={Building2} label="Organizations" value={organizations} accent="rose" loading={loading} compact />
            <DashStat icon={MapPinned} label="Units" value={s.units} accent="cyan" loading={loading} compact />
            <DashStat icon={Users} label="Employees" value={s.employees} accent="lime" loading={loading} compact />
          </div>


          {/* Stacked progress bar */}
          <div>
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
              <span>Sheet status mix</span>
              <span>{s.total} total</span>
            </div>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/10">
              {segs.map((seg) =>
                seg.value > 0 ? (
                  <div
                    key={seg.key}
                    className={seg.cls}
                    style={{ width: `${(seg.value / total) * 100}%` }}
                    title={`${seg.label}: ${seg.value}`}
                  />
                ) : null,
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/70">
              {segs.map((seg) => (
                <span key={seg.key} className="inline-flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${seg.cls}`} /> {seg.label} {seg.value}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashStat({
  icon: Icon, label, value, accent, loading, compact, active, onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number;
  accent: "amber" | "emerald" | "sky" | "violet" | "rose" | "cyan" | "lime";
  loading?: boolean; compact?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  const accentMap: Record<string, string> = {
    amber: "from-amber-400/30 to-amber-500/10 text-amber-200",
    emerald: "from-emerald-400/30 to-emerald-500/10 text-emerald-200",
    sky: "from-sky-400/30 to-sky-500/10 text-sky-200",
    violet: "from-violet-400/30 to-violet-500/10 text-violet-200",
    rose: "from-rose-400/30 to-rose-500/10 text-rose-200",
    cyan: "from-cyan-400/30 to-cyan-500/10 text-cyan-200",
    lime: "from-lime-400/30 to-lime-500/10 text-lime-200",
  };
  const Cmp: React.ElementType = onClick ? "button" : "div";
  return (
    <Cmp
      onClick={onClick}
      className={`group relative w-full text-left overflow-hidden rounded-2xl border bg-white/5 p-3 backdrop-blur transition hover:border-white/30 hover:bg-white/10 ${active ? "border-white/60 ring-2 ring-white/40" : "border-white/10"} ${onClick ? "cursor-pointer" : ""}`}
    >
      <div className={`absolute inset-0 -z-10 bg-gradient-to-br opacity-60 ${accentMap[accent]}`} />
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">{label}</div>
      </div>
      <div className={`mt-1 font-display font-bold tabular-nums tracking-tight ${compact ? "text-2xl" : "text-3xl"}`}>
        {loading ? <span className="text-white/40">—</span> : value.toLocaleString()}
      </div>
    </Cmp>
  );
}




function Filter({
  label, value, onChange, options, allLabel,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; allLabel: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 rounded-xl border-border/60 bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-[320px]">
          <SelectItem value="all">{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Tile({
  icon: Icon, label, value, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number; tone: "amber" | "sky" | "emerald";
}) {
  const cls =
    tone === "amber" ? "bg-amber-100/80 text-amber-700"
    : tone === "sky" ? "bg-sky-100/80 text-sky-700"
    : "bg-emerald-100/80 text-emerald-700";
  return (
    <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${cls}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <div className="text-4xl font-semibold tracking-tight text-foreground">{value}</div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
        </div>
      </div>
    </div>
  );
}

function EmployeeSpotlight({
  employee,
  units,
  onClear,
}: {
  employee: EmployeeOption;
  units: UnitRow[];
  onClear: () => void;
}) {
  const totalPeriods = units.reduce((s, u) => s + u.periods.length, 0);
  const initials = employee.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "E";

  return (
    <div className="relative overflow-hidden rounded-3xl border border-amber-200/70 bg-gradient-to-br from-amber-50 via-rose-50 to-sky-50 shadow-sm">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-amber-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -left-10 -bottom-20 h-56 w-56 rounded-full bg-sky-200/40 blur-3xl" />

      <div className="relative flex flex-col gap-5 p-6 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-rose-500 text-xl font-semibold text-white shadow-lg shadow-amber-500/20 ring-4 ring-white/60">
              {initials}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                <Sparkles className="h-3.5 w-3.5" /> Employee invoice spotlight
              </div>
              <div className="text-xl font-semibold text-foreground sm:text-2xl">{employee.name}</div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {employee.code && (
                  <span className="inline-flex rounded-md bg-white/80 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-foreground shadow-sm">
                    {employee.code}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <UserCircle2 className="h-3.5 w-3.5" />
                  Mapped to {units.length} unit{units.length === 1 ? "" : "s"} · {totalPeriods} approved period
                  {totalPeriods === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="self-start text-xs sm:self-auto" onClick={onClear}>
            <X className="mr-1 h-3.5 w-3.5" /> Clear employee
          </Button>
        </div>

        {units.length === 0 ? (
          <div className="rounded-2xl bg-white/60 px-4 py-6 text-center text-sm text-muted-foreground">
            This employee is mapped to units, but none have approved attendance yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {units.map((u) => {
              const latest = u.periods[0];
              return (
                <div
                  key={u.id}
                  className="group relative flex flex-col gap-3 rounded-2xl border border-white/80 bg-white/85 p-4 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {u.customer_name}
                      </div>
                      <div className="mt-0.5 truncate text-sm font-semibold text-foreground">
                        {u.name || u.code}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="inline-flex rounded-md bg-secondary px-1.5 py-0.5 font-mono font-semibold uppercase tracking-wide text-foreground">
                          {u.code || "—"}
                        </span>
                        {u.location && <span className="truncate">· {u.location}</span>}
                      </div>
                    </div>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                      <Wallet className="h-4 w-4" />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {u.periods.slice(0, 2).map((p) => (
                      <span
                        key={`${p.period_start}-${p.period_end}`}
                        className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
                      >
                        {fmtPeriod(p.period_start, p.period_end)}
                      </span>
                    ))}
                    {u.periods.length > 2 && (
                      <span className="text-[11px] text-muted-foreground">
                        +{u.periods.length - 2} more
                      </span>
                    )}
                  </div>

                  {latest ? (
                    <Link
                      to="/admin/invoice/$unitId"
                      params={{ unitId: u.id }}
                      search={{ start: latest.period_start, end: latest.period_end }}
                      className="mt-auto inline-flex items-center justify-between gap-2 rounded-xl bg-foreground px-3 py-2 text-xs font-semibold text-background transition hover:bg-foreground/90"
                    >
                      View wages for {employee.name.split(/\s+/)[0]}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : (
                    <div className="mt-auto text-[11px] text-muted-foreground">No approved period</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
