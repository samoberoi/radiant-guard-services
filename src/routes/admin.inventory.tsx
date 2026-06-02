import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import {
  ArrowRight,
  ClipboardList,
  PackageCheck,
  Truck,
  UserCheck,
  AlertOctagon,
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Command Center"
        description="End-to-end chain of custody from supplier → warehouse → branch → field officer → guard."
        crumbs={[{ label: "Inventory" }]}
      />

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

      {/* Owner dashboard — KPIs, holdings, charts, activity */}
      <InventoryOwnerDashboard />
    </div>
  );
}
