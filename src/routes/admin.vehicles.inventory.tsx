import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Car, Download, Edit2, Plus, Search, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { downloadCsv } from "@/lib/csv-export";
import { toast } from "sonner";
import { confirmAction } from "@/components/ConfirmProvider";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { fmtDate } from "@/lib/vehicle-helpers";
import { MiniStat } from "@/components/MiniStat";



export const Route = createFileRoute("/admin/vehicles/inventory")({
  component: VehicleInventoryPage,
});

type Vehicle = {
  id: string;
  vehicle_id: string;
  vehicle_number: string;
  name: string;
  brand: string;
  make: string;
  type: string;
  year: number | null;
  color: string;
  registration_date: string | null;
  engine_number: string;
  chassis_number: string;
  fuel_type: string;
  owner: string;
  notes: string;
  enabled: boolean;
  service_interval_km: number;
};

const DEFAULT_SERVICE_INTERVAL_KM = 5000;

const QK = ["admin", "vehicles"] as const;
const MODULE = "Vehicle Inventory";
const ENTITY = "vehicles";
const TYPES = ["Car", "SUV", "Sedan", "Hatchback", "Bike", "Scooter", "Truck", "Van", "Bus", "Tempo", "Auto", "Other"];
const FUEL_TYPES = ["Petrol", "Diesel", "CNG", "Electric", "Hybrid", "LPG"];

function rowToItem(r: Record<string, unknown>): Vehicle {
  return {
    id: String(r.id),
    vehicle_id: String(r.vehicle_id ?? ""),
    vehicle_number: String(r.vehicle_number ?? ""),
    name: String(r.name ?? ""),
    brand: String(r.brand ?? ""),
    make: String(r.make ?? ""),
    type: String(r.type ?? ""),
    year: r.year == null ? null : Number(r.year),
    color: String(r.color ?? ""),
    registration_date: (r.registration_date as string) ?? null,
    engine_number: String(r.engine_number ?? ""),
    chassis_number: String(r.chassis_number ?? ""),
    fuel_type: String(r.fuel_type ?? ""),
    owner: String(r.owner ?? ""),
    notes: String(r.notes ?? ""),
    enabled: Boolean(r.enabled ?? true),
    service_interval_km: r.service_interval_km == null ? DEFAULT_SERVICE_INTERVAL_KM : Number(r.service_interval_km),
  };
}

function useVehicles() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<Vehicle[]> => {
      const { data, error } = await supabase
        .from("vehicles" as never)
        .select("id,vehicle_id,vehicle_number,name,brand,make,type,year,color,registration_date,engine_number,chassis_number,fuel_type,owner,notes,enabled,service_interval_km")
        .order("vehicle_id", { ascending: true });
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[]).map(rowToItem);
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });
  type Payload = Omit<Vehicle, "id" | "vehicle_id">;
  const toRow = (p: Payload) => ({
    vehicle_number: p.vehicle_number.trim().toUpperCase(),
    name: p.name.trim(),
    brand: p.brand.trim(),
    make: p.make.trim(),
    type: p.type.trim(),
    year: p.year,
    color: p.color.trim(),
    registration_date: p.registration_date || null,
    engine_number: p.engine_number.trim().toUpperCase(),
    chassis_number: p.chassis_number.trim().toUpperCase(),
    fuel_type: p.fuel_type.trim(),
    owner: p.owner.trim(),
    notes: p.notes.trim(),
    enabled: p.enabled,
    service_interval_km: p.service_interval_km > 0 ? Math.round(p.service_interval_km) : DEFAULT_SERVICE_INTERVAL_KM,
  });

  const addMut = useMutation({
    mutationFn: async (p: Payload) => {
      if (!p.vehicle_number.trim()) throw new Error("Vehicle number is required");
      const { error } = await supabase.from("vehicles" as never).insert(toRow(p) as never);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "create", entityType: ENTITY, entityLabel: p.vehicle_number, details: p as Record<string, unknown> });
    },
    onSuccess: invalidate,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: Payload }) => {
      const { error } = await supabase.from("vehicles" as never).update(toRow(p) as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "update", entityType: ENTITY, entityId: id, entityLabel: p.vehicle_number, details: p as Record<string, unknown> });
    },
    onSuccess: invalidate,
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("vehicles" as never).update({ enabled } as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: enabled ? "enable" : "disable", entityType: ENTITY, entityId: id, details: { enabled } });
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicles" as never).delete().eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "delete", entityType: ENTITY, entityId: id });
    },
    onSuccess: invalidate,
  });

  return { items, addMut, updateMut, toggleMut, deleteMut };
}


function VehicleInventoryPage() {
  const { items, addMut, updateMut, toggleMut, deleteMut } = useVehicles();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [fuelFilter, setFuelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [deleting, setDeleting] = useState<Vehicle | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (typeFilter !== "all" && i.type !== typeFilter) return false;
      if (fuelFilter !== "all" && i.fuel_type !== fuelFilter) return false;
      if (statusFilter === "enabled" && !i.enabled) return false;
      if (statusFilter === "disabled" && i.enabled) return false;
      if (!q) return true;
      return (
        i.vehicle_id.toLowerCase().includes(q) ||
        i.vehicle_number.toLowerCase().includes(q) ||
        i.name.toLowerCase().includes(q) ||
        i.brand.toLowerCase().includes(q) ||
        i.make.toLowerCase().includes(q) ||
        i.engine_number.toLowerCase().includes(q) ||
        i.chassis_number.toLowerCase().includes(q) ||
        i.owner.toLowerCase().includes(q)
      );
    });
  }, [items, query, typeFilter, fuelFilter, statusFilter]);

  const stats = useMemo(() => {
    const byFuel: Record<string, number> = {};
    let enabled = 0;
    for (const v of items) {
      if (v.enabled) enabled++;
      const k = (v.fuel_type || "Unspecified").trim() || "Unspecified";
      byFuel[k] = (byFuel[k] ?? 0) + 1;
    }
    return { total: items.length, enabled, byFuel };
  }, [items]);

  return (
    <div>
      <PageHeader
        title="Vehicle Inventory"
        description="Master list of company vehicles."
        crumbs={[{ label: "Vehicles", to: "/admin/vehicles" }, { label: "Inventory" }]}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Total Vehicles" value={stats.total} />
        <MiniStat label="Enabled" value={stats.enabled} tone="accent" />
        {FUEL_TYPES.filter((f) => stats.byFuel[f]).slice(0, 6).map((f) => (
          <MiniStat key={f} label={f} value={stats.byFuel[f] ?? 0} />
        ))}
      </div>


      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search vehicles…" className="h-10 rounded-lg pl-9" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-10 w-full rounded-lg sm:w-40"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fuelFilter} onValueChange={setFuelFilter}>
            <SelectTrigger className="h-10 w-full rounded-lg sm:w-40"><SelectValue placeholder="All fuels" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All fuels</SelectItem>
              {FUEL_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 w-full rounded-lg sm:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="enabled">Enabled</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAddOpen(true)} className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="mr-1.5 h-4 w-4" />Add Vehicle
          </Button>
          <Button
            variant="outline"
            disabled={filtered.length === 0}
            onClick={() =>
              downloadCsv(
                "vehicles",
                filtered.map((i) => ({
                  vehicle_id: i.vehicle_id,
                  vehicle_number: i.vehicle_number,
                  name: i.name,
                  owner: i.owner,
                  brand: i.brand,
                  make: i.make,
                  type: i.type,
                  fuel_type: i.fuel_type,
                  year: i.year ?? "",
                  color: i.color,
                  engine_number: i.engine_number,
                  chassis_number: i.chassis_number,
                  registration_date: i.registration_date ?? "",
                  enabled: i.enabled ? "Yes" : "No",
                })),
                [
                  { key: "vehicle_id", header: "Vehicle ID" },
                  { key: "vehicle_number", header: "Vehicle Number" },
                  { key: "name", header: "Name" },
                  { key: "owner", header: "Owner" },
                  { key: "brand", header: "Brand" },
                  { key: "make", header: "Make" },
                  { key: "type", header: "Type" },
                  { key: "fuel_type", header: "Fuel Type" },
                  { key: "year", header: "Year" },
                  { key: "color", header: "Color" },
                  { key: "engine_number", header: "Engine No." },
                  { key: "chassis_number", header: "Chassis No." },
                  { key: "registration_date", header: "Registration Date" },
                  { key: "enabled", header: "Enabled" },
                ],
              )
            }
            className="h-10 rounded-lg"
          >
            <Download className="mr-1.5 h-4 w-4" />Export
          </Button>
        </div>
      </div>




      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-accent/10 px-5 py-2.5 text-xs font-medium text-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">{filtered.length}</span>
            <span className="uppercase tracking-[0.14em] text-muted-foreground">Total {filtered.length === 1 ? "row" : "rows"}</span>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Vehicle ID</th>
                <th className="px-5 py-3">Vehicle No.</th>
                <th className="px-5 py-3">Owner</th>
                <th className="px-5 py-3">Brand / Make</th>
                <th className="px-5 py-3">Type / Fuel</th>
                <th className="px-5 py-3">Engine No.</th>
                <th className="px-5 py-3">Chassis No.</th>
                <th className="px-5 py-3">Reg. Date</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((i) => (
                <tr key={i.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-[12px] font-semibold text-accent">{i.vehicle_id || "—"}</td>
                  <td className="px-5 py-3 font-mono font-semibold text-foreground">
                    <span className="inline-flex items-center gap-2"><Car className="h-4 w-4 text-muted-foreground" />{i.vehicle_number}</span>
                    {i.name && <div className="mt-0.5 text-[11px] font-sans font-normal text-muted-foreground">{i.name}</div>}
                  </td>
                  <td className="px-5 py-3 text-foreground/90">{i.owner || "—"}</td>
                  <td className="px-5 py-3 text-foreground/90">{[i.brand, i.make].filter(Boolean).join(" / ") || "—"}{i.year && <div className="text-[11px] text-muted-foreground">{i.year}</div>}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-col gap-1">
                      {i.type && <span className="w-fit rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{i.type}</span>}
                      {i.fuel_type && <span className="w-fit rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">{i.fuel_type}</span>}
                      {!i.type && !i.fuel_type && "—"}
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono text-[12px] text-foreground/80">{i.engine_number || "—"}</td>
                  <td className="px-5 py-3 font-mono text-[12px] text-foreground/80">{i.chassis_number || "—"}</td>
                  <td className="px-5 py-3 text-foreground/90">{fmtDate(i.registration_date)}</td>
                  <td className="px-5 py-3">
                    <Switch
                      checked={i.enabled}
                      onCheckedChange={(v) =>
                        toggleMut.mutate({ id: i.id, enabled: v }, {
                          onSuccess: () => toast.success(v ? "Enabled" : "Disabled"),
                          onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
                        })
                      }
                    />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => setEditing(i)} aria-label="Edit"><Edit2 className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => setDeleting(i)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="px-5 py-12 text-center text-sm text-muted-foreground">No vehicles found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <VehicleFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add Vehicle"
        onSubmit={async (p) => {
          try { await addMut.mutateAsync(p); toast.success("Vehicle added"); return null; }
          catch (e) { return e instanceof Error ? e.message : "Could not add vehicle"; }
        }}
      />
      <VehicleFormDialog
        open={!!editing}
        initial={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Edit Vehicle"
        onSubmit={async (p) => {
          if (!editing) return null;
          try { await updateMut.mutateAsync({ id: editing.id, p }); toast.success("Vehicle updated"); setEditing(null); return null; }
          catch (e) { return e instanceof Error ? e.message : "Could not update vehicle"; }
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this vehicle?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && <span className="font-semibold text-foreground">{deleting.vehicle_number}</span>} — this will also remove its FastTag, insurance and PUC records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try { await deleteMut.mutateAsync(deleting.id); toast.success("Vehicle deleted"); setDeleting(null); }
                catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
              }}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function VehicleFormDialog({ open, onOpenChange, title, initial, onSubmit }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  initial?: Vehicle | null;
  onSubmit: (p: Omit<Vehicle, "id" | "vehicle_id">) => Promise<string | null>;
}) {
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [brand, setBrand] = useState("");
  const [make, setMake] = useState("");
  const [type, setType] = useState("Car");
  const [fuelType, setFuelType] = useState("Petrol");
  const [year, setYear] = useState<string>("");
  const [color, setColor] = useState("");
  const [registrationDate, setRegistrationDate] = useState("");
  const [engineNumber, setEngineNumber] = useState("");
  const [chassisNumber, setChassisNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useResetOnOpen(open, () => {
    setVehicleNumber(initial?.vehicle_number ?? "");
    setName(initial?.name ?? "");
    setOwner(initial?.owner ?? "");
    setBrand(initial?.brand ?? "");
    setMake(initial?.make ?? "");
    setType(initial?.type || "Car");
    setFuelType(initial?.fuel_type || "Petrol");
    setYear(initial?.year != null ? String(initial.year) : "");
    setColor(initial?.color ?? "");
    setRegistrationDate(initial?.registration_date ?? "");
    setEngineNumber(initial?.engine_number ?? "");
    setChassisNumber(initial?.chassis_number ?? "");
    setNotes(initial?.notes ?? "");
    setEnabled(initial?.enabled ?? true);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Vehicle registration details.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid gap-2">
            <Label>Vehicle Number *</Label>
            <Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())} placeholder="e.g. KA01AB1234" />
          </div>
          <div className="grid gap-2"><Label>Owner</Label><Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Owner name / company" /></div>
          <div className="grid gap-2"><Label>Name / Label</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Manager Car" /></div>
          <div className="grid gap-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Fuel Type</Label>
            <Select value={fuelType} onValueChange={setFuelType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FUEL_TYPES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-2"><Label>Brand</Label><Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Maruti Suzuki" /></div>
          <div className="grid gap-2"><Label>Make / Model</Label><Input value={make} onChange={(e) => setMake(e.target.value)} placeholder="e.g. Swift VXi" /></div>
          <div className="grid gap-2"><Label>Year</Label><Input type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="e.g. 2022" min={1980} max={2100} /></div>
          <div className="grid gap-2"><Label>Color</Label><Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="e.g. White" /></div>
          <div className="grid gap-2"><Label>Engine Number</Label><Input value={engineNumber} onChange={(e) => setEngineNumber(e.target.value.toUpperCase())} placeholder="Engine no." /></div>
          <div className="grid gap-2"><Label>Chassis Number</Label><Input value={chassisNumber} onChange={(e) => setChassisNumber(e.target.value.toUpperCase())} placeholder="Chassis / VIN" /></div>
          <div className="grid gap-2 sm:col-span-2"><Label>Registration Date</Label><Input type="date" value={registrationDate} onChange={(e) => setRegistrationDate(e.target.value)} /></div>
          <div className="grid gap-2 sm:col-span-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 sm:col-span-2">
            <div><div className="text-sm font-medium">Enabled</div><div className="text-xs text-muted-foreground">Show in dropdowns</div></div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button
            disabled={saving}
            onClick={async () => {
              if (!(await confirmAction({ title: "Save changes?", description: "Do you want to save these changes?", confirmText: "Save" }))) return;
              setSaving(true);
              const err = await onSubmit({
                vehicle_number: vehicleNumber,
                name, owner, brand, make, type, color, notes, enabled,
                fuel_type: fuelType,
                engine_number: engineNumber,
                chassis_number: chassisNumber,
                year: year ? Number(year) : null,
                registration_date: registrationDate || null,
              });
              setSaving(false);
              if (err) toast.error(err); else onOpenChange(false);
            }}
          >{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useResetOnOpen(open: boolean, reset: () => void) {
  const [last, setLast] = useState(false);
  if (open !== last) { setLast(open); if (open) reset(); }
}
