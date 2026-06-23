import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
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
  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Command Center"
        description="End-to-end chain of custody from supplier → warehouse → branch → field officer → guard."
        crumbs={[{ label: "Inventory" }]}
      />
      <InventoryOwnerDashboard />
    </div>
  );
}
