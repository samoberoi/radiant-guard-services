import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/payroll")({
  component: () => <Outlet />,
});
