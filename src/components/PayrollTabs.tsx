import { Link, useLocation } from "@tanstack/react-router";
import { CalendarDays, TrendingUp, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/admin/payroll", label: "Payroll Runs", icon: CalendarDays, match: (p: string) => p === "/admin/payroll" || p.startsWith("/admin/payroll/") },
  { to: "/admin/additions", label: "Additions", icon: TrendingUp, match: (p: string) => p.startsWith("/admin/additions") },
  { to: "/admin/deductions", label: "Deductions", icon: Coins, match: (p: string) => p.startsWith("/admin/deductions") },
] as const;

/**
 * Shared tab strip rendered at the top of Payroll Runs, Additions, and Deductions.
 * Gives those three pages a unified Payroll workspace feel without restructuring routes.
 */
export function PayrollTabs() {
  const location = useLocation();
  return (
    <div className="mb-5 flex flex-wrap items-center gap-1.5 rounded-2xl border border-border bg-card p-1.5 shadow-sm">
      {TABS.map((t) => {
        const Icon = t.icon;
        const active = t.match(location.pathname);
        const search = t.to === "/admin/payroll" ? undefined : ({ mode: "list" } as const);
        return (
          <Link
            key={t.to}
            to={t.to}
            search={search as never}
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
  );
}
