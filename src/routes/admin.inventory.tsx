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
  const steps = [
    { n: 1, t: "Purchase Order", d: "Order from supplier", to: "/admin/inventory/purchase-orders", icon: ClipboardList },
    { n: 2, t: "Delivery Challan", d: "Verify delivery, stock in", to: "/admin/inventory/goods-receipts", icon: PackageCheck },
    { n: 3, t: "Transfer", d: "Warehouse → Branch", to: "/admin/inventory/transfers", icon: Truck },
    { n: 4, t: "Issuance", d: "Branch → FO → Guard", to: "/admin/inventory/issuances", icon: UserCheck },
    { n: 5, t: "Write-off", d: "Lost, damaged, fixes", to: "/admin/inventory/write-offs", icon: AlertOctagon },
  ] as const;

  const modules = [
    { to: "/admin/inventory/stock", label: "Stock Report", hint: "Live balances across the chain", icon: BarChart3, group: "Insights" },
    { to: "/admin/inventory/purchase-orders", label: "Purchase Orders", hint: "Order from suppliers", icon: ClipboardList, group: "Procurement" },
    { to: "/admin/inventory/goods-receipts", label: "Delivery Challans", hint: "Receive into warehouse", icon: PackageCheck, group: "Procurement" },
    { to: "/admin/inventory/transfers", label: "Transfers", hint: "Warehouse ↔ Branch", icon: Truck, group: "Movement" },
    { to: "/admin/inventory/issuances", label: "Issuances", hint: "Branch → FO → Guard", icon: UserCheck, group: "Movement" },
    { to: "/admin/inventory/write-offs", label: "Write-offs", hint: "Lost / damaged", icon: AlertOctagon, group: "Movement" },
    { to: "/admin/inventory/adjustments", label: "Adjustments", hint: "Cycle counts", icon: Sliders, group: "Movement" },
    { to: "/admin/inventory/items", label: "Products", hint: "SKUs and sizes", icon: PackageOpen, group: "Catalog" },
    { to: "/admin/inventory/rate-cards", label: "Supplier Capability Matrix", hint: "Who supplies what · prices", icon: Tags, group: "Catalog" },
    { to: "/admin/inventory/vendors", label: "Suppliers", hint: "Supplier directory", icon: ShoppingBag, group: "Catalog" },
    { to: "/admin/inventory/warehouses", label: "Warehouses", hint: "Storage locations", icon: Warehouse, group: "Catalog" },
  ];

  const groups = ["Insights", "Procurement", "Movement", "Catalog"] as const;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Command Center"
        description="End-to-end chain of custody from supplier → warehouse → branch → field officer → guard. Live KPIs above, modules below."
        crumbs={[{ label: "Inventory" }]}
      />

      {/* Owner dashboard — KPIs, charts, holdings, activity */}
      <InventoryOwnerDashboard />

      {/* Procurement workflow — visual rail */}
      <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-accent/10 via-card to-card">
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

      {/* Modules grouped */}
      <div className="space-y-5">
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
