import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { ArrowRight, Car, Radio, ShieldCheck, Wind } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/admin/vehicles")({
  component: VehiclesLayout,
});

const tiles = [
  {
    to: "/admin/vehicles/inventory",
    label: "Vehicle Inventory",
    description: "Manage vehicles — number, brand, make, type, year and status.",
    icon: Car,
  },
  {
    to: "/admin/vehicles/fastags",
    label: "FastTag Manager",
    description: "Map vehicles to FastTag — bank, account number, balance, expiry.",
    icon: Radio,
  },
  {
    to: "/admin/vehicles/insurances",
    label: "Vehicle Insurance Manager",
    description: "Track engine/chassis numbers, policy, insurer and validity.",
    icon: ShieldCheck,
  },
  {
    to: "/admin/vehicles/pucs",
    label: "Vehicle PUC Manager",
    description: "Pollution Under Control certificates with issue and expiry dates.",
    icon: Wind,
  },
];

function VehiclesLayout() {
  const location = useLocation();
  const isHub = location.pathname === "/admin/vehicles" || location.pathname === "/admin/vehicles/";

  if (!isHub) return <Outlet />;

  return (
    <div>
      <PageHeader
        title="Vehicles"
        description="Vehicle inventory, FastTag mapping, insurance and PUC records."
        crumbs={[{ label: "Vehicles" }]}
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
