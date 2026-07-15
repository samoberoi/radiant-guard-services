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
    <div className="mb-5 inline-flex flex-wrap items-center gap-1 rounded-2xl border border-white/60 bg-white/60 p-1 backdrop-blur-xl shadow-[0_1px_0_0_rgba(255,255,255,0.85)_inset,0_10px_28px_-18px_rgba(10,20,40,0.18)]">
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
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all",
              active
                ? "bg-gradient-to-br from-white to-accent/[0.08] text-foreground ring-1 ring-inset ring-accent/25 shadow-[0_1px_0_0_rgba(255,255,255,0.9)_inset,0_6px_16px_-10px_color-mix(in_oklab,var(--accent)_45%,transparent)]"
                : "text-muted-foreground hover:text-foreground",
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
