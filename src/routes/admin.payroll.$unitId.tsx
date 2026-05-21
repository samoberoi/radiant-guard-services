import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Download } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  computeAttendanceTotals,
  computeWages,
  fmtINR,
  type AttendanceCodeLike,
  type AttendanceEntryLike,
  type ContractResourceLike,
} from "@/lib/payroll-calc";

const searchSchema = z.object({
  start: z.string(),
  end: z.string(),
});

export const Route = createFileRoute("/admin/payroll/$unitId")({
  validateSearch: (s) => searchSchema.parse(s),
  component: PayrollUnitPage,
});

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function fmtPretty(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MONTH_NAMES[m - 1].slice(0, 3)} ${y}`;
}

function buildDates(start: string, end: string): string[] {
  const out: string[] = [];
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  const cursor = new Date(ys, ms - 1, ds);
  const stop = new Date(ye, me - 1, de);
  while (cursor <= stop) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function PayrollUnitPage() {
  const { unitId } = Route.useParams();
  const { start, end } = Route.useSearch();

  const periodDates = useMemo(() => buildDates(start, end), [start, end]);

  const { data: unit } = useQuery({
    queryKey: ["payroll-unit", unitId],
    queryFn: async () => {
      const { data } = await supabase
        .from("units")
        .select("id, code, name, customer_id")
        .eq("id", unitId)
        .maybeSingle();
      if (!data) return null;
      const { data: cust } = await supabase
        .from("customers")
        .select("name")
        .eq("id", data.customer_id ?? "")
        .maybeSingle();
      return { ...data, customer_name: cust?.name ?? "" };
    },
  });

  const { data: sheet } = useQuery({
    queryKey: ["payroll-sheet", unitId, start, end],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_sheets" as never)
        .select("status, approved_at")
        .eq("unit_id", unitId)
        .eq("period_start", start)
        .eq("period_end", end)
        .maybeSingle();
      return data as unknown as { status: string; approved_at: string | null } | null;
    },
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["payroll-compute", unitId, start, end],
    queryFn: async () => {
      // 1. Roster: candidates mapped to this unit (primary + secondary).
      const [{ data: primary }, { data: links }] = await Promise.all([
        supabase
          .from("candidates")
          .select("id, employee_code, full_name, designation_id")
          .eq("unit_id", unitId)
          .eq("is_enabled", true)
          .eq("status", "active"),
        supabase.from("candidate_units").select("candidate_id").eq("unit_id", unitId),
      ]);
      const linkIds = (links ?? []).map((l) => l.candidate_id);
      let secondary: typeof primary = [];
      if (linkIds.length > 0) {
        const { data } = await supabase
          .from("candidates")
          .select("id, employee_code, full_name, designation_id")
          .in("id", linkIds)
          .eq("is_enabled", true)
          .eq("status", "active");
        secondary = data ?? [];
      }
      const roster = Array.from(
        new Map([...(primary ?? []), ...(secondary ?? [])].map((c) => [c.id, c])).values(),
      );

      const designationIds = Array.from(
        new Set(roster.map((c) => c.designation_id).filter(Boolean)),
      ) as string[];
      const { data: designations } = await supabase
        .from("designations")
        .select("id, name")
        .in("id", designationIds.length ? designationIds : ["00000000-0000-0000-0000-000000000000"]);
      const desigMap = new Map((designations ?? []).map((d) => [d.id, d.name as string]));

      // 2. Attendance entries
      const { data: entries } = await supabase
        .from("attendance_entries")
        .select("candidate_id, entry_date, code, ot_hours")
        .eq("unit_id", unitId)
        .gte("entry_date", start)
        .lte("entry_date", end);

      const { data: codes } = await supabase
        .from("attendance_codes")
        .select("code, counts_as_present, is_paid")
        .eq("enabled", true);

      // 3. Contract resources for this unit's active contract.
      const { data: contracts } = await supabase
        .from("client_contracts")
        .select("id, payroll_window_id")
        .eq("unit_id", unitId)
        .eq("record_type", "client")
        .eq("status", "active")
        .order("start_date", { ascending: false })
        .limit(1);
      const contractId = contracts?.[0]?.id;

      let resources: Record<string, unknown>[] = [];
      if (contractId) {
        const { data: r } = await supabase
          .from("contract_resources")
          .select(
            "designation_id, components, benefits, deductions, employer_contributions, payroll_day_base_id",
          )
          .eq("contract_id", contractId);
        resources = r ?? [];
      }

      const pdbIds = Array.from(
        new Set(resources.map((r) => r.payroll_day_base_id).filter(Boolean)),
      ) as string[];
      const { data: pdbs } = await supabase
        .from("payroll_day_bases")
        .select("id, method, fixed_days, weekly_off_day")
        .in("id", pdbIds.length ? pdbIds : ["00000000-0000-0000-0000-000000000000"]);
      type PdbMethod = "actual_days" | "fixed_days" | "actual_minus_weekly_off";
      const pdbMap = new Map<string, NonNullable<ContractResourceLike["payrollDayBase"]>>(
        (pdbs ?? []).map((p) => [
          p.id,
          {
            method: p.method as PdbMethod,
            fixedDays: p.fixed_days,
            weeklyOffDay: p.weekly_off_day,
          },
        ]),
      );

      const resourceByDesignation = new Map<string, ContractResourceLike>();
      for (const r of resources) {
        const did = String(r.designation_id ?? "");
        if (!did) continue;
        resourceByDesignation.set(did, {
          designationId: did,
          components: Array.isArray(r.components)
            ? (r.components as { name: string; amount: number }[]).map((c) => ({
                name: String(c.name ?? ""),
                amount: Number(c.amount) || 0,
              }))
            : [],
          benefits: Array.isArray(r.benefits) ? (r.benefits as { name: string; amount: number }[]) : [],
          deductions: Array.isArray(r.deductions) ? (r.deductions as { name: string; amount: number }[]) : [],
          employerContributions: Array.isArray(r.employer_contributions)
            ? (r.employer_contributions as { name: string; amount: number }[])
            : [],
          payrollDayBase: r.payroll_day_base_id
            ? pdbMap.get(String(r.payroll_day_base_id)) ?? null
            : null,
        });
      }

      // 4. Compute per-candidate
      const rows = roster.map((c) => {
        const did = c.designation_id ? String(c.designation_id) : "";
        const designationName = (c.designation_id && desigMap.get(c.designation_id)) || "—";
        const totals = computeAttendanceTotals(
          c.id,
          periodDates,
          (entries ?? []) as AttendanceEntryLike[],
          (codes ?? []) as AttendanceCodeLike[],
        );
        const resource = resourceByDesignation.get(did);
        const wages = resource
          ? computeWages(totals, resource, periodDates.length)
          : null;
        return {
          id: c.id,
          employeeCode: c.employee_code || "",
          name: c.full_name || "—",
          designation: designationName,
          totals,
          wages,
          resource: resource ?? null,
          hasContract: !!resource,
        };
      });

      rows.sort((a, b) => (a.employeeCode || a.name).localeCompare(b.employeeCode || b.name));

      return rows;
    },
  });


  const rows = data ?? [];

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        if (!r.wages) return acc;
        acc.earnedGross += r.wages.earnedGross;
        acc.deductions += r.wages.totalDeductions;
        acc.employerContrib += r.wages.totalEmployerContributions;
        acc.net += r.wages.netPay;
        acc.employerCost += r.wages.employerCost;
        return acc;
      },
      { earnedGross: 0, deductions: 0, employerContrib: 0, net: 0, employerCost: 0 },
    );
  }, [rows]);

  const exportCsv = () => {
    const headers = [
      "Emp ID", "Name", "Designation", "P Days", "PH Days", "OT Hrs", "OT Days", "T Days",
      "Earned Gross", "Total Deductions", "Net Pay", "Employer Contrib", "Employer Cost",
    ];
    const lines = [headers.join(",")];
    for (const r of rows) {
      const w = r.wages;
      lines.push(
        [
          r.employeeCode, JSON.stringify(r.name), JSON.stringify(r.designation),
          r.totals.pDays, r.totals.phDays, r.totals.otHours, r.totals.otDays, r.totals.tDays,
          w?.earnedGross ?? "", w?.totalDeductions ?? "",
          w?.netPay ?? "", w?.totalEmployerContributions ?? "", w?.employerCost ?? "",
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-${unit?.code ?? unitId}-${start}-${end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/admin/payroll"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Back to payroll units
        </Link>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="mr-1.5 h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Payroll computation</div>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">{unit?.name || unit?.code || "Unit"}</h1>
            <div className="mt-1 text-sm text-muted-foreground">
              {unit?.customer_name} · Period {fmtPretty(start)} – {fmtPretty(end)}
            </div>
          </div>
          {sheet?.status === "approved" && (
            <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
              Attendance approved
            </span>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Earned gross" value={fmtINR(totals.earnedGross)} />
          <Stat label="Deductions" value={fmtINR(totals.deductions)} />
          <Stat label="Net pay" value={fmtINR(totals.net)} tone="emerald" />
          <Stat label="Employer contrib" value={fmtINR(totals.employerContrib)} />
          <Stat label="Total employer cost" value={fmtINR(totals.employerCost)} tone="amber" />
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto text-sm">
            <thead className="border-b border-border/60 bg-secondary/40">
              <tr className="text-left text-xs uppercase tracking-[0.16em] text-muted-foreground">
                <th className="px-4 py-3 font-medium">Emp ID</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Designation</th>
                <th className="px-4 py-3 text-right font-medium">T Days</th>
                <th className="px-4 py-3 text-right font-medium">OT Hrs</th>
                <th className="px-4 py-3 text-right font-medium">Earned gross</th>
                <th className="px-4 py-3 text-right font-medium">Deductions</th>
                <th className="px-4 py-3 text-right font-medium">Net pay</th>
                <th className="px-4 py-3 text-right font-medium">Employer cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">Computing wages…</td></tr>
              ) : error ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-destructive">{error instanceof Error ? error.message : "Failed"}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">No employees mapped to this unit.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3 font-mono text-xs">{r.employeeCode || "—"}</td>
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.designation}</td>
                  <td className="px-4 py-3 text-right">{r.totals.tDays}</td>
                  <td className="px-4 py-3 text-right">{r.totals.otHours}</td>
                  <td className="px-4 py-3 text-right">{r.wages ? fmtINR(r.wages.earnedGross) : <span className="text-xs text-amber-600">no contract</span>}</td>
                  <td className="px-4 py-3 text-right">{r.wages ? fmtINR(r.wages.totalDeductions) : "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700">{r.wages ? fmtINR(r.wages.netPay) : "—"}</td>
                  <td className="px-4 py-3 text-right">{r.wages ? fmtINR(r.wages.employerCost) : "—"}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t border-border/60 bg-secondary/30 text-sm font-semibold">
                <tr>
                  <td className="px-4 py-3" colSpan={5}>Totals</td>
                  <td className="px-4 py-3 text-right">{fmtINR(totals.earnedGross)}</td>
                  <td className="px-4 py-3 text-right">{fmtINR(totals.deductions)}</td>
                  <td className="px-4 py-3 text-right text-emerald-700">{fmtINR(totals.net)}</td>
                  <td className="px-4 py-3 text-right">{fmtINR(totals.employerCost)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <details className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm">
        <summary className="cursor-pointer font-medium">Per-employee breakdown (components & deductions)</summary>
        <div className="mt-3 space-y-4">
          {rows.filter((r) => r.wages).map((r) => (
            <div key={r.id} className="rounded-lg border border-border/50 bg-background p-3">
              <div className="font-semibold">{r.name} <span className="ml-2 text-xs text-muted-foreground">{r.employeeCode}</span></div>
              <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3 text-xs">
                <Block title="Components">
                  {r.wages!.components.map((c) => (
                    <Row key={c.name} l={c.name} v={fmtINR(c.amount)} />
                  ))}
                </Block>
                <Block title="Deductions">
                  {r.wages!.deductions.length === 0 && <div className="text-muted-foreground">None</div>}
                  {r.wages!.deductions.map((c) => (
                    <Row key={c.name} l={c.name} v={fmtINR(c.amount)} />
                  ))}
                </Block>
                <Block title="Employer contributions">
                  {r.wages!.employerContributions.length === 0 && <div className="text-muted-foreground">None</div>}
                  {r.wages!.employerContributions.map((c) => (
                    <Row key={c.name} l={c.name} v={fmtINR(c.amount)} />
                  ))}
                </Block>
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "amber" }) {
  const cls = tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border/60 bg-background px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="truncate text-muted-foreground">{l}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
