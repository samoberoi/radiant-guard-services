import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, Briefcase, Calculator, CalendarDays, CalendarRange, ClipboardList, Clock, Coins, HandCoins, Receipt, ReceiptText, Settings, Shield } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/admin/control-center")({
  component: ControlCenterDashboard,
});

type Tile = {
  to: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

const tiles: Tile[] = [
  {
    to: "/admin/professional-tax-manager",
    label: "Professional Tax Manager",
    description: "Configure state-wise professional tax slabs and rates.",
    icon: ReceiptText,
  },
  {
    to: "/admin/lwf-manager",
    label: "Labour Welfare Fund",
    description: "Manage LWF contribution rules across states.",
    icon: HandCoins,
  },
  {
    to: "/admin/duty-manager",
    label: "Duty Manager",
    description: "Define duty types like 8 hrs and 12 hrs used in rosters.",
    icon: Clock,
  },
  {
    to: "/admin/service-type-manager",
    label: "Service Type Manager",
    description: "Define service types like Security, Manpower, Facility, Staff.",
    icon: Briefcase,
  },
  {
    to: "/admin/payroll-manager",
    label: "Payroll Manager",
    description: "Configure payroll windows and salary processing day.",
    icon: CalendarRange,
  },
  {
    to: "/admin/payroll-days-manager",
    label: "Payroll Days Manager",
    description: "Define salary day bases (actual, fixed 26, actual minus Sundays).",
    icon: CalendarDays,
  },
  {
    to: "/admin/allowance-manager",
    label: "Allowance Manager",
    description: "Define allowance / earning components used in payroll.",
    icon: Coins,
  },
  {
    to: "/admin/billing-type-manager",
    label: "Billing Type Manager",
    description: "Define billing types like Man Hours, Man Days, Man Months, Special.",
    icon: Receipt,
  },
  {
    to: "/admin/designation-manager",
    label: "Designation Manager",
    description: "Manage employee designations used across rosters and payroll.",
    icon: BadgeCheck,
  },
  {
    to: "/admin/cost-component-manager",
    label: "Cost Component Manager",
    description: "Configure CTC cost components like EPF, ESI, Bonus, Gratuity, LWF, etc.",
    icon: Calculator,
  },
];

function ControlCenterDashboard() {
  return (
    <div>
      <div className="relative">
        <PageHeader
          title="Control Center"
          description="Platform-wide statutory and configuration settings."
          crumbs={[{ label: "Control Center" }]}
        />
        <Link
          to="/admin/system-logs"
          aria-label="System Logs"
          title="System Logs"
          className="group absolute right-0 top-0 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground/80 transition-colors hover:border-accent/40 hover:bg-accent/10 hover:text-accent"
        >
          <Settings className="h-4 w-4 transition-transform group-hover:rotate-45" />
          <span className="hidden sm:inline">System Logs</span>
          <ClipboardList className="h-3.5 w-3.5 opacity-60" />
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => (
          <Link
            key={tile.to}
            to={tile.to}
            className="group relative flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-accent/40 hover:bg-accent/5"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <tile.icon className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display text-base font-bold tracking-tight text-foreground">
                {tile.label}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{tile.description}</p>
            </div>
            <div className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-accent">
              Open
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
