import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, MapPinned, Search, Users, Wallet, X } from "lucide-react";

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

export const Route = createFileRoute("/admin/payroll/")({
  component: PayrollUnitsPage,
});

type ApprovedSheet = {
  id: string;
  unit_id: string;
  period_start: string;
  period_end: string;
  approved_at: string | null;
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
  approved_periods: { period_start: string; period_end: string }[];
};

type EmployeeOption = { id: string; label: string; unit_id: string };

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

function PayrollUnitsPage() {
  const [q, setQ] = useState("");
  const [orgFilter, setOrgFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState<string>("all");
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["payroll-dashboard-v1"],
    queryFn: async () => {
      const { data: sheetsRaw, error: sErr } = await supabase
        .from("attendance_sheets" as never)
        .select("id, unit_id, period_start, period_end, approved_at, status")
        .eq("status", "approved");
      if (sErr) throw sErr;
      const sheets = (sheetsRaw ?? []) as unknown as ApprovedSheet[];

      const unitIds = Array.from(new Set(sheets.map((s) => s.unit_id)));
      if (unitIds.length === 0) {
        return { units: [] as UnitRow[], organizations: [] as { id: string; name: string }[], periods: [] as string[], employees: [] as EmployeeOption[] };
      }

      const [{ data: units }, { data: candidates }, { data: customers }] = await Promise.all([
        supabase
          .from("units")
          .select("id, code, name, location, customer_id")
          .in("id", unitIds),
        supabase
          .from("candidates")
          .select("id, unit_id, full_name, employee_code")
          .in("unit_id", unitIds)
          .eq("is_enabled", true)
          .eq("status", "active"),
        supabase.from("customers").select("id, name"),
      ]);

      const custMap = new Map((customers ?? []).map((c) => [c.id, c.name as string]));
      const employeeCountByUnit = new Map<string, number>();
      const employeeIdsByUnit = new Map<string, string[]>();
      const employees: EmployeeOption[] = [];
      for (const c of (candidates ?? []) as Array<{ id: string; unit_id: string | null; full_name: string | null; employee_code: string | null }>) {
        if (!c.unit_id) continue;
        employeeCountByUnit.set(c.unit_id, (employeeCountByUnit.get(c.unit_id) ?? 0) + 1);
        const ids = employeeIdsByUnit.get(c.unit_id) ?? [];
        ids.push(c.id);
        employeeIdsByUnit.set(c.unit_id, ids);
        const name = (c.full_name || "").trim() || "Unnamed";
        const code = (c.employee_code || "").trim();
        employees.push({ id: c.id, unit_id: c.unit_id, label: code ? `${name} (${code})` : name });
      }
      employees.sort((a, b) => a.label.localeCompare(b.label));

      const periodsByUnit = new Map<string, { period_start: string; period_end: string }[]>();
      for (const s of sheets) {
        const arr = periodsByUnit.get(s.unit_id) ?? [];
        arr.push({ period_start: s.period_start, period_end: s.period_end });
        periodsByUnit.set(s.unit_id, arr);
      }

      const rows: UnitRow[] = (units ?? []).map((u) => ({
        id: u.id,
        code: u.code,
        name: u.name,
        location: u.location || "",
        customer_id: u.customer_id || "",
        customer_name: (u.customer_id && custMap.get(u.customer_id)) || "—",
        active_employee_count: employeeCountByUnit.get(u.id) ?? 0,
        employee_ids: employeeIdsByUnit.get(u.id) ?? [],
        approved_periods: (periodsByUnit.get(u.id) ?? []).sort((a, b) =>
          b.period_start.localeCompare(a.period_start),
        ),
      }));
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

      return { units: rows, organizations: orgs, periods: allPeriods, employees };
    },
  });

  const units = data?.units ?? [];
  const organizations = data?.organizations ?? [];
  const periods = data?.periods ?? [];
  const employees = data?.employees ?? [];

  const employeeOptions = useMemo(() => {
    if (orgFilter === "all") return employees;
    const allowedUnitIds = new Set(units.filter((u) => (u.customer_id || u.customer_name) === orgFilter).map((u) => u.id));
    return employees.filter((e) => allowedUnitIds.has(e.unit_id));
  }, [employees, orgFilter, units]);

  const employeesByUnit = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees) {
      m.set(e.unit_id, `${m.get(e.unit_id) ?? ""} ${e.label}`);
    }
    return m;
  }, [employees]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const selectedEmployee = employeeFilter !== "all" ? employees.find((e) => e.id === employeeFilter) : null;
    return units.filter((u) => {
      if (orgFilter !== "all" && (u.customer_id || u.customer_name) !== orgFilter) return false;
      if (selectedEmployee && selectedEmployee.unit_id !== u.id) return false;
      if (periodFilter !== "all") {
        const [ps, pe] = periodFilter.split("|");
        if (!u.approved_periods.some((p) => p.period_start === ps && p.period_end === pe)) {
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
  }, [q, orgFilter, periodFilter, employeeFilter, employees, employeesByUnit, units]);

  const summary = {
    organizations: organizations.length,
    units: units.length,
    activeEmployees: units.reduce((s, r) => s + r.active_employee_count, 0),
  };
  const anyFilter = orgFilter !== "all" || periodFilter !== "all" || employeeFilter !== "all" || q.trim().length > 0;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Payroll"
        description="Compute wages for units whose attendance has been approved. Pick a unit to see end-to-end wage breakdown for every mapped employee."
        crumbs={[{ label: "Payroll" }]}
      />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Tile icon={Building2} label="Organizations" value={summary.organizations} tone="amber" />
        <Tile icon={MapPinned} label="Approved units" value={summary.units} tone="sky" />
        <Tile icon={Users} label="Active employees" value={summary.activeEmployees} tone="emerald" />
      </div>

      <div className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
        <div className="space-y-4 border-b border-border/60 px-5 py-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">Payroll-ready units</h2>
              <p className="text-sm text-muted-foreground">
                Only units whose attendance sheet is approved appear here. Pick a unit to view wage computation.
              </p>
            </div>
            <div className="relative w-full max-w-lg">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search organization, unit, code, location"
                className="h-11 rounded-xl border-border/60 bg-background pl-10"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
              label="Approved period"
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
                <th className="px-5 py-4 font-medium">Approved periods</th>
                <th className="px-5 py-4 text-right font-medium">Employees</th>
                <th className="px-5 py-4 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    Loading payroll units…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-destructive">
                    {error instanceof Error ? error.message : "Could not load payroll units."}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    {units.length === 0
                      ? "No approved attendance sheets yet. Approve one in Attendance to unlock payroll."
                      : "No units match the current filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((unit) => {
                  const latest = unit.approved_periods[0];
                  const targetPeriod =
                    periodFilter !== "all"
                      ? (() => {
                          const [s, e] = periodFilter.split("|");
                          return { period_start: s, period_end: e };
                        })()
                      : latest;
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
                          {unit.approved_periods.slice(0, 3).map((p) => (
                            <span
                              key={`${p.period_start}-${p.period_end}`}
                              className="inline-flex rounded-full border border-emerald-200/60 bg-emerald-100/60 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
                            >
                              {fmtPeriod(p.period_start, p.period_end)}
                            </span>
                          ))}
                          {unit.approved_periods.length > 3 && (
                            <span className="text-[11px] text-muted-foreground">
                              +{unit.approved_periods.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right align-top">
                        <div className="text-2xl font-semibold text-foreground">{unit.active_employee_count}</div>
                        <div className="text-xs text-muted-foreground">employees</div>
                      </td>
                      <td className="px-5 py-4 text-right align-top">
                        {targetPeriod ? (
                          <Link
                            to="/admin/payroll/$unitId"
                            params={{ unitId: unit.id }}
                            search={{ start: targetPeriod.period_start, end: targetPeriod.period_end }}
                            className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:border-accent/50 hover:text-accent"
                          >
                            Compute wages <ArrowRight className="h-4 w-4" />
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">No period</span>
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
