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
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/attendance/")({
  component: AttendanceUnitsPage,
});

type UnitRow = {
  id: string;
  code: string;
  name: string;
  location: string;
  customer_name: string;
  contract_codes: string[];
  contract_end: string | null;
  active_employee_count: number;
};

type AttendancePageData = {
  units: UnitRow[];
  summary: {
    organizations: number;
    units: number;
    activeEmployees: number;
  };
};

const ACTIVE_EMPLOYEE_STATUSES = ["active"] as const;

function AttendanceUnitsPage() {
  const [q, setQ] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["attendance-dashboard-v3"],
    queryFn: async (): Promise<AttendancePageData> => {
      const { data: contracts, error: contractsError } = await supabase
        .from("client_contracts")
        .select("unit_id, contract_code, end_date, status")
        .eq("status", "active");

      if (contractsError) throw contractsError;

      const contractsByUnit = new Map<string, { codes: string[]; end: string | null }>();
      for (const contract of contracts ?? []) {
        if (!contract.unit_id) continue;
        const current = contractsByUnit.get(contract.unit_id) ?? { codes: [], end: null };
        if (contract.contract_code) current.codes.push(contract.contract_code);
        if (!current.end || (contract.end_date && contract.end_date > current.end)) {
          current.end = contract.end_date;
        }
        contractsByUnit.set(contract.unit_id, current);
      }

      const unitIds = Array.from(contractsByUnit.keys());
      if (unitIds.length === 0) {
        return {
          units: [],
          summary: { organizations: 0, units: 0, activeEmployees: 0 },
        };
      }

      const [{ data: units, error: unitsError }, { data: primaryCandidates, error: primaryError }, { data: candidateLinks, error: linksError }] = await Promise.all([
        supabase
          .from("units")
          .select("id, code, name, location, customer_id")
          .in("id", unitIds),
        supabase
          .from("candidates")
          .select("id, unit_id")
          .in("unit_id", unitIds)
          .eq("is_enabled", true)
          .in("status", [...ACTIVE_EMPLOYEE_STATUSES]),
        supabase
          .from("candidate_units")
          .select("candidate_id, unit_id")
          .in("unit_id", unitIds),
      ]);

      if (unitsError) throw unitsError;
      if (primaryError) throw primaryError;
      if (linksError) throw linksError;

      const linkCandidateIds = Array.from(new Set((candidateLinks ?? []).map((link) => link.candidate_id)));
      let linkedCandidates: Array<{ id: string }> = [];

      if (linkCandidateIds.length > 0) {
        const { data: linkedRows, error: linkedError } = await supabase
          .from("candidates")
          .select("id")
          .in("id", linkCandidateIds)
          .eq("is_enabled", true)
          .in("status", [...ACTIVE_EMPLOYEE_STATUSES]);

        if (linkedError) throw linkedError;
        linkedCandidates = linkedRows ?? [];
      }

      const activeLinkedCandidateIds = new Set(linkedCandidates.map((candidate) => candidate.id));
      const employeesByUnit = new Map<string, Set<string>>();

      for (const candidate of primaryCandidates ?? []) {
        if (!candidate.unit_id) continue;
        if (!employeesByUnit.has(candidate.unit_id)) employeesByUnit.set(candidate.unit_id, new Set());
        employeesByUnit.get(candidate.unit_id)!.add(candidate.id);
      }

      for (const link of candidateLinks ?? []) {
        if (!activeLinkedCandidateIds.has(link.candidate_id)) continue;
        if (!employeesByUnit.has(link.unit_id)) employeesByUnit.set(link.unit_id, new Set());
        employeesByUnit.get(link.unit_id)!.add(link.candidate_id);
      }

      const customerIds = Array.from(new Set((units ?? []).map((unit) => unit.customer_id).filter(Boolean))) as string[];
      const { data: customers, error: customersError } = await supabase
        .from("customers")
        .select("id, name")
        .in("id", customerIds.length ? customerIds : ["00000000-0000-0000-0000-000000000000"]);

      if (customersError) throw customersError;

      const customerMap = new Map((customers ?? []).map((customer) => [customer.id, customer.name]));

      const rows: UnitRow[] = (units ?? [])
        .map((unit) => ({
          id: unit.id,
          code: unit.code,
          name: unit.name,
          location: unit.location || "",
          customer_name: (unit.customer_id && customerMap.get(unit.customer_id)) || "—",
          contract_codes: contractsByUnit.get(unit.id)?.codes ?? [],
          contract_end: contractsByUnit.get(unit.id)?.end ?? null,
          active_employee_count: employeesByUnit.get(unit.id)?.size ?? 0,
        }))
        .sort((a, b) => {
          if (a.customer_name !== b.customer_name) return a.customer_name.localeCompare(b.customer_name);
          return (a.name || a.code).localeCompare(b.name || b.code);
        });

      return {
        units: rows,
        summary: {
          organizations: new Set(rows.map((row) => row.customer_name)).size,
          units: rows.length,
          activeEmployees: rows.reduce((sum, row) => sum + row.active_employee_count, 0),
        },
      };
    },
  });

  const units = data?.units ?? [];
  const summary = data?.summary ?? { organizations: 0, units: 0, activeEmployees: 0 };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return units;
    return units.filter((unit) =>
      [unit.customer_name, unit.name, unit.code, unit.location, ...unit.contract_codes]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [q, units]);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Attendance"
        description="Track active organizations, units, and the active employees mapped to each unit before opening the monthly muster roll."
        crumbs={[{ label: "Attendance" }]}
      />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <SummaryTile icon={Building2} label="Organizations" value={summary.organizations} accent="organization" />
        <SummaryTile icon={MapPinned} label="Units" value={summary.units} accent="unit" />
        <SummaryTile icon={Users} label="Active employees" value={summary.activeEmployees} accent="employee" />
      </div>

      <div className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm shadow-stone-200/40 dark:shadow-black/20">
        <div className="flex flex-col gap-4 border-b border-border/60 px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">Attendance unit register</h2>
            <p className="text-sm text-muted-foreground">
              Open any unit to view its month-wise muster roll with mapped active employees.
            </p>
          </div>

          <div className="relative w-full max-w-lg">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search by organization, unit, code, location, or contract"
              className="h-11 rounded-xl border-border/60 bg-background pl-10"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full table-auto">
            <thead className="border-b border-border/60 bg-secondary/40">
              <tr className="text-left text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <th className="px-5 py-4 font-medium">Organization</th>
                <th className="px-5 py-4 font-medium">Unit</th>
                <th className="px-5 py-4 font-medium">Code</th>
                <th className="px-5 py-4 font-medium">Location</th>
                <th className="px-5 py-4 font-medium">Contracts</th>
                <th className="px-5 py-4 text-right font-medium">Active employees</th>
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
                    {units.length === 0 ? "No units with active contracts yet." : `No units match “${q}”.`}
                  </td>
                </tr>
              ) : (
                filtered.map((unit) => (
                  <tr key={unit.id} className="group transition-colors hover:bg-amber-50/30 dark:hover:bg-amber-500/5">
                    <td className="px-5 py-4 align-top">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/12 text-accent">
                          <Building2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-foreground">{unit.customer_name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">Principal employer</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <div className="min-w-[220px]">
                        <div className="text-sm font-semibold text-foreground">{unit.name || unit.code}</div>
                        <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <ClipboardList className="h-3.5 w-3.5" /> Attendance ready
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <span className="inline-flex rounded-md bg-secondary px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-foreground">
                        {unit.code || "—"}
                      </span>
                    </td>
                    <td className="px-5 py-4 align-top text-sm text-muted-foreground">
                      {unit.location || "—"}
                    </td>
                    <td className="px-5 py-4 align-top">
                      <div className="flex max-w-[240px] flex-wrap gap-1.5">
                        {unit.contract_codes.length > 0 ? (
                          unit.contract_codes.map((contractCode) => (
                            <span
                              key={contractCode}
                              className="inline-flex rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent"
                            >
                              {contractCode}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right align-top">
                      <div className="text-2xl font-semibold tracking-tight text-foreground">{unit.active_employee_count}</div>
                      <div className="text-xs text-muted-foreground">active employees</div>
                    </td>
                    <td className="px-5 py-4 text-right align-top">
                      <Link
                        to="/admin/attendance/$unitId"
                        params={{ unitId: unit.id }}
                        className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:border-accent/50 hover:text-accent"
                      >
                        Open roll
                        <ArrowRight className="h-4 w-4" />
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