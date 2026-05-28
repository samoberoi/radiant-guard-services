import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import {
  PackageOpen,
  ShoppingBag,
  Warehouse,
  ArrowRight,
  ClipboardList,
  PackageCheck,
  Truck,
  UserCheck,
  AlertOctagon,
  Sliders,
  BarChart3,
  Tags,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { cn } from "@/lib/utils";
import { InventoryOwnerDashboard } from "./admin.inventory.dashboard";

export const Route = createFileRoute("/admin/inventory")({
  component: InventoryLayout,
});

function InventoryLayout() {
  const location = useLocation();
  const isHub = location.pathname === "/admin/inventory" || location.pathname === "/admin/inventory/";
  if (!isHub) return <Outlet />;
  return <InventoryDashboard />;
}

function InventoryDashboard() {
  const itemsQ = useQuery({
    queryKey: ["inv", "items-count"],
    queryFn: async () => {
      const { count, error } = await supabase.from("inv_items" as never).select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
  const vendorsQ = useQuery({
    queryKey: ["inv", "vendors-count"],
    queryFn: async () => {
      const { count, error } = await supabase.from("inv_vendors" as never).select("*", { count: "exact", head: true }).eq("enabled", true);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const warehousesQ = useQuery({
    queryKey: ["inv", "warehouses-count"],
    queryFn: async () => {
      const { count, error } = await supabase.from("inv_warehouses" as never).select("*", { count: "exact", head: true }).eq("enabled", true);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const balancesQ = useQuery({
    queryKey: ["inv", "balances-sum"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_stock_balances" as never).select("location_type,qty");
      if (error) throw error;
      const rows = (data as unknown as { location_type: string; qty: number }[]) ?? [];
      const tally: Record<string, number> = { warehouse: 0, branch: 0, field_officer: 0, guard: 0 };
      for (const r of rows) tally[r.location_type] = (tally[r.location_type] ?? 0) + Number(r.qty ?? 0);
      return tally;
    },
  });

  const totalField = (balancesQ.data?.field_officer ?? 0) + (balancesQ.data?.guard ?? 0);
  const totalAll =
    (balancesQ.data?.warehouse ?? 0) +
    (balancesQ.data?.branch ?? 0) +
    (balancesQ.data?.field_officer ?? 0) +
    (balancesQ.data?.guard ?? 0);

  const steps = [
    { n: 1, t: "Purchase Order", d: "Order from vendor", to: "/admin/inventory/purchase-orders", icon: ClipboardList },
    { n: 2, t: "Goods Receipt", d: "Verify challan, stock in", to: "/admin/inventory/goods-receipts", icon: PackageCheck },
    { n: 3, t: "Transfer", d: "Warehouse → Branch", to: "/admin/inventory/transfers", icon: Truck },
    { n: 4, t: "Issuance", d: "Branch → FO → Guard", to: "/admin/inventory/issuances", icon: UserCheck },
    { n: 5, t: "Write-off", d: "Lost, damaged, fixes", to: "/admin/inventory/write-offs", icon: AlertOctagon },
  ] as const;

  const locLabels: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; tint: string }> = {
    warehouse: { label: "Warehouse", icon: Warehouse, tint: "from-sky-500/15 to-sky-500/5 text-sky-600 dark:text-sky-400" },
    branch: { label: "Branch", icon: Building2, tint: "from-violet-500/15 to-violet-500/5 text-violet-600 dark:text-violet-400" },
    field_officer: { label: "Field Officer", icon: Users, tint: "from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400" },
    guard: { label: "Guard", icon: Shield, tint: "from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400" },
  };

  const modules = [
    { to: "/admin/inventory/dashboard", label: "Owner Dashboard", hint: "Low stock, leaderboards, holdings", icon: LineChart, group: "Insights" },
    { to: "/admin/inventory/stock", label: "Stock Report", hint: "Live balances across the chain", icon: BarChart3, group: "Insights" },
    { to: "/admin/inventory/purchase-orders", label: "Purchase Orders", hint: "Order from vendors", icon: ClipboardList, group: "Procurement" },
    { to: "/admin/inventory/goods-receipts", label: "Goods Receipts", hint: "Receive into warehouse", icon: PackageCheck, group: "Procurement" },
    { to: "/admin/inventory/transfers", label: "Transfers", hint: "Warehouse ↔ Branch", icon: Truck, group: "Movement" },
    { to: "/admin/inventory/issuances", label: "Issuances", hint: "Branch → FO → Guard", icon: UserCheck, group: "Movement" },
    { to: "/admin/inventory/write-offs", label: "Write-offs", hint: "Lost / damaged", icon: AlertOctagon, group: "Movement" },
    { to: "/admin/inventory/adjustments", label: "Adjustments", hint: "Cycle counts", icon: Sliders, group: "Movement" },
    { to: "/admin/inventory/items", label: "Item Master", hint: "SKUs and sizes", icon: PackageOpen, group: "Catalog" },
    { to: "/admin/inventory/rate-cards", label: "Vendor Capability Matrix", hint: "Who supplies what · prices", icon: Tags, group: "Catalog" },
    { to: "/admin/inventory/vendors", label: "Vendors", hint: "Supplier directory", icon: ShoppingBag, group: "Catalog" },
    { to: "/admin/inventory/warehouses", label: "Warehouses", hint: "Storage locations", icon: Warehouse, group: "Catalog" },
  ];

  const groups = ["Insights", "Procurement", "Movement", "Catalog"] as const;

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="End-to-end chain of custody from vendor → warehouse → branch → field officer → guard."
        crumbs={[{ label: "Inventory" }]}
      />

      {/* Hero stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="SKUs" value={itemsQ.data ?? 0} icon={PackageOpen} to="/admin/inventory/items" tint="from-sky-500/20 via-sky-500/5 to-transparent" accent="text-sky-600 dark:text-sky-400" />
        <StatCard label="Active Vendors" value={vendorsQ.data ?? 0} icon={ShoppingBag} to="/admin/inventory/vendors" tint="from-violet-500/20 via-violet-500/5 to-transparent" accent="text-violet-600 dark:text-violet-400" />
        <StatCard label="Warehouses" value={warehousesQ.data ?? 0} icon={Warehouse} to="/admin/inventory/warehouses" tint="from-amber-500/20 via-amber-500/5 to-transparent" accent="text-amber-600 dark:text-amber-400" />
        <StatCard label="Items in Field" value={totalField} icon={Boxes} to="/admin/inventory/stock" tint="from-emerald-500/20 via-emerald-500/5 to-transparent" accent="text-emerald-600 dark:text-emerald-400" />
      </div>

      {/* Procurement workflow — visual rail */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-accent/10 via-card to-card">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
          <div>
            <div className="font-display text-sm font-bold tracking-tight">Procurement workflow</div>
            <div className="text-[11px] text-muted-foreground">Follow the chain from order to issuance</div>
          </div>
          <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">5 steps</span>
        </div>
        <div className="grid grid-cols-1 gap-0 sm:grid-cols-5">
          {steps.map((s, i) => (
            <Link
              key={s.to}
              to={s.to}
              className={cn(
                "group relative flex flex-col gap-2 border-border/60 p-4 transition-colors hover:bg-accent/5",
                i > 0 && "sm:border-l",
                i < steps.length - 1 && "border-b sm:border-b-0",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 font-display text-[11px] font-bold text-accent ring-1 ring-accent/30">
                  {s.n}
                </span>
                <s.icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-accent" />
              </div>
              <div>
                <div className="font-display text-sm font-bold leading-tight">{s.t}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{s.d}</div>
              </div>
              {i < steps.length - 1 && (
                <ArrowRight className="absolute -right-2 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground/40 sm:block" />
              )}
            </Link>
          ))}
        </div>
      </div>

      {/* Stock by location — gradient cards with bar */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-accent" />
            <div className="font-display text-sm font-bold tracking-tight">Stock by location</div>
          </div>
          <div className="text-xs text-muted-foreground">
            Total <span className="font-display font-bold tabular-nums text-foreground">{totalAll.toLocaleString("en-IN")}</span> units
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(["warehouse", "branch", "field_officer", "guard"] as const).map((loc) => {
            const meta = locLabels[loc];
            const value = balancesQ.data?.[loc] ?? 0;
            const pct = totalAll > 0 ? Math.round((value / totalAll) * 100) : 0;
            const Icon = meta.icon;
            return (
              <div key={loc} className={cn("relative overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br p-4", meta.tint)}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{meta.label}</div>
                    <div className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">
                      {value.toLocaleString("en-IN")}
                    </div>
                  </div>
                  <Icon className={cn("h-5 w-5", meta.tint.includes("text-") ? "" : "text-accent")} />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background/60">
                    <div className="h-full rounded-full bg-current opacity-80" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[10px] font-bold tabular-nums text-muted-foreground">{pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modules grouped */}
      <div className="mt-6 space-y-5">
        {groups.map((g) => (
          <div key={g}>
            <div className="mb-2 flex items-center gap-2">
              <div className="font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{g}</div>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {modules.filter((m) => m.group === g).map((m) => (
                <Link
                  key={m.to}
                  to={m.to}
                  className="group flex items-start gap-3 rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:bg-accent/5 hover:shadow-sm"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent transition-colors group-hover:bg-accent/20">
                    <m.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-display text-sm font-bold leading-tight">{m.label}</div>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-accent" />
                    </div>
                    <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{m.hint}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  to,
  tint,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  to: string;
  tint: string;
  accent: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md",
      )}
    >
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80", tint)} />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-2 font-display text-3xl font-bold tracking-tight tabular-nums">
            {value.toLocaleString("en-IN")}
          </div>
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl bg-background/70 backdrop-blur-sm transition-transform group-hover:scale-105", accent)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Link>
  );
}
