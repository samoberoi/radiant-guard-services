import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
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
  candidate: z.string().optional(),
});

export const Route = createFileRoute("/admin/invoice/$unitId")({
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
  const { start, end, candidate: highlightCandidate } = Route.useSearch();

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

      // 2. Attendance entries (now include designation_id)
      const { data: entriesRaw } = await supabase
        .from("attendance_entries")
        .select("candidate_id, designation_id, entry_date, code, ot_hours")
        .eq("unit_id", unitId)
        .gte("entry_date", start)
        .lte("entry_date", end);
      const entries = (entriesRaw ?? []) as Array<{
        candidate_id: string;
        designation_id: string | null;
        entry_date: string;
        code: string;
        ot_hours: number | string | null;
      }>;

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

      // Make sure we know the names of any designation_ids referenced by entries
      // that weren't in the roster's primary designation list.
      const allDesigIds = new Set<string>(designationIds);
      for (const e of entries) if (e.designation_id) allDesigIds.add(e.designation_id);
      for (const r of resources) {
        const d = r.designation_id ? String(r.designation_id) : "";
        if (d) allDesigIds.add(d);
      }
      if (allDesigIds.size > 0) {
        const { data: extraDs } = await supabase
          .from("designations")
          .select("id, name")
          .in("id", Array.from(allDesigIds));
        for (const d of extraDs ?? []) desigMap.set(d.id, d.name as string);
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

      // 4. Build line items per (candidate, designation_id).
      // Each candidate gets a primary line (their own designation) plus an extra
      // line for any other designation found in their attendance entries.
      const rosterById = new Map(roster.map((c) => [c.id, c]));
      const pairKey = (cid: string, did: string | null) => `${cid}|${did ?? "__none__"}`;
      const pairs = new Map<string, { candidateId: string; designationId: string | null }>();

      for (const c of roster) {
        const k = pairKey(c.id, c.designation_id ?? null);
        pairs.set(k, { candidateId: c.id, designationId: c.designation_id ?? null });
      }
      for (const e of entries) {
        if (!rosterById.has(e.candidate_id)) continue;
        const k = pairKey(e.candidate_id, e.designation_id);
        if (!pairs.has(k)) pairs.set(k, { candidateId: e.candidate_id, designationId: e.designation_id });
      }

      const rows = Array.from(pairs.values()).map((p) => {
        const c = rosterById.get(p.candidateId)!;
        const did = p.designationId ? String(p.designationId) : "";
        const designationName = (p.designationId && desigMap.get(p.designationId)) || "—";
        // Filter entries to just this (candidate, designation) pair so totals reflect only that line.
        const lineEntries = entries.filter(
          (e) => e.candidate_id === p.candidateId && (e.designation_id ?? null) === p.designationId,
        );
        const totals = computeAttendanceTotals(
          c.id,
          periodDates,
          lineEntries as AttendanceEntryLike[],
          (codes ?? []) as AttendanceCodeLike[],
        );
        const resource = resourceByDesignation.get(did);
        const wages = resource
          ? computeWages(totals, resource, periodDates.length)
          : null;
        const isPrimary = (c.designation_id ?? null) === p.designationId;
        return {
          id: c.id,
          rowKey: pairKey(c.id, p.designationId),
          employeeCode: c.employee_code || "",
          name: c.full_name || "—",
          designation: designationName,
          designationId: p.designationId,
          isPrimary,
          totals,
          wages,
          resource: resource ?? null,
          hasContract: !!resource,
        };
      });

      rows.sort((a, b) => {
        const an = (a.employeeCode || a.name).localeCompare(b.employeeCode || b.name);
        if (an !== 0) return an;
        // primary first, then by designation name
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return a.designation.localeCompare(b.designation);
      });

      return rows;
    },
  });



  const rows = data ?? [];

  useEffect(() => {
    if (!highlightCandidate || rows.length === 0) return;
    const el = document.getElementById(`payroll-row-${highlightCandidate}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightCandidate, rows.length]);



  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        if (!r.wages) return acc;
        const projTotal =
          (r.resource?.components.reduce((s, c) => s + (Number(c.amount) || 0), 0) ?? 0) +
          (r.resource?.employerContributions.reduce((s, c) => s + (Number(c.amount) || 0), 0) ?? 0);
        acc.projectedTotal += projTotal;
        acc.actualTotal += r.wages.employerCost;
        acc.tDays += r.totals.tDays;
        acc.otHours += r.totals.otHours;
        return acc;
      },
      { projectedTotal: 0, actualTotal: 0, tDays: 0, otHours: 0 },
    );
  }, [rows]);

  const exportCsv = () => {
    const headers = [
      "Emp ID", "Name", "Designation", "P Days", "PH Days", "OT Hrs", "OT Days", "T Days",
      "Projected Total (Billable)", "Actual Total (Billable)", "Shortfall",
    ];
    const lines = [headers.join(",")];
    for (const r of rows) {
      const w = r.wages;
      const projTotal = r.resource
        ? r.resource.components.reduce((s, c) => s + (Number(c.amount) || 0), 0) +
          r.resource.employerContributions.reduce((s, c) => s + (Number(c.amount) || 0), 0)
        : 0;
      const actualTotal = w?.employerCost ?? 0;
      const shortfall = w ? Math.round((projTotal - actualTotal) * 100) / 100 : "";
      lines.push(
        [
          r.employeeCode, JSON.stringify(r.name), JSON.stringify(r.designation),
          r.totals.pDays, r.totals.phDays, r.totals.otHours, r.totals.otDays, r.totals.tDays,
          projTotal, actualTotal, shortfall,
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoice-${unit?.code ?? unitId}-${start}-${end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };


  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/admin/invoice"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Back to invoice units
        </Link>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="mr-1.5 h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Customer invoice</div>
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

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="T Days" value={String(Math.round(totals.tDays * 100) / 100)} />
          <Stat label="OT hours" value={String(Math.round(totals.otHours * 100) / 100)} />
          <Stat label="Projected total" value={fmtINR(totals.projectedTotal)} />
          <Stat label="Actual billable total" value={fmtINR(totals.actualTotal)} tone="emerald" />
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
                <th className="px-4 py-3 text-right font-medium" title="Full billable total — what would be invoiced for full attendance">Projected total</th>
                <th className="px-4 py-3 text-right font-medium" title="Per-day × T Days — actual billable total based on attendance">Actual total</th>
                <th className="px-4 py-3 text-right font-medium" title="Projected − Actual (not billable due to absence)">Shortfall</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">Computing invoice…</td></tr>
              ) : error ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-destructive">{error instanceof Error ? error.message : "Failed"}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No employees mapped to this unit.</td></tr>
              ) : rows.map((r) => {
                const isHighlighted = highlightCandidate === r.id;
                const projTotal = r.resource
                  ? r.resource.components.reduce((s, c) => s + (Number(c.amount) || 0), 0) +
                    r.resource.employerContributions.reduce((s, c) => s + (Number(c.amount) || 0), 0)
                  : 0;
                const actualTotal = r.wages?.employerCost ?? 0;
                const shortfall = r.wages ? Math.round((projTotal - actualTotal) * 100) / 100 : 0;
                return (
                <tr
                  key={r.rowKey}
                  id={`invoice-row-${r.rowKey}`}
                  className={`hover:bg-muted/40 ${isHighlighted ? "bg-emerald-50 ring-2 ring-emerald-400 dark:bg-emerald-950/40" : ""}`}
                >
                  <td className="px-4 py-3 font-mono text-xs">{r.employeeCode || "—"}</td>
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.designation}</td>
                  <td className="px-4 py-3 text-right">{r.totals.tDays}</td>
                  <td className="px-4 py-3 text-right">{r.totals.otHours}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{r.wages ? fmtINR(projTotal) : <span className="text-xs text-amber-600">no contract</span>}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700">{r.wages ? fmtINR(actualTotal) : "—"}</td>
                  <td className={`px-4 py-3 text-right ${shortfall > 0 ? "text-rose-600" : "text-muted-foreground"}`}>{r.wages ? (shortfall > 0 ? `− ${fmtINR(shortfall)}` : fmtINR(0)) : "—"}</td>
                </tr>
                );
              })}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t border-border/60 bg-secondary/30 text-sm font-semibold">
                <tr>
                  <td className="px-4 py-3" colSpan={5}>Totals</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{fmtINR(totals.projectedTotal)}</td>
                  <td className="px-4 py-3 text-right text-emerald-700">{fmtINR(totals.actualTotal)}</td>
                  <td className="px-4 py-3 text-right text-rose-600">− {fmtINR(Math.max(0, totals.projectedTotal - totals.actualTotal))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>


      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Invoice breakdown · projected vs actual
          </h2>
          <span className="text-xs text-muted-foreground">
            Projected column = full billable amount · Actual column = billable based on T Days
          </span>
        </div>
        {rows.filter((r) => r.wages && r.resource).map((r) => (
          <SalaryBreakdownPreview
            key={r.rowKey}
            employeeName={r.name}
            employeeCode={r.employeeCode}
            designationName={r.designation}
            tDays={r.totals.tDays}
            baseDays={r.wages!.baseDays}
            components={r.resource!.components.map((c) => ({ name: c.name, amount: Number(c.amount) || 0 }))}
            benefits={(r.resource!.benefits ?? []).map((b) => ({ name: b.name, amount: Number(b.amount) || 0 }))}
            deductions={(r.resource!.deductions ?? []).map((b) => ({ name: b.name, amount: Number(b.amount) || 0 }))}
          />
        ))}
        {rows.filter((r) => !r.wages).length > 0 && (
          <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900">
            {rows.filter((r) => !r.wages).length} employee(s) have no contract mapped for their designation and were excluded from the breakdown.
          </div>
        )}
      </div>
    </div>
  );
}

function SalaryBreakdownPreview({
  employeeName,
  employeeCode,
  designationName,
  tDays,
  baseDays,
  components,
  benefits,
  deductions,
}: {
  employeeName: string;
  employeeCode: string;
  designationName: string;
  tDays: number;
  baseDays: number;
  components: { name: string; amount: number }[];
  benefits: { name: string; amount: number }[];
  deductions: { name: string; amount: number }[];
}) {
  const componentsTotal = components.reduce((s, c) => s + c.amount, 0);
  const benefitsTotal = benefits.reduce((s, b) => s + b.amount, 0);
  const gross = componentsTotal + benefitsTotal;
  const deductionsTotal = deductions.reduce((s, b) => s + b.amount, 0);
  const netPayable = gross - deductionsTotal;

  const ratio = baseDays > 0 ? tDays / baseDays : 0;
  const earnedFor = (amount: number) => Math.round(amount * ratio * 100) / 100;
  const earnedGross = earnedFor(gross);
  const earnedDeductions = earnedFor(deductionsTotal);
  const earnedNetPayable = earnedFor(netPayable);

  const visibleComponents = components.filter((c) => c.amount > 0);
  const visibleBenefits = benefits.filter((b) => b.amount > 0);
  const visibleDeductions = deductions.filter((b) => b.amount > 0);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/40 px-4 py-2.5">
        <div>
          <h4 className="text-sm font-semibold text-foreground">
            {employeeName}
            {employeeCode && <span className="ml-2 text-xs font-mono text-muted-foreground">{employeeCode}</span>}
          </h4>
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Salary Breakdown Preview
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody className="[&_tr]:border-b [&_tr]:border-border/60 [&_td]:px-3 [&_td]:py-2">
            <tr className="bg-secondary/20">
              <td className="font-medium text-muted-foreground">Designation</td>
              <td className="text-center font-semibold">{designationName || "—"}</td>
              <td className="text-right text-muted-foreground">Total Payable Days</td>
              <td className="text-right">
                <span className="inline-block rounded bg-amber-200/70 px-2 py-0.5 font-bold text-amber-900 dark:bg-amber-300/30 dark:text-amber-100">
                  {tDays}
                </span>
              </td>
            </tr>
            <tr className="bg-muted/40">
              <td className="font-bold uppercase text-foreground">Salary Particulars</td>
              <td className="text-center font-bold">{baseDays} Days (contract)</td>
              <td />
              <td className="text-right font-bold tracking-wider">( EARNED ) Rs.</td>
            </tr>
            {visibleComponents.length === 0 && visibleBenefits.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-3 text-center text-xs text-muted-foreground">
                  No salary particulars configured.
                </td>
              </tr>
            ) : (
              <>
                {visibleComponents.map((c) => (
                  <tr key={`c-${c.name}`}>
                    <td>{c.name}</td>
                    <td className="text-center tabular-nums">{c.amount.toFixed(2)}</td>
                    <td />
                    <td className="text-right tabular-nums">{earnedFor(c.amount).toFixed(2)}</td>
                  </tr>
                ))}
                {visibleBenefits.map((b) => (
                  <tr key={`b-${b.name}`}>
                    <td>{b.name}</td>
                    <td className="text-center tabular-nums">{b.amount.toFixed(2)}</td>
                    <td />
                    <td className="text-right tabular-nums">{earnedFor(b.amount).toFixed(2)}</td>
                  </tr>
                ))}
              </>
            )}
            <tr className="bg-sky-100 font-bold dark:bg-sky-500/20">
              <td className="uppercase">TOTAL Gross Rs.</td>
              <td className="text-center tabular-nums">{gross.toFixed(2)}</td>
              <td />
              <td className="text-right text-base tabular-nums">{earnedGross.toFixed(2)}</td>
            </tr>
            <tr className="bg-muted/40">
              <td className="font-bold uppercase text-foreground">Deductions</td>
              <td />
              <td />
              <td className="text-right font-bold tracking-wider">( EARNED ) Rs.</td>
            </tr>
            {visibleDeductions.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-3 text-center text-xs text-muted-foreground">
                  No deductions configured.
                </td>
              </tr>
            ) : (
              visibleDeductions.map((b) => (
                <tr key={`d-${b.name}`}>
                  <td>{b.name}</td>
                  <td className="text-center tabular-nums">{b.amount.toFixed(2)}</td>
                  <td />
                  <td className="text-right tabular-nums">{earnedFor(b.amount).toFixed(2)}</td>
                </tr>
              ))
            )}
            <tr className="bg-rose-100 font-semibold dark:bg-rose-500/20">
              <td className="uppercase">Total Deductions Rs.</td>
              <td className="text-center tabular-nums">{deductionsTotal.toFixed(2)}</td>
              <td />
              <td className="text-right tabular-nums">{earnedDeductions.toFixed(2)}</td>
            </tr>
            <tr className="bg-cyan-100 font-bold dark:bg-cyan-500/20">
              <td className="uppercase">Total Amount (Payable) Rs.</td>
              <td className="text-center tabular-nums">{netPayable.toFixed(2)}</td>
              <td />
              <td className="text-right text-base tabular-nums">{earnedNetPayable.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>
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
