import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { CalendarDays, TrendingUp, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/payroll")({
  component: PayrollLayout,
});

const TABS = [
  { to: "/admin/payroll", label: "Payroll Runs", icon: CalendarDays, exact: true },
  { to: "/admin/additions", label: "Additions", icon: TrendingUp, exact: false },
  { to: "/admin/deductions", label: "Deductions", icon: Coins, exact: false },
] as const;

function PayrollLayout() {
  const location = useLocation();
  const isActive = (to: string, exact: boolean) => {
    if (exact) return location.pathname === to || location.pathname.startsWith("/admin/payroll/");
    return location.pathname.startsWith(to);
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-1.5 rounded-2xl border border-border bg-card p-1.5 shadow-sm">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = isActive(t.to, t.exact);
          return (
            <Link
              key={t.to}
              to={t.to}
              search={t.to === "/admin/payroll" ? undefined : { mode: "list" }}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition",
                active
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}
