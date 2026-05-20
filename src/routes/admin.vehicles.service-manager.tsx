import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Search, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv } from "@/lib/csv-export";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ADVANCE_ALERT_KM, SERVICE_INTERVAL, serviceStatusFor } from "@/lib/vehicle-service";

export const Route = createFileRoute("/admin/vehicles/service-manager")({
  component: ServiceManagerPage,
});

type VehicleRow = {
  id: string;
  vehicle_number: string;
  name: string;
  fuel_type: string;
  enabled: boolean;
};

function ServiceManagerPage() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "vehicles", "service-manager"],
    queryFn: async (): Promise<VehicleRow[]> => {
      const { data, error } = await supabase
        .from("vehicles" as never)
        .select("id,vehicle_number,name,fuel_type,enabled")
        .order("vehicle_number", { ascending: true });
      if (error) throw error;
      return (data as unknown as VehicleRow[]) ?? [];
    },
  });

  const rows = useMemo(() => {
    const list = (data ?? []).filter((v) => v.enabled !== false);
    const q = search.trim().toLowerCase();
    const filtered = q
      ? list.filter((v) =>
          [v.vehicle_number, v.name, v.fuel_type].some((x) =>
            String(x ?? "").toLowerCase().includes(q),
          ),
        )
      : list;
    return filtered.map((v) => {
      const { currentKm, dueKm, kmToService, dueSoon } = serviceStatusFor(v.vehicle_number);
      return { v, currentKm, dueKm, kmToService, dueSoon };
    });
  }, [data, search]);

  const dueSoonCount = rows.filter((r) => r.dueSoon).length;

  return (
    <div>
      <PageHeader
        title="Service Manager"
        description="Track current odometer reading and upcoming service-due kilometers for each vehicle."
        crumbs={[{ label: "Vehicles", to: "/admin/vehicles" }, { label: "Service Manager" }]}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatTile label="Vehicles tracked" value={rows.length} />
        <StatTile label="Due within 2,500 km" value={dueSoonCount} tone="warning" />
        <StatTile label="Service interval" value={`${SERVICE_INTERVAL.toLocaleString()} km`} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by vehicle…"
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadCsv(
              "vehicle-service-due.csv",
              rows.map((r) => ({
                vehicle: r.v.vehicle_number,
                fuel_type: r.v.fuel_type,
                current_km: r.currentKm,
                service_due_km: r.dueKm,
                km_to_service: r.kmToService,
                status: r.dueSoon ? "due-soon" : "ok",
              })),
            )
          }
        >
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Vehicle</th>
                <th className="px-4 py-3 text-left">Fuel</th>
                <th className="px-4 py-3 text-right">Current KM</th>
                <th className="px-4 py-3 text-right">Service Due At</th>
                <th className="px-4 py-3 text-right">KM Remaining</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No vehicles found.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.v.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">{r.v.vehicle_number}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.v.fuel_type || "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.currentKm.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.dueKm.toLocaleString()}</td>
                  <td className={cn(
                    "px-4 py-3 text-right tabular-nums font-semibold",
                    r.dueSoon ? "text-amber-600 dark:text-amber-400" : "text-foreground",
                  )}>
                    {r.kmToService.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {r.dueSoon ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                        <Wrench className="h-3 w-3" /> Due soon
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        OK
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Note: Current KM values are placeholders pending odometer integration. Service due is calculated at every {SERVICE_INTERVAL.toLocaleString()} km; vehicles within {ADVANCE_ALERT_KM.toLocaleString()} km of the next service are flagged.
      </p>
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number | string; tone?: "warning" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn(
        "mt-2 font-display text-3xl font-bold tracking-tight",
        tone === "warning" && "text-amber-600 dark:text-amber-400",
      )}>
        {value}
      </div>
    </div>
  );
}
