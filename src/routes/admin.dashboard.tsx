import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2, Briefcase, CalendarDays, ChevronLeft, ChevronRight,
  ClipboardList, Files, Fuel, PackageOpen, Receipt, TrendingDown, TrendingUp,
  UserPlus, Wallet, Warehouse, AlertTriangle, ArrowRight, Sparkles,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentPermissions } from "@/lib/rbac";
import {
  fmtINR,
  computeAttendanceTotals,
  computeWages,
  type AttendanceCodeLike,
  type AttendanceEntryLike,
  type ContractResourceLike,
} from "@/lib/payroll-calc";

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
  const { can } = useCurrentPermissions();

  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const monthEnd = (() => {
    const d = new Date(year, month + 1, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-snapshot", year, month],
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

      // P&L computation
      const contractIds = (contractsForPnl ?? []).map((c) => c.id);
      const unitsById = new Map((unitsForPnl ?? []).map((u) => [u.id, u]));
      const customerIds = Array.from(new Set((unitsForPnl ?? []).map((u) => u.customer_id).filter((v): v is string => !!v)));
      const { data: customers } = await supabase.from("customers").select("id, name").in("id", customerIds.length ? customerIds : ["00000000-0000-0000-0000-000000000000"]);
      const custNameById = new Map((customers ?? []).map((c) => [c.id, c.name as string]));

      type Resource = { contract_id: string; quantity: number | null; gross: number | null; benefits: unknown; employer_contributions: unknown };
      const { data: resources } = contractIds.length
        ? await supabase.from("contract_resources").select("contract_id, quantity, gross, benefits, employer_contributions").in("contract_id", contractIds)
        : { data: [] as Resource[] };

      const sumArr = (v: unknown) => {
        if (!Array.isArray(v)) return 0;
        return (v as Array<{ amount?: number | string }>).reduce((s, x) => s + (Number(x?.amount) || 0), 0);
      };

      const perContract = new Map<string, { gross: number; benefits: number; employer: number }>();
      for (const r of (resources ?? []) as Resource[]) {
        const qty = Number(r.quantity) || 0;
        const g = (Number(r.gross) || 0) * qty;
        const b = sumArr(r.benefits) * qty;
        const ec = sumArr(r.employer_contributions) * qty;
        const cur = perContract.get(r.contract_id) ?? { gross: 0, benefits: 0, employer: 0 };
        cur.gross += g; cur.benefits += b; cur.employer += ec;
        perContract.set(r.contract_id, cur);
      }

      const pnlByUnit = new Map<string, PnLRow>();
      for (const c of (contractsForPnl ?? []) as Array<{ id: string; unit_id: string | null }>) {
        if (!c.unit_id) continue;
        const u = unitsById.get(c.unit_id);
        if (!u) continue;
        const totals = perContract.get(c.id) ?? { gross: 0, benefits: 0, employer: 0 };
        const contractValue = totals.gross + totals.benefits + totals.employer;
        // Until actuals are persisted, invoice = contracted billing and payroll = gross+employer outflow.
        const invoiceAmount = contractValue;
        const payrollCost = totals.gross + totals.employer;
        const variance = invoiceAmount - payrollCost;
        const variancePct = invoiceAmount > 0 ? (variance / invoiceAmount) * 100 : 0;
        const existing = pnlByUnit.get(u.id);
        if (existing) {
          existing.contract_value += contractValue;
          existing.invoice_amount += invoiceAmount;
          existing.payroll_cost += payrollCost;
          existing.variance = existing.invoice_amount - existing.payroll_cost;
          existing.variance_pct = existing.invoice_amount > 0 ? (existing.variance / existing.invoice_amount) * 100 : 0;
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

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Dashboard"
        description="Live snapshot of everything you have access to — tiles, counts, and P&L for the selected cycle."
        crumbs={[{ label: "Dashboard" }]}
      />

      {/* Month hero */}
      <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-indigo-950 via-slate-900 to-emerald-900 p-6 text-white shadow-xl sm:p-7">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 -bottom-24 h-72 w-72 rounded-full bg-indigo-400/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" /> Leadership snapshot
            </div>
            <div className="flex items-end gap-3">
              <div className="font-display text-5xl font-bold tracking-tight sm:text-6xl">{MONTH_NAMES[month]}</div>
              <div className="pb-2 text-2xl font-semibold text-white/70">{year}</div>
              {isCurrent && (
                <span className="mb-2 inline-flex rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                  Current
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => shift(-1)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/5 hover:bg-white/15" aria-label="Previous"><ChevronLeft className="h-4 w-4" /></button>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="h-9 w-[140px] rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/15"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTH_NAMES.map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-9 w-[100px] rounded-xl border-white/15 bg-white/5 text-white hover:bg-white/15"><SelectValue /></SelectTrigger>
              <SelectContent>{Array.from({ length: 7 }, (_, i) => now.getFullYear() - 3 + i).map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <button onClick={() => shift(1)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/5 hover:bg-white/15" aria-label="Next"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {/* Tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-3xl border border-border/60 bg-card" />
          ))
        ) : (
          tiles.map((t) => <div key={t.key}>{t.node}</div>)
        )}
      </div>

      {/* P&L */}
      {showPnL && (
        <div className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
          <div className="flex flex-col gap-2 border-b border-border/60 px-5 py-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">P&amp;L — {MONTH_NAMES[month]} {year}</h2>
              <p className="text-sm text-muted-foreground">Contract value is the reference. Variance compares actual invoice amount against actual payroll cost. Positive = margin.</p>
            </div>
            {data && (
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div><span className="text-muted-foreground">Contract</span> <span className="ml-2 font-semibold tabular-nums">{fmtINR(data.pnlTotals.contract)}</span></div>
                <div><span className="text-muted-foreground">Invoice</span> <span className="ml-2 font-semibold tabular-nums">{fmtINR(data.pnlTotals.invoice)}</span></div>
                <div><span className="text-muted-foreground">Payroll</span> <span className="ml-2 font-semibold tabular-nums">{fmtINR(data.pnlTotals.payroll)}</span></div>
                <div className={(data.pnlTotals.invoice - data.pnlTotals.payroll) >= 0 ? "text-emerald-700" : "text-rose-700"}>
                  <span className="text-muted-foreground">Variance</span> <span className="ml-2 font-semibold tabular-nums">{fmtINR(data.pnlTotals.invoice - data.pnlTotals.payroll)}</span>
                </div>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto">
              <thead className="border-b border-border/60 bg-secondary/40">
                <tr className="text-left text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Unit</th>
                  <th className="px-5 py-3 font-medium">Organization</th>
                  <th className="px-5 py-3 text-right font-medium">Contract value</th>
                  <th className="px-5 py-3 text-right font-medium">Invoice amount</th>
                  <th className="px-5 py-3 text-right font-medium">Payroll cost</th>
                  <th className="px-5 py-3 text-right font-medium">Variance</th>
                  <th className="px-5 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {(data?.pnlRows ?? []).length === 0 ? (
                  <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">No active contracts for this period.</td></tr>
                ) : (
                  (data?.pnlRows ?? []).map((r) => {
                    const pos = r.variance >= 0;
                    return (
                      <tr key={r.unit_id} className="hover:bg-secondary/20">
                        <td className="px-5 py-3">
                          <div className="text-sm font-semibold">{r.unit_name || r.unit_code}</div>
                          <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{r.unit_code}</div>
                        </td>
                        <td className="px-5 py-3 text-sm">{r.customer_name}</td>
                        <td className="px-5 py-3 text-right text-sm tabular-nums text-muted-foreground">{fmtINR(r.contract_value)}</td>
                        <td className="px-5 py-3 text-right text-sm tabular-nums">{fmtINR(r.invoice_amount)}</td>
                        <td className="px-5 py-3 text-right text-sm tabular-nums">{fmtINR(r.payroll_cost)}</td>
                        <td className={`px-5 py-3 text-right text-sm font-semibold tabular-nums ${pos ? "text-emerald-700" : "text-rose-700"}`}>
                          <span className="inline-flex items-center gap-1.5">
                            {pos ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                            {fmtINR(r.variance)} <span className="text-xs opacity-70">({r.variance_pct.toFixed(1)}%)</span>
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Link to="/admin/payroll/$unitId" params={{ unitId: r.unit_id }} search={{ start: monthStart, end: monthEnd }} className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline">
                            Open <ArrowRight className="h-3 w-3" />
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
    </div>
  );
}

/* -------------------- Tiles -------------------- */

const accentMap: Record<string, string> = {
  rose: "from-rose-500/20 to-rose-500/5 text-rose-600",
  cyan: "from-cyan-500/20 to-cyan-500/5 text-cyan-600",
  lime: "from-lime-500/20 to-lime-500/5 text-lime-600",
  violet: "from-violet-500/20 to-violet-500/5 text-violet-600",
  amber: "from-amber-500/20 to-amber-500/5 text-amber-600",
  emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-600",
  sky: "from-sky-500/20 to-sky-500/5 text-sky-600",
  indigo: "from-indigo-500/20 to-indigo-500/5 text-indigo-600",
};

function Shell({ children, to }: { children: React.ReactNode; to: string }) {
  return (
    <Link to={to} className="group relative block overflow-hidden rounded-3xl border border-border/70 bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md">
      {children}
    </Link>
  );
}

function MetricTile({ icon: Icon, label, value, accent, to }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; accent: string; to: string }) {
  return (
    <Shell to={to}>
      <div className={`absolute inset-0 -z-10 bg-gradient-to-br opacity-40 ${accentMap[accent]}`} />
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${accentMap[accent]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      </div>
      <div className="mt-3 font-display text-4xl font-bold tabular-nums tracking-tight text-foreground">{value.toLocaleString()}</div>
      <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-accent">
        Open <ArrowRight className="h-3 w-3" />
      </div>
    </Shell>
  );
}

function DualTile({ icon: Icon, label, primary, primaryLabel, secondary, secondaryLabel, accent, to }: {
  icon: React.ComponentType<{ className?: string }>; label: string;
  primary: number; primaryLabel: string;
  secondary: string; secondaryLabel: string;
  accent: string; to: string;
}) {
  return (
    <Shell to={to}>
      <div className={`absolute inset-0 -z-10 bg-gradient-to-br opacity-40 ${accentMap[accent]}`} />
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${accentMap[accent]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <div className="font-display text-3xl font-bold tabular-nums tracking-tight text-foreground">{primary.toLocaleString()}</div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{primaryLabel}</div>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1 font-display text-lg font-semibold tabular-nums text-foreground"><Fuel className="h-3.5 w-3.5 text-muted-foreground" />{secondary}</div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{secondaryLabel}</div>
        </div>
      </div>
    </Shell>
  );
}

function StatusTile({ icon: Icon, label, approved, pending, draft, rejected, accent, approvedLabel = "Approved", pendingLabel = "Pending", to }: {
  icon: React.ComponentType<{ className?: string }>; label: string;
  approved: number; pending: number; draft: number; rejected: number;
  accent: string; approvedLabel?: string; pendingLabel?: string; to: string;
}) {
  const total = Math.max(approved + pending + draft + rejected, 1);
  return (
    <Shell to={to}>
      <div className={`absolute inset-0 -z-10 bg-gradient-to-br opacity-40 ${accentMap[accent]}`} />
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${accentMap[accent]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div><div className="font-display text-2xl font-bold tabular-nums text-emerald-700">{approved}</div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{approvedLabel}</div></div>
        <div><div className="font-display text-2xl font-bold tabular-nums text-amber-700">{pending}</div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{pendingLabel}</div></div>
      </div>
      <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-secondary">
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
  return (
    <Shell to="/admin/contracts/client-contracts">
      <div className={`absolute inset-0 -z-10 bg-gradient-to-br opacity-40 ${accentMap.indigo}`} />
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${accentMap.indigo}`}>
          <Files className="h-5 w-5" />
        </div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Contracts</div>
      </div>
      <div className="mt-3 font-display text-4xl font-bold tabular-nums tracking-tight text-foreground">{active.toLocaleString()}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Active</div>
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200/60 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
        <AlertTriangle className="h-3.5 w-3.5" />
        {expiring.length === 0 ? "No renewals in the next 60 days" : `${expiring.length} renewal${expiring.length === 1 ? "" : "s"} in 60 days${soonest?.end_date ? ` · soonest ${soonest.end_date}` : ""}`}
      </div>
    </Shell>
  );
}
