import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Briefcase, CalendarRange, Clock, HandCoins, ReceiptText } from "lucide-react";
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
];

function ControlCenterDashboard() {
  return (
    <div>
      <PageHeader
        title="Control Center"
        description="Platform-wide statutory and configuration settings."
        crumbs={[{ label: "Control Center" }]}
      />

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
