import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Boxes, PackageOpen, ShoppingBag, Warehouse, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

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

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="End-to-end chain of custody from vendor → warehouse → branch → field officer → guard."
        crumbs={[{ label: "Inventory" }]}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="SKUs" value={itemsQ.data ?? 0} icon={PackageOpen} to="/admin/inventory/items" />
        <StatCard label="Active Vendors" value={vendorsQ.data ?? 0} icon={ShoppingBag} to="/admin/inventory/vendors" />
        <StatCard label="Warehouses" value={warehousesQ.data ?? 0} icon={Warehouse} to="/admin/inventory/warehouses" />
        <StatCard label="Items in Field" value={(balancesQ.data?.field_officer ?? 0) + (balancesQ.data?.guard ?? 0)} icon={Boxes} to="/admin/inventory/items" />
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 text-accent" />
          <div className="font-display text-sm font-bold tracking-tight">Stock by Location Type</div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {(["warehouse", "branch", "field_officer", "guard"] as const).map((loc) => (
            <div key={loc} className="rounded-xl border border-border/60 bg-secondary/30 p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{loc.replace("_", " ")}</div>
              <div className="mt-1 font-display text-2xl font-bold tabular-nums">
                {(balancesQ.data?.[loc] ?? 0).toLocaleString("en-IN")}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { to: "/admin/inventory/dashboard", label: "Owner Dashboard", hint: "Low stock, leaderboard, holdings" },
          { to: "/admin/inventory/purchase-orders", label: "Purchase Orders", hint: "Order from vendors" },
          { to: "/admin/inventory/goods-receipts", label: "Goods Receipts", hint: "Receive into warehouse" },
          { to: "/admin/inventory/transfers", label: "Transfers", hint: "Warehouse ↔ Branch" },
          { to: "/admin/inventory/issuances", label: "Issuances", hint: "Branch → FO → Guard" },
          { to: "/admin/inventory/write-offs", label: "Write-offs", hint: "Lost / damaged" },
          { to: "/admin/inventory/adjustments", label: "Adjustments", hint: "Cycle counts" },
          { to: "/admin/inventory/stock", label: "Stock Report", hint: "Live balances" },
          { to: "/admin/inventory/items", label: "Item Master", hint: "SKUs & sizes" },
        ].map((c) => (
          <Link key={c.to} to={c.to} className={cn("rounded-2xl border border-border bg-card p-4 transition-colors hover:border-accent/50 hover:bg-accent/5")}>
            <div className="font-display text-sm font-bold">{c.label}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{c.hint}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, to }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; to: string }) {
  return (
    <Link to={to} className={cn("group rounded-2xl border border-border bg-card p-5 transition-colors hover:border-accent/50 hover:bg-accent/5")}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-2 font-display text-3xl font-bold tracking-tight tabular-nums">{value.toLocaleString("en-IN")}</div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent transition-transform group-hover:scale-105">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Link>
  );
}
