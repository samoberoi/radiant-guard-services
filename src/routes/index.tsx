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
  const { can, isLoading, isSuperAdmin, roleKey } = useCurrentPermissions();

  useEffect(() => {
    if (!isReady) return;
    if (!user) {
      navigate({ to: "/login", replace: true });
      return;
    }
    if (isLoading) return;

    // Role-based dashboard landing
    if (roleKey === "field_officer" && !isSuperAdmin) {
      navigate({ to: "/admin/field-dashboard", replace: true });
      return;
    }
    if (isSuperAdmin) {
      navigate({ to: "/admin/dashboard", replace: true });
      return;
    }
    // Admin-console roles: HR, leadership, branch managers, admins, etc.
    const ADMIN_ROLES = new Set([
      "admin",
      "super_admin",
      "hr",
      "leadership",
      "branch_manager",
      "branch_admin",
      "inventory_manager",
      "inventory",
      "accounts",
      "finance",
      "operations",
    ]);
    const hasAdminAccess =
      (roleKey && ADMIN_ROLES.has(roleKey)) ||
      can("dashboard") || can("organizations") || can("employees") ||
      can("payroll") || can("attendance") || can("rbac") || can("control_center");

    // Frontline employees onboarded by field officers (guards, VMS operators,
    // housekeeping, drivers, etc.) get the employee dashboard — profile,
    // unit teammates, unit birthdays/anniversaries and their own notifications.
    if (!hasAdminAccess) {
      navigate({ to: "/admin/employee-dashboard", replace: true });
      return;
    }

    if (can("dashboard") || can("organizations") || can("employees")) {
      navigate({ to: "/admin/dashboard", replace: true });
      return;
    }
    for (const m of ORDER) {
      if (can(m)) {
        navigate({ to: PATH_FOR[m], replace: true });
        return;
      }
    }
    navigate({ to: "/admin/employee-dashboard", replace: true });
  }, [user, isReady, isLoading, isSuperAdmin, roleKey, can, navigate]);


  return <div className="min-h-screen bg-background" />;
}
