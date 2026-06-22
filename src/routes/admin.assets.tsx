import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Home, Banknote, Receipt, CalendarClock, CheckCircle2 } from "lucide-react";
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
        .select("id,house_number,city,enabled");
      if (error) throw error;
      return (data as unknown as Row[]) ?? [];
    },
  });
  const loansQ = useQuery({
    queryKey: ["dashboard", "property_loans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_loans" as never)
        .select("id,property_id,lender_name,outstanding_amount,emi_amount,end_date,status,enabled");
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

  const assets = assetsQ.data ?? [];
  const loans = loansQ.data ?? [];
  const expenses = expensesQ.data ?? [];

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diffDays = (iso: string) => {
    const d = new Date(iso); d.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - today.getTime()) / 86400000);
  };

  const assetMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of assets) m.set(String(a.id), String(a.house_number ?? ""));
    return m;
  }, [assets]);

  const activeLoans = loans.filter((l) => l.enabled !== false && String(l.status ?? "active") === "active");
  const totalOutstanding = activeLoans.reduce((s, l) => s + Number(l.outstanding_amount ?? 0), 0);
  const totalEmi = activeLoans.reduce((s, l) => s + Number(l.emi_amount ?? 0), 0);

  const closingSoon = activeLoans.filter((l) => {
    if (!l.end_date) return false;
    const d = diffDays(String(l.end_date));
    return d >= 0 && d <= 60;
  });

  const expenseTotal = expenses.reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const expenseByCat = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of expenses) {
      const k = String(e.category ?? "Other");
      m[k] = (m[k] ?? 0) + Number(e.amount ?? 0);
    }
    return m;
  }, [expenses]);

  return (
    <div>
      <PageHeader
        title="Assets"
        description="Immovable assets owned by the company — houses, loans, and expenses."
        crumbs={[{ label: "Assets" }]}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Properties" value={assets.length} icon={Home} accent="accent" to="/admin/assets/inventory" />
        <StatCard label="Active Loans" value={activeLoans.length} icon={Banknote} accent="accent" subtle={`EMI ₹${Math.round(totalEmi).toLocaleString("en-IN")}/mo`} to="/admin/assets/loan-manager" />
        <StatCard label="Loan Outstanding" value={Math.round(totalOutstanding)} valuePrefix="₹" icon={Banknote} accent="warning" to="/admin/assets/loan-manager" />
        <StatCard label="Expenses (This Month)" value={Math.round(expenseTotal)} valuePrefix="₹" icon={Receipt} accent="accent" subtle={`${expenses.length} entries`} to="/admin/assets/expense-manager" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-accent" />
            <div className="font-display text-sm font-bold tracking-tight">Expense Mix (This Month)</div>
          </div>
          <div className="mt-4 space-y-3">
            {Object.entries(expenseByCat).length === 0 && (
              <p className="text-sm text-muted-foreground">No expenses recorded this month.</p>
            )}
            {Object.entries(expenseByCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
              const pct = expenseTotal ? Math.round((v / expenseTotal) * 100) : 0;
              return (
                <div key={k}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{k}</span>
                    <span className="tabular-nums text-muted-foreground">₹{Math.round(v).toLocaleString("en-IN")} · {pct}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-accent" />
            <div className="font-display text-sm font-bold tracking-tight">Loans Closing in 60 days</div>
          </div>
          <div className="mt-3">
            {closingSoon.length === 0 ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                No loans closing in the next 60 days.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {closingSoon.map((l) => (
                  <li key={String(l.id)} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{assetMap.get(String(l.property_id)) ?? "—"}</div>
                      <div className="truncate text-xs text-muted-foreground">{String(l.lender_name ?? "")}</div>
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

function StatCard({
  label, value, icon: Icon, accent, subtle, to, valuePrefix,
}: {
  label: string; value: number; icon: React.ComponentType<{ className?: string }>;
  accent: "accent" | "destructive" | "warning"; subtle?: string; to: string; valuePrefix?: string;
}) {
  const palette = accent === "destructive"
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
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-2 font-display text-3xl font-bold tracking-tight tabular-nums">
            {valuePrefix}{value.toLocaleString("en-IN")}
          </div>
          {subtle && <div className="mt-1 text-xs text-muted-foreground">{subtle}</div>}
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-105", palette)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Link>
  );
}
