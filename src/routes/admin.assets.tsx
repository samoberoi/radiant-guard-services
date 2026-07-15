import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Home,
  Banknote,
  Receipt,
  CalendarClock,
  CheckCircle2,
  MapPin,
  Building2,
  Wallet,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate } from "@/lib/vehicle-helpers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/assets")({
  component: AssetsLayout,
});

function AssetsLayout() {
  const location = useLocation();
  const isHub = location.pathname === "/admin/assets" || location.pathname === "/admin/assets/";
  return isHub ? <AssetsDashboard /> : <Outlet />;
}

type Row = Record<string, unknown>;

function AssetsDashboard() {
  const assetsQ = useQuery({
    queryKey: ["dashboard", "assets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties" as never)
        .select(
          "id,house_number,city,state,configuration,carpet_area_sqft,purchase_value,current_value,enabled",
        );
      if (error) throw error;
      return (data as unknown as Row[]) ?? [];
    },
  });
  const loansQ = useQuery({
    queryKey: ["dashboard", "property_loans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_loans" as never)
        .select(
          "id,property_id,lender_name,sanctioned_amount,outstanding_amount,emi_amount,interest_rate,end_date,status,enabled",
        );
      if (error) throw error;
      return (data as unknown as Row[]) ?? [];
    },
  });
  const expensesQ = useQuery({
    queryKey: ["dashboard", "property_expenses-mtd"],
    queryFn: async () => {
      const now = new Date();
      const since = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("property_expenses" as never)
        .select("id,property_id,category,amount,expense_date")
        .gte("expense_date", since);
      if (error) throw error;
      return (data as unknown as Row[]) ?? [];
    },
  });
  const expensesYtdQ = useQuery({
    queryKey: ["dashboard", "property_expenses-ytd"],
    queryFn: async () => {
      const now = new Date();
      const since = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("property_expenses" as never)
        .select("amount,expense_date")
        .gte("expense_date", since);
      if (error) throw error;
      return (data as unknown as Row[]) ?? [];
    },
  });

  const assets = assetsQ.data ?? [];
  const loans = loansQ.data ?? [];
  const expenses = expensesQ.data ?? [];
  const ytdExpenses = expensesYtdQ.data ?? [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = (iso: string) => {
    const d = new Date(iso);
    d.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - today.getTime()) / 86400000);
  };

  const assetMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of assets) m.set(String(a.id), String(a.house_number ?? ""));
    return m;
  }, [assets]);

  const activeAssets = assets.filter((a) => a.enabled !== false);
  const totalPortfolioValue = assets.reduce(
    (s, a) => s + Number(a.current_value ?? a.purchase_value ?? 0),
    0,
  );
  const totalCarpet = assets.reduce((s, a) => s + Number(a.carpet_area_sqft ?? 0), 0);

  const activeLoans = loans.filter(
    (l) => l.enabled !== false && String(l.status ?? "active") === "active",
  );
  const totalSanctioned = activeLoans.reduce((s, l) => s + Number(l.sanctioned_amount ?? 0), 0);
  const totalOutstanding = activeLoans.reduce((s, l) => s + Number(l.outstanding_amount ?? 0), 0);
  const totalEmi = activeLoans.reduce((s, l) => s + Number(l.emi_amount ?? 0), 0);
  const avgInterest = activeLoans.length
    ? activeLoans.reduce((s, l) => s + Number(l.interest_rate ?? 0), 0) / activeLoans.length
    : 0;

  const closingSoon = activeLoans.filter((l) => {
    if (!l.end_date) return false;
    const d = diffDays(String(l.end_date));
    return d >= 0 && d <= 90;
  });

  const expenseTotal = expenses.reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const expenseYtdTotal = ytdExpenses.reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const expenseByCat = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of expenses) {
      const k = String(e.category ?? "Other");
      m[k] = (m[k] ?? 0) + Number(e.amount ?? 0);
    }
    return m;
  }, [expenses]);

  const cityMix = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of assets) {
      const k = String(a.city ?? "Unknown") || "Unknown";
      m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  }, [assets]);

  const configMix = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of assets) {
      const k = String(a.configuration ?? "Other") || "Other";
      m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  }, [assets]);

  const topSpendByProperty = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of expenses) {
      const k = String(e.property_id ?? "");
      m[k] = (m[k] ?? 0) + Number(e.amount ?? 0);
    }
    return Object.entries(m)
      .map(([id, v]) => ({ id, label: assetMap.get(id) ?? "—", value: v }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [expenses, assetMap]);

  return (
    <div>
      <PageHeader
        title="Assets"
        description="Immovable assets owned by the company — properties, loans and expenses at a glance."
        crumbs={[{ label: "Assets" }]}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Properties"
          value={assets.length}
          icon={Home}
          accent="accent"
          subtle={`${activeAssets.length} active · ${Math.round(totalCarpet).toLocaleString("en-IN")} sqft`}
          to="/admin/assets/inventory"
        />
        <StatCard
          label="Portfolio Value"
          value={Math.round(totalPortfolioValue)}
          valuePrefix="₹"
          icon={TrendingUp}
          accent="accent"
          subtle="Current / purchase value"
          to="/admin/assets/inventory"
        />
        <StatCard
          label="Active Loans"
          value={activeLoans.length}
          icon={Banknote}
          accent="accent"
          subtle={`EMI ₹${Math.round(totalEmi).toLocaleString("en-IN")}/mo · ${avgInterest.toFixed(2)}% avg`}
          to="/admin/assets/loan-manager"
        />
        <StatCard
          label="Loan Outstanding"
          value={Math.round(totalOutstanding)}
          valuePrefix="₹"
          icon={Wallet}
          accent="warning"
          subtle={`of ₹${Math.round(totalSanctioned).toLocaleString("en-IN")} sanctioned`}
          to="/admin/assets/loan-manager"
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Expenses (This Month)"
          value={Math.round(expenseTotal)}
          valuePrefix="₹"
          icon={Receipt}
          accent="accent"
          subtle={`${expenses.length} entries`}
          to="/admin/assets/expense-manager"
        />
        <StatCard
          label="Expenses (YTD)"
          value={Math.round(expenseYtdTotal)}
          valuePrefix="₹"
          icon={Receipt}
          accent="accent"
          subtle="Year to date"
          to="/admin/assets/expense-manager"
        />
        <StatCard
          label="EMI Outflow (Monthly)"
          value={Math.round(totalEmi)}
          valuePrefix="₹"
          icon={CalendarClock}
          accent="warning"
          subtle="Across active loans"
          to="/admin/assets/loan-manager"
        />
        <StatCard
          label="Loans Closing (≤90d)"
          value={closingSoon.length}
          icon={CalendarClock}
          accent={closingSoon.length > 0 ? "warning" : "accent"}
          subtle="Next 90 days"
          to="/admin/assets/loan-manager"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <BreakdownCard
          title="Expense Mix (This Month)"
          icon={Receipt}
          total={expenseTotal}
          rows={Object.entries(expenseByCat)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v], i) => ({ label: k, value: v, color: PALETTE[i % PALETTE.length] }))}
          empty="No expenses recorded this month."
          to="/admin/assets/expense-manager"
        />
        <BreakdownCard
          title="Top Properties by Spend (This Month)"
          icon={Home}
          total={expenseTotal}
          rows={topSpendByProperty.map((r, i) => ({
            label: r.label,
            value: r.value,
            color: PALETTE[i % PALETTE.length],
          }))}
          empty="No spend recorded against properties yet."
          to="/admin/assets/expense-manager"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <MixCard
          title="Property Mix by City"
          icon={MapPin}
          rows={Object.entries(cityMix).sort((a, b) => b[1] - a[1])}
          total={assets.length}
          empty="No properties yet."
        />
        <MixCard
          title="Property Mix by Configuration"
          icon={Building2}
          rows={Object.entries(configMix).sort((a, b) => b[1] - a[1])}
          total={assets.length}
          empty="No properties yet."
        />
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-accent" />
            <div className="font-display text-sm font-bold tracking-tight">
              Loans Closing in 90 days
            </div>
          </div>
          <div className="mt-3 max-h-72 overflow-y-auto">
            {closingSoon.length === 0 ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                No loans closing in the next 90 days.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {closingSoon
                  .slice()
                  .sort((a, b) => diffDays(String(a.end_date)) - diffDays(String(b.end_date)))
                  .map((l) => (
                    <li
                      key={String(l.id)}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {assetMap.get(String(l.property_id)) ?? "—"}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {String(l.lender_name ?? "")}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-medium">{fmtDate(String(l.end_date))}</div>
                        <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                          In {diffDays(String(l.end_date))}d
                        </div>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const PALETTE = [
  "hsl(220 70% 55%)",
  "hsl(265 70% 60%)",
  "hsl(150 65% 45%)",
  "hsl(35 92% 55%)",
  "hsl(200 80% 55%)",
  "hsl(0 70% 60%)",
  "hsl(180 60% 45%)",
];

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  subtle,
  to,
  valuePrefix,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: "accent" | "destructive" | "warning";
  subtle?: string;
  to: string;
  valuePrefix?: string;
}) {
  const palette =
    accent === "destructive"
      ? "bg-destructive/15 text-destructive"
      : accent === "warning"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : "bg-accent/15 text-accent";
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-border bg-card p-5 transition-colors hover:border-accent/50 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div className="mt-2 font-display text-2xl font-bold tracking-tight tabular-nums">
            {valuePrefix}
            {value.toLocaleString("en-IN")}
          </div>
          {subtle && <div className="mt-1 text-xs text-muted-foreground">{subtle}</div>}
        </div>
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-105",
            palette,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Link>
  );
}

function BreakdownCard({
  title,
  icon: Icon,
  total,
  rows,
  empty,
  to,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  total: number;
  rows: { label: string; value: number; color: string }[];
  empty: string;
  to?: string;
}) {
  const body = (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-5",
        to && "transition-colors hover:border-accent/60 hover:bg-card/80",
      )}
    >
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-accent" />
          <div className="font-display text-sm font-bold tracking-tight">{title}</div>
        </div>
        <div className="text-xs tabular-nums text-muted-foreground">
          ₹{Math.round(total).toLocaleString("en-IN")}
        </div>
      </div>
      <ul className="mt-4 space-y-3">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">{empty}</p>}
        {rows.map((r) => {
          const pct = total > 0 ? Math.round((r.value / total) * 100) : 0;
          return (
            <li key={r.label}>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 font-medium text-foreground">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                  {r.label}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  ₹{Math.round(r.value).toLocaleString("en-IN")} · {pct}%
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: r.color }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
  if (to) return <Link to={to} className="block">{body}</Link>;
  return body;
}

function MixCard({
  title,
  icon: Icon,
  rows,
  total,
  empty,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  rows: [string, number][];
  total: number;
  empty: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-accent" />
        <div className="font-display text-sm font-bold tracking-tight">{title}</div>
      </div>
      <div className="mt-4 space-y-3">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">{empty}</p>}
        {rows.map(([k, v]) => {
          const pct = total ? Math.round((v / total) * 100) : 0;
          return (
            <div key={k}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{k}</span>
                <span className="text-muted-foreground">
                  {v} · {pct}%
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
