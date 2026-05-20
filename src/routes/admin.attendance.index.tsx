import { createFileRoute, Link } from "@tanstack/react-router";
import { type ComponentType, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  ClipboardList,
  MapPinned,
  Search,
  Users,
  X,
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

export const Route = createFileRoute("/admin/attendance/")({
  component: AttendanceUnitsPage,
});

type EmployeeRef = { id: string; name: string };

type UnitRow = {
  id: string;
  code: string;
  name: string;
  location: string;
  customer_id: string;
  customer_name: string;
  contract_codes: string[];
  contract_end: string | null;
  active_employee_count: number;
  field_officers: EmployeeRef[];
  security_guards: EmployeeRef[];
};

type AttendancePageData = {
  units: UnitRow[];
  organizations: { id: string; name: string }[];
  fieldOfficers: EmployeeRef[];
  securityGuards: EmployeeRef[];
  summary: { organizations: number; units: number; activeEmployees: number };
};

const ACTIVE_EMPLOYEE_STATUSES = ["active"] as const;

const FIELD_OFFICER_KEYWORDS = ["field officer", "field-officer", "fieldofficer", "fo "];
const SECURITY_GUARD_KEYWORDS = ["security guard", "guard", "security-guard", "sg ", "security_guard"];

function matchDesignation(name: string, keywords: string[]) {
  const n = (name || "").toLowerCase().trim();
  if (!n) return false;
  return keywords.some((k) => n.includes(k.trim()));
}

function AttendanceUnitsPage() {
  const [q, setQ] = useState("");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [unitFilter, setUnitFilter] = useState<string>("all");
  const [foFilter, setFoFilter] = useState<string>("all");
  const [sgFilter, setSgFilter] = useState<string>("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["attendance-dashboard-v4"],
    queryFn: async (): Promise<AttendancePageData> => {
      const { data: contracts, error: contractsError } = await supabase
        .from("client_contracts")
        .select("unit_id, contract_code, end_date, status")
        .eq("status", "active");
      if (contractsError) throw contractsError;

      const contractsByUnit = new Map<string, { codes: string[]; end: string | null }>();
      for (const c of contracts ?? []) {
        if (!c.unit_id) continue;
        const cur = contractsByUnit.get(c.unit_id) ?? { codes: [], end: null };
        if (c.contract_code) cur.codes.push(c.contract_code);
        if (!cur.end || (c.end_date && c.end_date > cur.end)) cur.end = c.end_date;
        contractsByUnit.set(c.unit_id, cur);
      }

      const unitIds = Array.from(contractsByUnit.keys());
      if (unitIds.length === 0) {
        return {
          units: [],
          organizations: [],
          fieldOfficers: [],
          securityGuards: [],
          summary: { organizations: 0, units: 0, activeEmployees: 0 },
        };
      }

      const [
        { data: units, error: unitsError },
        { data: primaryCandidates, error: primaryError },
        { data: candidateLinks, error: linksError },
      ] = await Promise.all([
        supabase.from("units").select("id, code, name, location, customer_id").in("id", unitIds),
        supabase
          .from("candidates")
          .select("id, full_name, designation_id, unit_id")
          .in("unit_id", unitIds)
          .eq("is_enabled", true)
          .in("status", [...ACTIVE_EMPLOYEE_STATUSES]),
        supabase.from("candidate_units").select("candidate_id, unit_id").in("unit_id", unitIds),
      ]);
      if (unitsError) throw unitsError;
      if (primaryError) throw primaryError;
      if (linksError) throw linksError;

      const linkCandidateIds = Array.from(new Set((candidateLinks ?? []).map((l) => l.candidate_id)));
      let linkedCandidates: Array<{ id: string; full_name: string; designation_id: string | null }> = [];
      if (linkCandidateIds.length > 0) {
        const { data: linkedRows, error: linkedError } = await supabase
          .from("candidates")
          .select("id, full_name, designation_id")
          .in("id", linkCandidateIds)
          .eq("is_enabled", true)
          .in("status", [...ACTIVE_EMPLOYEE_STATUSES]);
        if (linkedError) throw linkedError;
        linkedCandidates = linkedRows ?? [];
      }
      const linkedMap = new Map(linkedCandidates.map((c) => [c.id, c]));

      const designationIds = Array.from(
        new Set(
          [
            ...(primaryCandidates ?? []).map((c) => c.designation_id),
            ...linkedCandidates.map((c) => c.designation_id),
          ].filter(Boolean) as string[],
        ),
      );
      const { data: designations, error: dErr } = await supabase
        .from("designations")
        .select("id, name")
        .in("id", designationIds.length ? designationIds : ["00000000-0000-0000-0000-000000000000"]);
      if (dErr) throw dErr;
      const dMap = new Map((designations ?? []).map((d) => [d.id, d.name as string]));

      const customerIds = Array.from(
        new Set((units ?? []).map((u) => u.customer_id).filter(Boolean)),
      ) as string[];
      const { data: customers, error: cErr } = await supabase
        .from("customers")
        .select("id, name")
        .in("id", customerIds.length ? customerIds : ["00000000-0000-0000-0000-000000000000"]);
      if (cErr) throw cErr;
      const customerMap = new Map((customers ?? []).map((c) => [c.id, c.name as string]));

      type UnitAcc = {
        employees: Map<string, { name: string; designation: string }>;
      };
      const acc = new Map<string, UnitAcc>();
      const ensure = (unitId: string) => {
        if (!acc.has(unitId)) acc.set(unitId, { employees: new Map() });
        return acc.get(unitId)!;
      };

      for (const c of primaryCandidates ?? []) {
        if (!c.unit_id) continue;
        ensure(c.unit_id).employees.set(c.id, {
          name: c.full_name || "—",
          designation: (c.designation_id && dMap.get(c.designation_id)) || "",
        });
      }
      for (const link of candidateLinks ?? []) {
        const cand = linkedMap.get(link.candidate_id);
        if (!cand) continue;
        ensure(link.unit_id).employees.set(cand.id, {
          name: cand.full_name || "—",
          designation: (cand.designation_id && dMap.get(cand.designation_id)) || "",
        });
      }

      const rows: UnitRow[] = (units ?? [])
        .map((u) => {
          const a = acc.get(u.id);
          const employees = a ? Array.from(a.employees.entries()) : [];
          const fos: EmployeeRef[] = [];
          const sgs: EmployeeRef[] = [];
          for (const [id, info] of employees) {
            if (matchDesignation(info.designation, FIELD_OFFICER_KEYWORDS)) {
              fos.push({ id, name: info.name });
            } else if (matchDesignation(info.designation, SECURITY_GUARD_KEYWORDS)) {
              sgs.push({ id, name: info.name });
            }
          }
          return {
            id: u.id,
            code: u.code,
            name: u.name,
            location: u.location || "",
            customer_id: u.customer_id || "",
            customer_name: (u.customer_id && customerMap.get(u.customer_id)) || "—",
            contract_codes: contractsByUnit.get(u.id)?.codes ?? [],
            contract_end: contractsByUnit.get(u.id)?.end ?? null,
            active_employee_count: employees.length,
            field_officers: fos.sort((a, b) => a.name.localeCompare(b.name)),
            security_guards: sgs.sort((a, b) => a.name.localeCompare(b.name)),
          };
        })
        .sort((a, b) =>
          a.customer_name !== b.customer_name
            ? a.customer_name.localeCompare(b.customer_name)
            : (a.name || a.code).localeCompare(b.name || b.code),
        );

      const orgs = Array.from(
        new Map(rows.map((r) => [r.customer_id || r.customer_name, { id: r.customer_id || r.customer_name, name: r.customer_name }])).values(),
      ).sort((a, b) => a.name.localeCompare(b.name));

      const foMap = new Map<string, EmployeeRef>();
      const sgMap = new Map<string, EmployeeRef>();
      for (const r of rows) {
        for (const fo of r.field_officers) foMap.set(fo.id, fo);
        for (const sg of r.security_guards) sgMap.set(sg.id, sg);
      }

      return {
        units: rows,
        organizations: orgs,
        fieldOfficers: Array.from(foMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
        securityGuards: Array.from(sgMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
        summary: {
          organizations: orgs.length,
          units: rows.length,
          activeEmployees: rows.reduce((s, r) => s + r.active_employee_count, 0),
        },
      };
    },
  });

  const units = data?.units ?? [];
  const organizations = data?.organizations ?? [];
  const fieldOfficers = data?.fieldOfficers ?? [];
  const securityGuards = data?.securityGuards ?? [];
  const summary = data?.summary ?? { organizations: 0, units: 0, activeEmployees: 0 };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return units.filter((u) => {
      if (orgFilter !== "all" && (u.customer_id || u.customer_name) !== orgFilter) return false;
      if (unitFilter !== "all" && u.id !== unitFilter) return false;
      if (foFilter !== "all" && !u.field_officers.some((f) => f.id === foFilter)) return false;
      if (sgFilter !== "all" && !u.security_guards.some((g) => g.id === sgFilter)) return false;
      if (term) {
        const hay = [
          u.customer_name,
          u.name,
          u.code,
          u.location,
          ...u.contract_codes,
          ...u.field_officers.map((f) => f.name),
          ...u.security_guards.map((g) => g.name),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [q, orgFilter, unitFilter, foFilter, sgFilter, units]);

  const anyFilter = orgFilter !== "all" || unitFilter !== "all" || foFilter !== "all" || sgFilter !== "all" || q.trim().length > 0;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Attendance"
        description="Browse units with active contracts and drill into the monthly muster roll. Filter by organization, unit, field officer, or security guard."
        crumbs={[{ label: "Attendance" }]}
      />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <SummaryTile icon={Building2} label="Organizations" value={summary.organizations} accent="organization" />
        <SummaryTile icon={MapPinned} label="Units" value={summary.units} accent="unit" />
        <SummaryTile icon={Users} label="Active employees" value={summary.activeEmployees} accent="employee" />
      </div>

      <div className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm shadow-stone-200/40 dark:shadow-black/20">
        <div className="space-y-4 border-b border-border/60 px-5 py-5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">Attendance unit register</h2>
              <p className="text-sm text-muted-foreground">
                Open any unit to view its month-wise muster roll. Attendance is always recorded per unit.
              </p>
            </div>
            <div className="relative w-full max-w-lg">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search organization, unit, code, location, contract, or employee"
                className="h-11 rounded-xl border-border/60 bg-background pl-10"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <FilterSelect
              label="Organization"
              value={orgFilter}
              onChange={setOrgFilter}
              options={organizations.map((o) => ({ value: o.id, label: o.name }))}
              allLabel={`All organizations (${organizations.length})`}
            />
            <FilterSelect
              label="Unit"
              value={unitFilter}
              onChange={setUnitFilter}
              options={units.map((u) => ({
                value: u.id,
                label: `${u.name || u.code}${u.customer_name ? ` · ${u.customer_name}` : ""}`,
              }))}
              allLabel={`All units (${units.length})`}
            />
            <FilterSelect
              label="Field officer"
              value={foFilter}
              onChange={setFoFilter}
              options={fieldOfficers.map((f) => ({ value: f.id, label: f.name }))}
              allLabel={`All field officers (${fieldOfficers.length})`}
            />
            <FilterSelect
              label="Security guard"
              value={sgFilter}
              onChange={setSgFilter}
              options={securityGuards.map((g) => ({ value: g.id, label: g.name }))}
              allLabel={`All security guards (${securityGuards.length})`}
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
                  setUnitFilter("all");
                  setFoFilter("all");
                  setSgFilter("all");
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
                <th className="px-5 py-4 font-medium">Location</th>
                <th className="px-5 py-4 font-medium">Field officers</th>
                <th className="px-5 py-4 font-medium">Security guards</th>
                <th className="px-5 py-4 text-right font-medium">Active</th>
                <th className="px-5 py-4 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    Loading attendance units…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-destructive">
                    {error instanceof Error ? error.message : "Could not load attendance units right now."}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    {units.length === 0 ? "No units with active contracts yet." : "No units match the current filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((unit) => (
                  <tr key={unit.id} className="group transition-colors hover:bg-amber-50/30 dark:hover:bg-amber-500/5">
                    <td className="px-5 py-4 align-top">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100/80 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                          <MapPinned className="h-4 w-4" />
                        </div>
                        <div className="min-w-[200px]">
                          <div className="text-sm font-semibold text-foreground">{unit.name || unit.code}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex rounded-md bg-secondary px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-foreground">
                              {unit.code || "—"}
                            </span>
                            {unit.contract_codes.slice(0, 2).map((cc) => (
                              <span
                                key={cc}
                                className="inline-flex rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent"
                              >
                                {cc}
                              </span>
                            ))}
                            {unit.contract_codes.length > 2 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{unit.contract_codes.length - 2}
                              </span>
                            )}
                          </div>
                          <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <ClipboardList className="h-3 w-3" /> Attendance ready
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top text-sm text-foreground">{unit.customer_name}</td>
                    <td className="px-5 py-4 align-top text-sm text-muted-foreground">{unit.location || "—"}</td>
                    <td className="px-5 py-4 align-top">
                      <EmployeeChips list={unit.field_officers} empty="—" tone="amber" />
                    </td>
                    <td className="px-5 py-4 align-top">
                      <EmployeeChips list={unit.security_guards} empty="—" tone="emerald" />
                    </td>
                    <td className="px-5 py-4 text-right align-top">
                      <div className="text-2xl font-semibold tracking-tight text-foreground">
                        {unit.active_employee_count}
                      </div>
                      <div className="text-xs text-muted-foreground">employees</div>
                    </td>
                    <td className="px-5 py-4 text-right align-top">
                      <Link
                        to="/admin/attendance/$unitId"
                        params={{ unitId: unit.id }}
                        className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:border-accent/50 hover:text-accent"
                      >
                        Open roll <ArrowRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 rounded-xl border-border/60 bg-background">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-[320px]">
          <SelectItem value="all">{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function EmployeeChips({
  list,
  empty,
  tone,
}: {
  list: EmployeeRef[];
  empty: string;
  tone: "amber" | "emerald";
}) {
  if (list.length === 0) return <span className="text-sm text-muted-foreground">{empty}</span>;
  const cls =
    tone === "amber"
      ? "border-amber-200/60 bg-amber-100/60 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
      : "border-emerald-200/60 bg-emerald-100/60 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200";
  const visible = list.slice(0, 3);
  return (
    <div className="flex max-w-[240px] flex-wrap gap-1.5">
      {visible.map((p) => (
        <span
          key={p.id}
          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}
        >
          {p.name}
        </span>
      ))}
      {list.length > visible.length && (
        <span className="text-[11px] text-muted-foreground">+{list.length - visible.length}</span>
      )}
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent: "organization" | "unit" | "employee";
}) {
  const accentClass =
    accent === "organization"
      ? "bg-amber-100/80 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
      : accent === "unit"
        ? "bg-sky-100/80 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"
        : "bg-emerald-100/80 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300";
  return (
    <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm shadow-stone-200/30 dark:shadow-black/10">
      <div className="flex items-center gap-4">
        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${accentClass}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <div className="text-4xl font-semibold tracking-tight text-foreground">{value}</div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {label}
          </div>
        </div>
      </div>
    </div>
  );
}
