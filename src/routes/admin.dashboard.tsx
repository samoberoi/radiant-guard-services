import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Building2, Briefcase, CalendarDays, ChevronLeft, ChevronRight,
  ClipboardList, Files, Fuel, PackageOpen, Receipt, TrendingDown, TrendingUp,
  UserPlus, Wallet, Warehouse, AlertTriangle, ArrowRight, Sparkles,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { DashboardShell } from "@/components/LiveFeed";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { GradientBarChart } from "@/components/charts/GradientBarChart";
import { RadialGauge } from "@/components/charts/RadialGauge";
import { useCountUp } from "@/hooks/useCountUp";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentPermissions } from "@/lib/rbac";
import { InventoryOwnerDashboard } from "./admin.inventory.dashboard";
import {
  fmtINR,
  computeAttendanceTotals,
  computeWages,
  type AttendanceCodeLike,
  type AttendanceEntryLike,
  type ContractResourceLike,
} from "@/lib/payroll-calc";
import { fetchAttendanceEntriesForPeriod } from "@/lib/attendance-fetch";

export const Route = createFileRoute("/admin/dashboard")({
  component: DashboardPage,
});

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type PnLRow = {
  unit_id: string;
  unit_code: string;
  unit_name: string;
  customer_name: string;
  contract_value: number;
  invoice_amount: number;
  payroll_cost: number;
  variance: number;
  variance_pct: number;
};

function DashboardPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const { can, isLoading: permsLoading } = useCurrentPermissions();
  const showInventoryDashboard =
    can("inventory") &&
    !can("organizations") &&
    !can("contracts") &&
    !can("employees") &&
    !can("vehicles") &&
    !can("attendance") &&
    !can("payroll") &&
    !can("invoice");

  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = (() => {
    const d = new Date(year, month + 1, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-snapshot", year, month],
    enabled: !permsLoading && !showInventoryDashboard,
    queryFn: async () => {
      const sixtyDaysOut = new Date();
      sixtyDaysOut.setDate(sixtyDaysOut.getDate() + 60);
      const sixtyStr = sixtyDaysOut.toISOString().slice(0, 10);
      const todayStr = new Date().toISOString().slice(0, 10);

      const [
        { count: orgsCount },
        { count: unitsCount },
        { count: empCount },
        { count: contractsActive },
        { data: contractsExpiring },
        { count: vehiclesCount },
        { data: fuelMonth },
        { count: itemsCount },
        { data: sheetsMonth },
        { data: runsMonth },
        { data: contractsForPnl },
        { data: unitsForPnl },
      ] = await Promise.all([
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("units").select("id", { count: "exact", head: true }),
        supabase.from("candidates").select("id", { count: "exact", head: true }).eq("is_enabled", true).eq("status", "active"),
        supabase.from("client_contracts").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("client_contracts")
          .select("id, contract_code, end_date, unit_id, status")
          .eq("status", "active")
          .gte("end_date", todayStr)
          .lte("end_date", sixtyStr)
          .order("end_date", { ascending: true })
          .limit(10),
        supabase.from("vehicles").select("id", { count: "exact", head: true }),
        supabase.from("vehicle_fuel_entries").select("amount").gte("entry_date", monthStart).lte("entry_date", monthEnd),
        supabase.from("inv_items").select("id", { count: "exact", head: true }),
        supabase.from("attendance_sheets" as never).select("status").lte("period_start", monthEnd).gte("period_end", monthStart),
        supabase.from("payroll_runs" as never).select("status").lte("period_start", monthEnd).gte("period_end", monthStart),
        supabase.from("client_contracts")
          .select("id, unit_id, status, start_date, end_date")
          .eq("status", "active")
          .lte("start_date", monthEnd)
          .or(`end_date.is.null,end_date.gte.${monthStart}`),
        supabase.from("units").select("id, code, name, customer_id"),
      ]);

      const sheets = (sheetsMonth ?? []) as Array<{ status: string | null }>;
      const sheetCounts = { approved: 0, pending: 0, draft: 0, rejected: 0 };
      for (const s of sheets) {
        const v = (s.status || "").toLowerCase();
        if (v === "approved") sheetCounts.approved += 1;
        else if (v === "submitted" || v === "pending") sheetCounts.pending += 1;
        else if (v === "rejected") sheetCounts.rejected += 1;
        else sheetCounts.draft += 1;
      }
      const runs = (runsMonth ?? []) as Array<{ status: string | null }>;
      const runCounts = { approved: 0, pending: 0, draft: 0, rejected: 0 };
      for (const r of runs) {
        const v = (r.status || "").toLowerCase();
        if (v === "approved") runCounts.approved += 1;
        else if (v === "submitted") runCounts.pending += 1;
        else if (v === "rejected") runCounts.rejected += 1;
        else runCounts.draft += 1;
      }
      const fuelTotal = (fuelMonth ?? []).reduce((s: number, e: { amount: number | null }) => s + (Number(e.amount) || 0), 0);

      // ── P&L from actual attendance ────────────────────────────────────
      // Mirrors the Invoice and Payroll modules: per (candidate × designation)
      // we compute T-Days from attendance, then scale the contract resource by
      // earnedGross/contractGross. Invoice billable = earnedGross + employer
      // contributions (what the customer is billed). Payroll cost = the same
      // plus benefits (extra employee outflow the agency absorbs).
      const activeContracts = (contractsForPnl ?? []) as Array<{
        id: string;
        unit_id: string | null;
      }>;
      const contractIds = activeContracts.map((c) => c.id);
      const unitIdsInScope = Array.from(
        new Set(activeContracts.map((c) => c.unit_id).filter((v): v is string => !!v)),
      );
      const unitsById = new Map((unitsForPnl ?? []).map((u) => [u.id, u]));
      const customerIds = Array.from(
        new Set(
          (unitsForPnl ?? [])
            .filter((u) => unitIdsInScope.includes(u.id))
            .map((u) => u.customer_id)
            .filter((v): v is string => !!v),
        ),
      );
      const { data: customers } = customerIds.length
        ? await supabase.from("customers").select("id, name").in("id", customerIds)
        : { data: [] as { id: string; name: string }[] };
      const custNameById = new Map((customers ?? []).map((c) => [c.id, c.name as string]));

      // Bulk fetch resources, attendance, codes, day bases, roster.
      const emptyUuid = "00000000-0000-0000-0000-000000000000";
      const [
        { data: resourcesRaw },
        { data: codesRaw },
        { data: primaryRoster },
        { data: roleLinks },
      ] = await Promise.all([
        contractIds.length
          ? supabase
              .from("contract_resources")
              .select(
                "contract_id, designation_id, quantity, components, benefits, deductions, employer_contributions, payroll_day_base_id",
              )
              .in("contract_id", contractIds)
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
        supabase
          .from("attendance_codes")
          .select("code, counts_as_present, is_paid")
          .eq("enabled", true),
        unitIdsInScope.length
          ? supabase
              .from("candidates")
              .select("id, full_name, designation_id, unit_id")
              .in("unit_id", unitIdsInScope)
              .eq("is_enabled", true)
              .eq("status", "active")
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
        unitIdsInScope.length
          ? supabase
              .from("candidate_units")
              .select("candidate_id, unit_id")
              .in("unit_id", unitIdsInScope)
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      ]);

      type ResourceRow = {
        contract_id: string;
        designation_id: string | null;
        quantity: number | null;
        components: unknown;
        benefits: unknown;
        deductions: unknown;
        employer_contributions: unknown;
        payroll_day_base_id: string | null;
      };
      type AttRow = {
        unit_id: string;
        candidate_id: string;
        designation_id: string | null;
        entry_date: string;
        code: string;
        ot_hours: number | string | null;
      };
      const resources = (resourcesRaw ?? []) as ResourceRow[];
      const attendance = await fetchAttendanceEntriesForPeriod({ unitIds: unitIdsInScope, start: monthStart, end: monthEnd, includeUnitId: true }) as AttRow[];
      const codes = (codesRaw ?? []) as AttendanceCodeLike[];
      const primaryCands = (primaryRoster ?? []) as Array<{
        id: string; full_name: string | null; designation_id: string | null; unit_id: string | null;
      }>;
      const links = (roleLinks ?? []) as Array<{ candidate_id: string; unit_id: string }>;

      // Payroll day bases.
      const pdbIds = Array.from(
        new Set(resources.map((r) => r.payroll_day_base_id).filter((v): v is string => !!v)),
      );
      const { data: pdbs } = pdbIds.length
        ? await supabase
            .from("payroll_day_bases")
            .select("id, method, fixed_days, weekly_off_day")
            .in("id", pdbIds)
        : { data: [] as Array<{ id: string; method: string; fixed_days: number | null; weekly_off_day: number | null }> };
      const pdbMap = new Map<string, NonNullable<ContractResourceLike["payrollDayBase"]>>(
        (pdbs ?? []).map((p) => [
          p.id,
          {
            method: p.method as "actual_days" | "fixed_days" | "actual_minus_weekly_off",
            fixedDays: p.fixed_days,
            weeklyOffDay: p.weekly_off_day,
          },
        ]),
      );

      // Need to load secondary roster (candidates referenced via candidate_units).
      const secondaryIds = Array.from(
        new Set(links.map((l) => l.candidate_id).filter((id) => !primaryCands.some((c) => c.id === id))),
      );
      const { data: secondaryCands } = secondaryIds.length
        ? await supabase
            .from("candidates")
            .select("id, full_name, designation_id")
            .in("id", secondaryIds)
            .eq("is_enabled", true)
            .eq("status", "active")
        : { data: [] as Array<{ id: string; full_name: string | null; designation_id: string | null }> };
      const candById = new Map<string, { id: string; full_name: string | null; designation_id: string | null }>();
      for (const c of primaryCands) candById.set(c.id, c);
      for (const c of (secondaryCands ?? [])) candById.set(c.id, c);

      // Roster grouped by unit.
      const rosterByUnit = new Map<string, Set<string>>();
      for (const c of primaryCands) {
        if (!c.unit_id) continue;
        if (!rosterByUnit.has(c.unit_id)) rosterByUnit.set(c.unit_id, new Set());
        rosterByUnit.get(c.unit_id)!.add(c.id);
      }
      for (const l of links) {
        if (!candById.has(l.candidate_id)) continue;
        if (!rosterByUnit.has(l.unit_id)) rosterByUnit.set(l.unit_id, new Set());
        rosterByUnit.get(l.unit_id)!.add(l.candidate_id);
      }

      // Resources grouped by (contract_id → designation_id → resource).
      const resByContractDesig = new Map<string, Map<string, ResourceRow>>();
      for (const r of resources) {
        if (!r.designation_id) continue;
        if (!resByContractDesig.has(r.contract_id)) resByContractDesig.set(r.contract_id, new Map());
        resByContractDesig.get(r.contract_id)!.set(r.designation_id, r);
      }

      const toResource = (r: ResourceRow): ContractResourceLike => ({
        designationId: r.designation_id ?? "",
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
        payrollDayBase: r.payroll_day_base_id ? pdbMap.get(r.payroll_day_base_id) ?? null : null,
      });

      const sumArr = (v: unknown) => {
        if (!Array.isArray(v)) return 0;
        return (v as Array<{ amount?: number | string }>).reduce(
          (s, x) => s + (Number(x?.amount) || 0),
          0,
        );
      };

      // Period dates.
      const periodDates: string[] = [];
      {
        const s = new Date(monthStart);
        const e = new Date(monthEnd);
        for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
          periodDates.push(d.toISOString().slice(0, 10));
        }
      }

      const pnlByUnit = new Map<string, PnLRow>();
      for (const contract of activeContracts) {
        if (!contract.unit_id) continue;
        const u = unitsById.get(contract.unit_id);
        if (!u) continue;
        const resMap = resByContractDesig.get(contract.id) ?? new Map();

        // Contract value reference: full-month projected per resource × quantity.
        // Mirrors Invoice module's projected (components + employer contributions),
        // multiplied by configured headcount.
        let contractValue = 0;
        for (const r of resMap.values()) {
          const qty = Number(r.quantity) || 0;
          contractValue += qty * (sumArr(r.components) + sumArr(r.employer_contributions));
        }

        // Actuals from attendance.
        const unitRoster = rosterByUnit.get(contract.unit_id) ?? new Set<string>();
        const unitAtt = attendance.filter((a) => a.unit_id === contract.unit_id);

        // Build (candidate, designation) pairs the same way the Invoice page does.
        const pairs = new Map<string, { candidateId: string; designationId: string | null }>();
        const pairKey = (cid: string, did: string | null) => `${cid}|${did ?? "_"}`;
        for (const cid of unitRoster) {
          const c = candById.get(cid);
          if (!c) continue;
          pairs.set(pairKey(cid, c.designation_id ?? null), {
            candidateId: cid,
            designationId: c.designation_id ?? null,
          });
        }
        for (const e of unitAtt) {
          if (!unitRoster.has(e.candidate_id)) continue;
          pairs.set(pairKey(e.candidate_id, e.designation_id), {
            candidateId: e.candidate_id,
            designationId: e.designation_id,
          });
        }

        let invoiceAmount = 0;
        let payrollCost = 0;
        for (const p of pairs.values()) {
          if (!p.designationId) continue;
          const resRow = resMap.get(p.designationId);
          if (!resRow) continue;
          const lineEntries = unitAtt
            .filter((e) => e.candidate_id === p.candidateId && (e.designation_id ?? null) === p.designationId)
            .map((e) => ({
              candidate_id: e.candidate_id,
              entry_date: e.entry_date,
              code: e.code,
              ot_hours: e.ot_hours,
            })) as AttendanceEntryLike[];
          const totals = computeAttendanceTotals(p.candidateId, periodDates, lineEntries, codes);
          const wages = computeWages(totals, toResource(resRow), periodDates.length);
          // Invoice billable mirrors Invoice module's "Actual total":
          invoiceAmount += wages.employerCost;
          // Payroll cost = same outflow + scaled benefits (paid to employee, not billed).
          const scaledBenefits =
            sumArr(resRow.benefits) * (wages.ratio || 0);
          payrollCost += wages.employerCost + scaledBenefits;
        }

        const variance = invoiceAmount - payrollCost;
        const variancePct = invoiceAmount > 0 ? (variance / invoiceAmount) * 100 : 0;
        const existing = pnlByUnit.get(u.id);
        if (existing) {
          existing.contract_value += contractValue;
          existing.invoice_amount += invoiceAmount;
          existing.payroll_cost += payrollCost;
          existing.variance = existing.invoice_amount - existing.payroll_cost;
          existing.variance_pct = existing.invoice_amount > 0
            ? (existing.variance / existing.invoice_amount) * 100
            : 0;
        } else {
          pnlByUnit.set(u.id, {
            unit_id: u.id,
            unit_code: u.code,
            unit_name: u.name,
            customer_name: (u.customer_id && custNameById.get(u.customer_id)) || "—",
            contract_value: contractValue,
            invoice_amount: invoiceAmount,
            payroll_cost: payrollCost,
            variance,
            variance_pct: variancePct,
          });
        }
      }
      void emptyUuid;
      const pnlRows = Array.from(pnlByUnit.values()).sort((a, b) => b.contract_value - a.contract_value);
      const pnlTotals = pnlRows.reduce(
        (s, r) => ({ contract: s.contract + r.contract_value, invoice: s.invoice + r.invoice_amount, payroll: s.payroll + r.payroll_cost }),
        { contract: 0, invoice: 0, payroll: 0 },
      );

      return {
        orgs: orgsCount ?? 0,
        units: unitsCount ?? 0,
        employees: empCount ?? 0,
        contractsActive: contractsActive ?? 0,
        contractsExpiring: contractsExpiring ?? [],
        vehicles: vehiclesCount ?? 0,
        fuelTotal,
        items: itemsCount ?? 0,
        sheetCounts,
        runCounts,
        pnlRows,
        pnlTotals,
      };
    },
  });

  const shift = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear()); setMonth(d.getMonth());
  };
  const isCurrent = now.getFullYear() === year && now.getMonth() === month;

  const tiles = useMemo(() => {
    const t: { key: string; module: string; node: React.ReactNode }[] = [];
    if (data) {
      if (can("organizations")) t.push({ key: "orgs", module: "organizations", node: <MetricTile icon={Building2} label="Organizations" value={data.orgs} accent="rose" to="/admin/customers" /> });
      if (can("organizations")) t.push({ key: "units", module: "organizations", node: <MetricTile icon={Warehouse} label="Units" value={data.units} accent="cyan" to="/admin/customers/unit-manager" /> });
      if (can("contracts")) t.push({ key: "contracts", module: "contracts", node: (
        <ContractsTile active={data.contractsActive} expiring={data.contractsExpiring} />
      )});
      if (can("employees")) t.push({ key: "emp", module: "employees", node: <MetricTile icon={UserPlus} label="Employees" value={data.employees} accent="lime" to="/admin/employees" /> });
      if (can("vehicles")) t.push({ key: "veh", module: "vehicles", node: (
        <DualTile icon={Briefcase} label="Vehicles" primary={data.vehicles} primaryLabel="In fleet" secondary={fmtINR(data.fuelTotal)} secondaryLabel="Spend this month" accent="violet" to="/admin/vehicles/inventory" />
      )});
      if (can("inventory")) t.push({ key: "inv", module: "inventory", node: <MetricTile icon={PackageOpen} label="Inventory SKUs" value={data.items} accent="amber" to="/admin/inventory/stock" /> });
      if (can("attendance")) t.push({ key: "att", module: "attendance", node: (
        <StatusTile icon={ClipboardList} label="Attendance" approved={data.sheetCounts.approved} pending={data.sheetCounts.pending} draft={data.sheetCounts.draft} rejected={data.sheetCounts.rejected} accent="emerald" to="/admin/attendance" />
      )});
      if (can("payroll")) t.push({ key: "pay", module: "payroll", node: (
        <StatusTile icon={Wallet} label="Payroll" approved={data.runCounts.approved} pending={data.runCounts.pending} draft={data.runCounts.draft} rejected={data.runCounts.rejected} accent="sky" to="/admin/payroll" />
      )});
      if (can("invoice")) t.push({ key: "inv2", module: "invoice", node: (
        <StatusTile icon={Receipt} label="Invoicing" approved={data.sheetCounts.approved} pending={data.sheetCounts.pending + data.sheetCounts.draft + data.sheetCounts.rejected} draft={0} rejected={0} accent="indigo" approvedLabel="Ready" pendingLabel="Awaiting" to="/admin/invoice" />
      )});
    }
    return t;
  }, [data, can]);

  const showPnL = can("payroll") && can("invoice");

  if (permsLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-muted-foreground">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground/70" />
      </div>
    );
  }

  if (showInventoryDashboard) {
    return (
      <div className="p-4 sm:p-6">
        <DashboardShell>
          <PageHeader
            title="Inventory Dashboard"
            description="Live inventory overview with stock value, quantities, procurement, transfers, and issuances."
            crumbs={[{ label: "Dashboard" }]}
          />
          <InventoryOwnerDashboard />
        </DashboardShell>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <DashboardShell>
      <PageHeader
        title="Dashboard"
        description="Live snapshot of everything you have access to — tiles, counts, and P&L for the selected cycle."
        crumbs={[{ label: "Dashboard" }]}
      />

      {/* Month hero — light glass, matches tile system */}
      <div className="relative overflow-hidden rounded-[28px] border border-border/70 bg-card/85 p-6 backdrop-blur-xl shadow-[0_1px_0_0_rgba(255,255,255,0.7)_inset,0_20px_60px_-30px_rgba(10,20,40,0.18)] sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[oklch(0.7_0.16_262/0.18)] blur-3xl" />
        <div className="pointer-events-none absolute -left-20 -bottom-24 h-64 w-64 rounded-full bg-[oklch(0.75_0.12_200/0.15)] blur-3xl" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />

        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-accent" /> Leadership snapshot
            </div>
            <div className="flex items-end gap-3">
              <div className="font-display text-5xl font-bold tracking-tight text-foreground sm:text-6xl">{MONTH_NAMES[month]}</div>
              <div className="pb-2 text-2xl font-semibold text-muted-foreground/80">{year}</div>
              {isCurrent && (
                <span className="mb-2 inline-flex rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent ring-1 ring-inset ring-accent/30">
                  Current
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border/70 bg-background/60 p-1.5 backdrop-blur">
            <button onClick={() => shift(-1)} className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Previous"><ChevronLeft className="h-4 w-4" /></button>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="h-8 w-[130px] rounded-xl border-0 bg-transparent shadow-none hover:bg-muted focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTH_NAMES.map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <div className="h-5 w-px bg-border/70" />
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-8 w-[92px] rounded-xl border-0 bg-transparent shadow-none hover:bg-muted focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>{Array.from({ length: 7 }, (_, i) => now.getFullYear() - 3 + i).map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <button onClick={() => shift(1)} className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Next"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {/* Tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-[22px] border border-border/60 bg-card" />
          ))
        ) : (
          tiles.map((t, i) => (
            <motion.div
              key={t.key}
              initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.42, delay: i * 0.045, ease: [0.22, 1, 0.36, 1] }}
            >
              {t.node}
            </motion.div>
          ))
        )}
      </div>

      {/* Insights — gradient chart + speedometer (each gated by RBAC) */}
      {(() => {
        if (isLoading || !data) return null;
        const showInvoiceChart = can("invoice") && data.pnlRows.length > 0;
        const sheetTotal = data.sheetCounts.approved + data.sheetCounts.pending + data.sheetCounts.draft + data.sheetCounts.rejected;
        const showGauge = can("attendance") && sheetTotal > 0;
        if (!showInvoiceChart && !showGauge) return null;
        return (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className={`grid grid-cols-1 gap-4 ${showInvoiceChart && showGauge ? "lg:grid-cols-3" : "lg:grid-cols-1"}`}
          >
            {showInvoiceChart && (
              <div className={`glass relative overflow-hidden rounded-3xl p-5 ${showGauge ? "lg:col-span-2" : ""}`}>
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Top units · this cycle</div>
                    <div className="font-display text-lg font-semibold tracking-tight text-foreground">{can("payroll") ? "Invoice vs Payroll" : "Invoice"}</div>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[oklch(0.55_0.22_255)]" /> Invoice</span>
                    {can("payroll") && <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[oklch(0.85_0.18_95)]" /> Payroll</span>}
                  </div>
                </div>
                <GradientBarChart
                  id="dash-invoice"
                  data={data.pnlRows.slice(0, 7).map((r) => ({
                    label: (r.unit_code || r.unit_name || "").slice(0, 8),
                    value: Math.round(r.invoice_amount),
                  }))}
                  formatValue={(n) => n >= 100000 ? `${(n / 100000).toFixed(1)}L` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n)}
                  height={240}
                />
              </div>
            )}
            {showGauge && (
              <div className="glass relative flex flex-col items-center justify-center overflow-hidden rounded-3xl p-5">
                <div className="mb-2 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Approval rate</div>
                  <div className="font-display text-lg font-semibold tracking-tight text-foreground">Cycle health</div>
                </div>
                <RadialGauge
                  value={sheetTotal === 0 ? 0 : Math.round((data.sheetCounts.approved / sheetTotal) * 100)}
                  label="Attendance approved"
                  sublabel={`${data.sheetCounts.approved} of ${sheetTotal} sheets`}
                  size={220}
                />
              </div>
            )}
          </motion.div>
        );
      })()}

      {/* P&L */}
      {showPnL && (
        <div className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(10,10,10,0.03),0_20px_50px_-30px_rgba(10,20,40,0.15)]">
          <div className="flex flex-col gap-3 border-b border-border/50 px-6 py-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl space-y-1">
              <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">P&amp;L — {MONTH_NAMES[month]} {year}</h2>
              <p className="text-[13px] leading-relaxed text-muted-foreground">Invoice &amp; payroll are computed from attendance. Contract value is the full-month projection. Variance = invoice − payroll cost.</p>
            </div>
            {data && (
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-4 lg:flex lg:flex-col lg:items-end lg:gap-1">
                <div className="flex items-center justify-between gap-3 lg:gap-4"><span className="text-muted-foreground">Contract</span><span className="num font-semibold">{fmtINR(data.pnlTotals.contract)}</span></div>
                <div className="flex items-center justify-between gap-3 lg:gap-4"><span className="text-muted-foreground">Invoice</span><span className="num font-semibold">{fmtINR(data.pnlTotals.invoice)}</span></div>
                <div className="flex items-center justify-between gap-3 lg:gap-4"><span className="text-muted-foreground">Payroll</span><span className="num font-semibold">{fmtINR(data.pnlTotals.payroll)}</span></div>
                <div className="flex items-center justify-between gap-3 lg:gap-4">
                  <span className="text-muted-foreground">Variance</span>
                  <span className={`num font-semibold ${(data.pnlTotals.invoice - data.pnlTotals.payroll) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmtINR(data.pnlTotals.invoice - data.pnlTotals.payroll)}</span>
                </div>
              </div>
            )}
          </div>
          <div className="overflow-x-clip">
            <table className="ios-table min-w-[1040px]">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[20%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
                <col className="w-[180px]" />
                <col className="w-[64px]" />
              </colgroup>
              <thead>
                <tr>
                  <th className="text-left">Unit</th>
                  <th className="text-left">Organization</th>
                  <th className="text-right">Contract</th>
                  <th className="text-right">Invoice</th>
                  <th className="text-right">Payroll</th>
                  <th className="text-right">Variance</th>
                  <th className="text-right" aria-label="Action" />
                </tr>
              </thead>
              <tbody>
                {(data?.pnlRows ?? []).length === 0 ? (
                  <tr><td colSpan={7} className="px-5 py-16 text-center text-sm text-muted-foreground">No active contracts for this period.</td></tr>
                ) : (
                  (data?.pnlRows ?? []).map((r) => {
                    const pos = r.variance >= 0;
                    return (
                      <tr key={r.unit_id} className="group">
                        <td>
                          <div className="text-[14px] font-semibold leading-tight text-foreground">{r.unit_name || r.unit_code}</div>
                          <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">{r.unit_code}</div>
                        </td>
                        <td className="text-[13px] text-muted-foreground">{r.customer_name}</td>
                        <td className="num text-right text-muted-foreground">{fmtINR(r.contract_value)}</td>
                        <td className="num text-right text-foreground">{fmtINR(r.invoice_amount)}</td>
                        <td className="num text-right text-foreground">{fmtINR(r.payroll_cost)}</td>
                        <td className="text-right">
                          <span className={`inline-flex w-full max-w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold num ring-1 ring-inset ${pos ? "bg-emerald-50 text-emerald-700 ring-emerald-200/70" : "bg-rose-50 text-rose-700 ring-rose-200/70"}`}>
                            {pos ? <TrendingUp className="h-3 w-3 shrink-0" /> : <TrendingDown className="h-3 w-3 shrink-0" />}
                            <span>{fmtINR(r.variance)}</span>
                            <span className="opacity-60">({r.variance_pct.toFixed(1)}%)</span>
                          </span>
                        </td>
                        <td className="text-right">
                          <Link
                            to="/admin/payroll/$unitId"
                            params={{ unitId: r.unit_id }}
                            search={{ start: monthStart, end: monthEnd }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition group-hover:bg-accent/10 group-hover:text-accent hover:scale-105"
                            aria-label="Open unit"
                          >
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </DashboardShell>
    </div>
  );
}

/* -------------------- Tiles — unified clean layout -------------------- */

function Shell({ children, to }: { children: React.ReactNode; to: string }) {
  return (
    <Link to={to} className="group tile tile-interactive">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
      {children}
    </Link>
  );
}

function TileHeader({ Icon }: { Icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center justify-between">
      <div className="tile-icon">
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <ArrowRight className="h-4 w-4 -translate-x-1 text-muted-foreground/40 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:text-accent group-hover:opacity-100" />
    </div>
  );
}

function TileLabel({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{children}</div>;
}

function MetricTile({ icon, label, value, to }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; accent?: string; to: string }) {
  const display = useCountUp(value);
  return (
    <Shell to={to}>
      <TileHeader Icon={icon} />
      <TileLabel>{label}</TileLabel>
      <div className="mt-1 font-display text-[38px] font-bold leading-none tabular-nums tracking-tight text-foreground">
        {display}
      </div>
      <div className="mt-auto pt-3 text-xs font-medium text-muted-foreground">Open →</div>
    </Shell>
  );
}

function DualTile({ icon, label, primary, primaryLabel, secondary, secondaryLabel, to }: {
  icon: React.ComponentType<{ className?: string }>; label: string;
  primary: number; primaryLabel: string;
  secondary: string; secondaryLabel: string;
  accent?: string; to: string;
}) {
  const display = useCountUp(primary);
  return (
    <Shell to={to}>
      <TileHeader Icon={icon} />
      <TileLabel>{label}</TileLabel>
      <div className="mt-1 font-display text-[32px] font-bold leading-none tabular-nums tracking-tight text-foreground">{display}</div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{primaryLabel}</div>
      <div className="mt-auto flex items-center justify-between border-t border-border/50 pt-3">
        <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{secondaryLabel}</span>
        <span className="flex items-center gap-1 font-display text-sm font-semibold tabular-nums text-foreground">
          <Fuel className="h-3.5 w-3.5 text-muted-foreground" />{secondary}
        </span>
      </div>
    </Shell>
  );
}

function StatusTile({ icon, label, approved, pending, draft, rejected, approvedLabel = "Approved", pendingLabel = "Pending", to }: {
  icon: React.ComponentType<{ className?: string }>; label: string;
  approved: number; pending: number; draft: number; rejected: number;
  accent?: string; approvedLabel?: string; pendingLabel?: string; to: string;
}) {
  const total = Math.max(approved + pending + draft + rejected, 1);
  return (
    <Shell to={to}>
      <TileHeader Icon={icon} />
      <TileLabel>{label}</TileLabel>
      <div className="mt-1 grid grid-cols-2 gap-3">
        <div>
          <div className="font-display text-3xl font-bold tabular-nums leading-none text-emerald-600">{approved}</div>
          <div className="mt-1.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{approvedLabel}</div>
        </div>
        <div>
          <div className="font-display text-3xl font-bold tabular-nums leading-none text-amber-600">{pending}</div>
          <div className="mt-1.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{pendingLabel}</div>
        </div>
      </div>
      <div className="mt-auto flex h-1 overflow-hidden rounded-full bg-secondary">
        {approved > 0 && <div className="bg-emerald-500" style={{ width: `${(approved / total) * 100}%` }} />}
        {pending > 0 && <div className="bg-amber-500" style={{ width: `${(pending / total) * 100}%` }} />}
        {draft > 0 && <div className="bg-sky-500" style={{ width: `${(draft / total) * 100}%` }} />}
        {rejected > 0 && <div className="bg-rose-500" style={{ width: `${(rejected / total) * 100}%` }} />}
      </div>
    </Shell>
  );
}

function ContractsTile({ active, expiring }: { active: number; expiring: Array<{ id: string; contract_code: string | null; end_date: string | null }> }) {
  const soonest = expiring[0];
  const display = useCountUp(active);
  return (
    <Shell to="/admin/contracts/client-contracts">
      <TileHeader Icon={Files} />
      <TileLabel>Contracts</TileLabel>
      <div className="mt-1 font-display text-[38px] font-bold leading-none tabular-nums tracking-tight text-foreground">{display}</div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Active</div>
      <div className="mt-auto flex items-center gap-2 rounded-xl border border-amber-200/60 bg-amber-50/80 px-3 py-1.5 text-[11px] font-medium text-amber-900">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span className="leading-tight">{expiring.length === 0 ? "No renewals in next 60 days" : `${expiring.length} renewal${expiring.length === 1 ? "" : "s"} in 60 days${soonest?.end_date ? ` · soonest ${soonest.end_date}` : ""}`}</span>
      </div>
    </Shell>
  );
}
