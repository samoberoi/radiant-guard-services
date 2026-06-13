import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Pencil, Search, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv } from "@/lib/csv-export";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ADVANCE_ALERT_KM, serviceStatusFor } from "@/lib/vehicle-service";
import { logActivity } from "@/lib/activity-log";


export const Route = createFileRoute("/admin/vehicles/service-manager")({
  component: ServiceManagerPage,
});


type VehicleRow = {
  id: string;
  vehicle_number: string;
  name: string;
  fuel_type: string;
  enabled: boolean;
  service_interval_km: number | null;
  owner: string;
  type: string;
  brand: string;
  make: string;
  year: number | null;
  color: string;
  engine_number: string;
  chassis_number: string;
  registration_date: string | null;
};
function ServiceManagerPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [fuelFilter, setFuelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editing, setEditing] = useState<VehicleRow | null>(null);

  const { data, isLoading } = useQuery({

    queryKey: ["admin", "vehicles", "service-manager"],
    queryFn: async (): Promise<VehicleRow[]> => {
      const { data, error } = await supabase
        .from("vehicles" as never)
        .select("id,vehicle_number,name,fuel_type,enabled,service_interval_km,owner,type,brand,make,year,color,engine_number,chassis_number,registration_date")
        .order("vehicle_number", { ascending: true });
      if (error) throw error;
      return (data as unknown as VehicleRow[]) ?? [];
    },
  });

  const fuelOptions = useMemo(() => {
    const set = new Set<string>();
    for (const v of data ?? []) if (v.fuel_type) set.add(v.fuel_type);
    return Array.from(set).sort();
  }, [data]);

  const rows = useMemo(() => {
    const list = (data ?? []).filter((v) => v.enabled !== false);
    const q = search.trim().toLowerCase();
    const filtered = list.filter((v) => {
      if (fuelFilter !== "all" && (v.fuel_type || "") !== fuelFilter) return false;
      if (!q) return true;
      return [v.vehicle_number, v.name, v.fuel_type].some((x) =>
        String(x ?? "").toLowerCase().includes(q),
      );
    });
    return filtered
      .map((v) => {
        const status = serviceStatusFor(v.vehicle_number, v.service_interval_km);
        return { v, ...status };
      })
      .filter((r) => {
        if (statusFilter === "due") return r.dueSoon;
        if (statusFilter === "ok") return !r.dueSoon;
        return true;
      });
  }, [data, search, fuelFilter, statusFilter]);

  const dueSoonCount = rows.filter((r) => r.dueSoon).length;
  const totalVehicles = (data ?? []).length;

  return (
    <div>
      <PageHeader
        title="Service Manager"
        description="Auto-tracked service schedule based on each vehicle's own service interval and current running."
        crumbs={[{ label: "Vehicles", to: "/admin/vehicles" }, { label: "Service Manager" }]}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatTile label="Total vehicles" value={totalVehicles} />
        <StatTile label="Active in service tracking" value={rows.length} />
        <StatTile label={`Due within ${ADVANCE_ALERT_KM.toLocaleString()} km`} value={dueSoonCount} tone="warning" />
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
        <Select value={fuelFilter} onValueChange={setFuelFilter}>
          <SelectTrigger className="h-10 w-full sm:w-40"><SelectValue placeholder="All fuels" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All fuels</SelectItem>
            {fuelOptions.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-10 w-full sm:w-40"><SelectValue placeholder="All status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="due">Due soon</SelectItem>
            <SelectItem value="ok">OK</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadCsv(
              "vehicle-service-due.csv",
              rows.map((r) => ({
                vehicle: r.v.vehicle_number,
                fuel_type: r.v.fuel_type,
                service_interval_km: r.interval,
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-accent/10 px-5 py-2.5 text-xs font-medium text-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">{rows.length}</span>
            <span className="uppercase tracking-[0.14em] text-muted-foreground">Total {rows.length === 1 ? "vehicle" : "vehicles"}</span>
          </span>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {isLoading && (
            <div className="col-span-full py-12 text-center text-sm text-muted-foreground">Loading…</div>
          )}
          {!isLoading && rows.length === 0 && (
            <div className="col-span-full py-12 text-center text-sm text-muted-foreground">No vehicles found.</div>
          )}
          {rows.map((r) => (
            <div key={r.v.id} className="group relative flex flex-col gap-3 rounded-xl border border-border bg-background/60 p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-sm font-bold text-primary">{r.v.vehicle_number}</span>
                    {r.dueSoon ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                        <Wrench className="h-3 w-3" /> Due soon
                      </span>
                    ) : (
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        OK
                      </span>
                    )}
                  </div>
                  {(r.v.name || r.v.fuel_type) && (
                    <div className="mt-2 truncate text-xs text-muted-foreground">
                      {[r.v.name, r.v.fuel_type].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(r.v)} aria-label="Edit service interval">
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 bg-secondary/30 p-3 text-xs">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Interval</div>
                  <div className="font-semibold tabular-nums text-foreground">{r.interval.toLocaleString()} km</div>
                </div>
                <div className="min-w-0 text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Current</div>
                  <div className="font-semibold tabular-nums text-foreground">{r.currentKm.toLocaleString()} km</div>
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Service Due At</div>
                  <div className="font-medium tabular-nums text-foreground/90">{r.dueKm.toLocaleString()} km</div>
                </div>
                <div className="min-w-0 text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">KM Remaining</div>
                  <div className={cn("font-semibold tabular-nums", r.dueSoon ? "text-amber-600 dark:text-amber-400" : "text-foreground")}>
                    {r.kmToService.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Service due is calculated automatically using each vehicle's configured service interval (set on Vehicle Inventory) and its current running. Vehicles within {ADVANCE_ALERT_KM.toLocaleString()} km of the next service are flagged.
      </p>

      <EditIntervalDialog
        vehicle={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["admin", "vehicles", "service-manager"] });
        }}
      />
    </div>
  );
}

function EditIntervalDialog({
  vehicle,
  onClose,
  onSaved,
}: {
  vehicle: VehicleRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (vehicle) setValue(String(vehicle.service_interval_km ?? ""));
  }, [vehicle?.id]);

  const open = !!vehicle;

  async function save() {
    if (!vehicle) return;
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Enter a valid service interval (km)");
      return;
    }
    setSaving(true);
    const before = { service_interval_km: vehicle.service_interval_km };
    const after = { service_interval_km: n };
    const { error } = await supabase
      .from("vehicles" as never)
      .update({ service_interval_km: n } as never)
      .eq("id", vehicle.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    void logActivity({
      module: "Service Manager",
      action: "update",
      entityType: "vehicle",
      entityId: vehicle.id,
      entityLabel: vehicle.vehicle_number,
      before,
      after,
    });
    toast.success("Service interval updated");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Service Interval</DialogTitle>
        </DialogHeader>
        {vehicle && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Vehicle: <span className="font-medium text-foreground">{vehicle.vehicle_number}</span>
              {vehicle.name ? <> · {vehicle.name}</> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="service_interval_km">Service Interval (km)</Label>
              <Input
                id="service_interval_km"
                type="number"
                min={1}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="e.g. 10000"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
