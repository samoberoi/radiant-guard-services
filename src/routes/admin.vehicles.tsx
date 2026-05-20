import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Car, CheckCircle2, Fuel, ShieldAlert, ShieldCheck, Wind, Wrench } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate } from "@/lib/vehicle-helpers";
import { serviceStatusFor } from "@/lib/vehicle-service";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/vehicles")({
  component: VehiclesLayout,
});


function VehiclesLayout() {
  const location = useLocation();
  const isHub = location.pathname === "/admin/vehicles" || location.pathname === "/admin/vehicles/";
  if (!isHub) return <Outlet />;
  return <VehiclesDashboard />;
}

type DashRow = Record<string, unknown>;

function VehiclesDashboard() {
  const vehiclesQ = useQuery({
    queryKey: ["dashboard", "vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles" as never)
        .select("id,vehicle_number,fuel_type,enabled");
      if (error) throw error;
      return (data as unknown as DashRow[]) ?? [];
    },
  });
  const insurancesQ = useQuery({
    queryKey: ["dashboard", "insurances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_insurances" as never)
        .select("id,vehicle_id,end_date,insurance_company,enabled");
      if (error) throw error;
      return (data as unknown as DashRow[]) ?? [];
    },
  });
  const pucsQ = useQuery({
    queryKey: ["dashboard", "pucs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_pucs" as never)
        .select("id,vehicle_id,expiry_date,enabled");
      if (error) throw error;
      return (data as unknown as DashRow[]) ?? [];
    },
  });
  const fuelQ = useQuery({
    queryKey: ["dashboard", "fuel-entries-30d"],
    queryFn: async () => {
      const since = new Date(); since.setDate(since.getDate() - 30);
      const sinceIso = since.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("vehicle_fuel_entries" as never)
        .select("id,fuel_type,amount,payment_mode,entry_date")
        .gte("entry_date", sinceIso);
      if (error) throw error;
      return (data as unknown as DashRow[]) ?? [];
    },
  });

  const vehicles = vehiclesQ.data ?? [];
  const insurances = insurancesQ.data ?? [];
  const pucs = pucsQ.data ?? [];
  const fuelEntries = fuelQ.data ?? [];

  const fuelSpend = useMemo(() => {
    let total = 0;
    const byFuel: Record<string, number> = { Petrol: 0, Diesel: 0, CNG: 0 };
    const byPay: Record<string, number> = { PetroCard: 0, Cash: 0, UPI: 0, Other: 0 };
    for (const e of fuelEntries) {
      const amt = Number(e.amount ?? 0);
      total += amt;
      const ft = String(e.fuel_type ?? "");
      if (ft in byFuel) byFuel[ft] += amt;
      const pm = String(e.payment_mode ?? "");
      if (pm in byPay) byPay[pm] += amt; else byPay.Other += amt;
    }
    return { total, byFuel, byPay, count: fuelEntries.length };
  }, [fuelEntries]);


  const fuelStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const v of vehicles) {
      const raw = String(v.fuel_type ?? "").trim().toLowerCase() || "unspecified";
      const key = raw === "petrol" ? "Petrol" : raw === "diesel" ? "Diesel" : raw === "cng" ? "CNG" : raw === "electric" || raw === "ev" ? "Electric" : "Other";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [vehicles]);

  const vehMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of vehicles) m.set(String(v.id), String(v.vehicle_number ?? ""));
    return m;
  }, [vehicles]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in60 = new Date(today); in60.setDate(in60.getDate() + 60);

  const diffDays = (iso: string) => {
    const d = new Date(iso); d.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - today.getTime()) / 86400000);
  };

  const insExpired = insurances.filter((r) => r.end_date && diffDays(String(r.end_date)) < 0);
  const insRenewal = insurances.filter((r) => {
    if (!r.end_date) return false;
    const d = diffDays(String(r.end_date));
    return d >= 0 && d <= 60;
  });

  const pucExpired = pucs.filter((r) => r.expiry_date && diffDays(String(r.expiry_date)) < 0);
  const pucExpiring = pucs.filter((r) => {
    if (!r.expiry_date) return false;
    const d = diffDays(String(r.expiry_date));
    return d >= 0 && d <= 60;
  });

  const totalVehicles = vehicles.length;
  const serviceDueSoon = useMemo(
    () => vehicles.filter((v) => v.enabled !== false && serviceStatusFor(String(v.vehicle_number ?? "")).dueSoon).length,
    [vehicles],
  );

  return (
    <div>
      <PageHeader
        title="Vehicles"
        description="Overview of fleet, FastTag, insurance, PUC and service status."
        crumbs={[{ label: "Vehicles" }]}
      />

      {/* Top stat cards — clickable, deep-link into managers with filter */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard
          label="Total Vehicles"
          value={totalVehicles}
          icon={Car}
          accent="accent"
          to="/admin/vehicles/inventory"
        />
        <StatCard
          label="Service Due Soon"
          value={serviceDueSoon}
          icon={Wrench}
          accent="warning"
          subtle="Within 2,500 km of next service"
          to="/admin/vehicles/service-manager"
        />
        <StatCard
          label="Insurance Expired"
          value={insExpired.length}
          icon={ShieldAlert}
          accent="destructive"
          to="/admin/vehicles/insurances"
          search={{ status: "expired" }}
        />
        <StatCard
          label="Insurance Renewal (≤60d)"
          value={insRenewal.length}
          icon={ShieldCheck}
          accent="warning"
          to="/admin/vehicles/insurances"
          search={{ status: "renewal" }}
        />
        <StatCard
          label="PUC Expiring (≤60d)"
          value={pucExpiring.length + pucExpired.length}
          icon={Wind}
          accent="warning"
          subtle={pucExpired.length > 0 ? `${pucExpired.length} already expired` : undefined}
          to="/admin/vehicles/pucs"
          search={{ status: "due" }}
        />
        <StatCard
          label="Fuel Manager"
          value={totalVehicles}
          icon={Fuel}
          accent="accent"
          subtle="Log top-ups & track spend"
          to="/admin/vehicles/fuel-manager"
        />
      </div>

      {/* Fuel mix */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-1">
          <div className="flex items-center gap-2">
            <Fuel className="h-4 w-4 text-accent" />
            <div className="font-display text-sm font-bold tracking-tight">Fleet by Fuel Type</div>
          </div>
          <div className="mt-4 space-y-3">
            {(["Petrol", "Diesel", "CNG", "Electric", "Other"] as const).map((k) => {
              const c = fuelStats[k] ?? 0;
              const pct = totalVehicles ? Math.round((c / totalVehicles) * 100) : 0;
              if (!c) return null;
              return (
                <div key={k}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{k}</span>
                    <span className="text-muted-foreground">{c} · {pct}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {totalVehicles === 0 && <p className="text-sm text-muted-foreground">No vehicles yet.</p>}
          </div>
        </div>

        {/* Insurance list */}
        <DueListCard
          title="Insurance — Expired & Renewals"
          icon={ShieldAlert}
          empty="No insurance items in next 60 days."
          rows={[
            ...insExpired.map((r) => ({
              id: String(r.id),
              vehicle: vehMap.get(String(r.vehicle_id)) ?? "—",
              date: String(r.end_date),
              meta: String(r.insurance_company ?? ""),
              status: "expired" as const,
              days: diffDays(String(r.end_date)),
            })),
            ...insRenewal.map((r) => ({
              id: String(r.id),
              vehicle: vehMap.get(String(r.vehicle_id)) ?? "—",
              date: String(r.end_date),
              meta: String(r.insurance_company ?? ""),
              status: "due" as const,
              days: diffDays(String(r.end_date)),
            })),
          ].sort((a, b) => a.days - b.days)}
        />

        {/* PUC list */}
        <DueListCard
          title="PUC — Expired & Expiring"
          icon={Wind}
          empty="No PUC items in next 60 days."
          rows={[
            ...pucExpired.map((r) => ({
              id: String(r.id),
              vehicle: vehMap.get(String(r.vehicle_id)) ?? "—",
              date: String(r.expiry_date),
              meta: "",
              status: "expired" as const,
              days: diffDays(String(r.expiry_date)),
            })),
            ...pucExpiring.map((r) => ({
              id: String(r.id),
              vehicle: vehMap.get(String(r.vehicle_id)) ?? "—",
              date: String(r.expiry_date),
              meta: "",
              status: "due" as const,
              days: diffDays(String(r.expiry_date)),
            })),
          ].sort((a, b) => a.days - b.days)}
        />
      </div>

    </div>
  );
}

function StatCard({
  label, value, icon: Icon, accent, subtle, to, search,
}: {
  label: string; value: number; icon: React.ComponentType<{ className?: string }>;
  accent: "accent" | "destructive" | "warning"; subtle?: string;
  to: string; search?: Record<string, string>;
}) {
  const palette = accent === "destructive"
    ? "bg-destructive/15 text-destructive"
    : accent === "warning"
      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
      : "bg-accent/15 text-accent";
  return (
    <Link
      to={to}
      search={search as never}
      className="group rounded-2xl border border-border bg-card p-5 transition-colors hover:border-accent/50 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-2 font-display text-3xl font-bold tracking-tight">{value}</div>
          {subtle && <div className="mt-1 text-xs text-muted-foreground">{subtle}</div>}
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-105", palette)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Link>
  );
}

type DueRow = { id: string; vehicle: string; date: string; meta: string; status: "expired" | "due"; days: number };

function DueListCard({ title, icon: Icon, rows, empty }: {
  title: string; icon: React.ComponentType<{ className?: string }>; rows: DueRow[]; empty: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-accent" />
        <div className="font-display text-sm font-bold tracking-tight">{title}</div>
      </div>
      <div className="mt-3 max-h-72 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            {empty}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.slice(0, 12).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{r.vehicle}</div>
                  {r.meta && <div className="truncate text-xs text-muted-foreground">{r.meta}</div>}
                </div>
                <div className="text-right">
                  <div className="text-xs font-medium">{fmtDate(r.date)}</div>
                  <div className={cn(
                    "text-[11px] font-semibold",
                    r.status === "expired" ? "text-destructive" : "text-amber-600 dark:text-amber-400",
                  )}>
                    {r.status === "expired" ? `Expired ${Math.abs(r.days)}d ago` : `In ${r.days}d`}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
