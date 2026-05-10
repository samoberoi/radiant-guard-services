import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ArrowRight, Building2, MapPin, Users, Warehouse } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/admin/customers")({
  component: CustomersLayout,
});

const tiles = [
  {
    to: "/admin/customers/state-manager",
    label: "State Manager",
    description: "Manage states across India.",
    icon: MapPin,
  },
  {
    to: "/admin/customers/branch-manager",
    label: "Branch Manager",
    description: "Organise regional branches.",
    icon: Building2,
  },
  {
    to: "/admin/customers/customer-manager",
    label: "Customer Manager",
    description: "Onboard and manage customers.",
    icon: Users,
  },
  {
    to: "/admin/customers/unit-manager",
    label: "Unit Manager",
    description: "Track operational units.",
    icon: Warehouse,
  },
];

function CustomersLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Show dashboard tiles only at /admin/customers; otherwise render child route.
  if (pathname !== "/admin/customers" && pathname !== "/admin/customers/") {
    return <Outlet />;
  }

  return (
    <div>
      <PageHeader
        title="Customers Dashboard"
        description="Configure the customer hierarchy — from states down to individual units."
        crumbs={[{ label: "Customers" }]}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-[0_12px_40px_-12px_color-mix(in_oklab,var(--accent)_30%,transparent)]"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
                <t.icon className="h-5 w-5" />
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-accent" />
            </div>
            <h3 className="mt-4 font-display text-base font-bold tracking-tight text-foreground">
              {t.label}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
