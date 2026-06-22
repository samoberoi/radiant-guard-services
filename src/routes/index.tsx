import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useCurrentPermissions } from "@/lib/rbac";

export const Route = createFileRoute("/")({
  component: Index,
});

const ORDER = ["organizations","contracts","employees","vehicles","assets","inventory","attendance","payroll","control_center","notification_center","rbac"] as const;
const PATH_FOR: Record<string,string> = {
  organizations: "/admin/customers",
  contracts: "/admin/contracts/client-contracts",
  employees: "/admin/employees",
  vehicles: "/admin/vehicles",
  assets: "/admin/assets",
  inventory: "/admin/inventory",
  attendance: "/admin/attendance",
  payroll: "/admin/payroll",
  control_center: "/admin/control-center",
  notification_center: "/admin/notifications",
  rbac: "/admin/rbac",
};

function Index() {
  const navigate = useNavigate();
  const { user, isReady } = useAuth();
  const { can, isLoading, isSuperAdmin } = useCurrentPermissions();

  useEffect(() => {
    if (!isReady) return;
    if (!user) {
      navigate({ to: "/login", replace: true });
      return;
    }
    if (isLoading) return;
    if (isSuperAdmin) {
      navigate({ to: "/admin/customers", replace: true });
      return;
    }
    for (const m of ORDER) {
      if (can(m)) {
        navigate({ to: PATH_FOR[m], replace: true });
        return;
      }
    }
    navigate({ to: "/admin/profile", replace: true });
  }, [user, isReady, isLoading, isSuperAdmin, can, navigate]);

  return <div className="min-h-screen bg-background" />;
}
