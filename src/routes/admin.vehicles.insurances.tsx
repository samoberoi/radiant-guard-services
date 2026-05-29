import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Edit2, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
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
import { useResetOnOpen, useVehicleOptions, fmtDate, type VehicleOption } from "@/lib/vehicle-helpers";
import { MiniStat } from "@/components/MiniStat";
import { SortHeader, sortRows, useSort } from "@/components/SortableHeader";


type StatusFilter = "all" | "expired" | "renewal" | "due" | "active";
const STATUS_VALUES: StatusFilter[] = ["all", "expired", "renewal", "due", "active"];

export const Route = createFileRoute("/admin/vehicles/insurances")({
  validateSearch: (search: Record<string, unknown>): { status: StatusFilter } => {
    const s = String(search.status ?? "all") as StatusFilter;
    return { status: STATUS_VALUES.includes(s) ? s : "all" };
  },
  component: InsuranceManagerPage,
});

type Insurance = {
  id: string;
  vehicle_id: string;
  engine_number: string;
  chassis_number: string;
  insurance_company: string;
  policy_number: string;
  start_date: string | null;
  end_date: string | null;
  premium_amount: number;
  notes: string;
  enabled: boolean;
};

const QK = ["admin", "vehicle_insurances"] as const;
const MODULE = "Vehicle Insurance Manager";
const ENTITY = "vehicle_insurances";

function rowTo(r: Record<string, unknown>): Insurance {
  return {
    id: String(r.id),
    vehicle_id: String(r.vehicle_id ?? ""),
    engine_number: String(r.engine_number ?? ""),
    chassis_number: String(r.chassis_number ?? ""),
    insurance_company: String(r.insurance_company ?? ""),
    policy_number: String(r.policy_number ?? ""),
    start_date: (r.start_date as string) ?? null,
    end_date: (r.end_date as string) ?? null,
    premium_amount: Number(r.premium_amount ?? 0),
    notes: String(r.notes ?? ""),
    enabled: Boolean(r.enabled ?? true),
  };
}

function InsuranceManagerPage() {
  const qc = useQueryClient();
  const { data: vehicles = [] } = useVehicleOptions();
  const vMap = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);

  const { data: items = [] } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<Insurance[]> => {
      const { data, error } = await supabase
        .from("vehicle_insurances" as never)
        .select("id,vehicle_id,engine_number,chassis_number,insurance_company,policy_number,start_date,end_date,premium_amount,notes,enabled")
        .order("end_date", { ascending: false });
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[]).map(rowTo);
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });
  type Payload = Omit<Insurance, "id">;
  const toRow = (p: Payload) => ({
    vehicle_id: p.vehicle_id,
    engine_number: p.engine_number.trim(),
    chassis_number: p.chassis_number.trim(),
    insurance_company: p.insurance_company.trim(),
    policy_number: p.policy_number.trim(),
    start_date: p.start_date || null,
    end_date: p.end_date || null,
    premium_amount: Number(p.premium_amount) || 0,
    notes: p.notes.trim(),
    enabled: p.enabled,
  });

  const addMut = useMutation({
    mutationFn: async (p: Payload) => {
      if (!p.vehicle_id) throw new Error("Vehicle is required");
      const { error } = await supabase.from("vehicle_insurances" as never).insert(toRow(p) as never);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "create", entityType: ENTITY, entityLabel: p.policy_number || vMap.get(p.vehicle_id)?.vehicle_number || "Insurance", details: p as Record<string, unknown> });
    },
    onSuccess: invalidate,
  });
  const updateMut = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: Payload }) => {
      const { error } = await supabase.from("vehicle_insurances" as never).update(toRow(p) as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "update", entityType: ENTITY, entityId: id, entityLabel: p.policy_number, details: p as Record<string, unknown> });
    },
    onSuccess: invalidate,
  });
  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("vehicle_insurances" as never).update({ enabled } as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: enabled ? "enable" : "disable", entityType: ENTITY, entityId: id, details: { enabled } });
    },
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicle_insurances" as never).delete().eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "delete", entityType: ENTITY, entityId: id });
    },
    onSuccess: invalidate,
  });

  const [query, setQuery] = useState("");
  const [insurerFilter, setInsurerFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Insurance | null>(null);
  const [deleting, setDeleting] = useState<Insurance | null>(null);

  const insurerOptions = useMemo(() => {
    const s = new Set<string>();
    for (const i of items) { const c = i.insurance_company.trim(); if (c) s.add(c); }
    return Array.from(s).sort();
  }, [items]);

  const { status } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const today = new Date().toISOString().slice(0, 10);
  const in60Date = new Date(); in60Date.setDate(in60Date.getDate() + 60);
  const in60 = in60Date.toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (insurerFilter !== "all" && i.insurance_company !== insurerFilter) return false;
      if (q) {
        const v = vMap.get(i.vehicle_id);
        const hit =
          i.policy_number.toLowerCase().includes(q) ||
          i.insurance_company.toLowerCase().includes(q) ||
          i.engine_number.toLowerCase().includes(q) ||
          i.chassis_number.toLowerCase().includes(q) ||
          (v?.vehicle_number.toLowerCase().includes(q) ?? false);
        if (!hit) return false;
      }
      if (status === "all") return true;
      const end = i.end_date;
      const isExpired = !!end && end < today;
      const isRenewal = !!end && end >= today && end <= in60;
      if (status === "expired") return isExpired;
      if (status === "renewal") return isRenewal;
      if (status === "due") return isExpired || isRenewal;
      if (status === "active") return !isExpired;
      return true;
    });
  }, [items, query, vMap, status, today, in60, insurerFilter]);

  const stats = useMemo(() => {
    let expired = 0, renewal = 0, active = 0;
    const insurers: Record<string, number> = {};
    for (const i of items) {
      const end = i.end_date;
      const isExpired = !!end && end < today;
      const isRenewal = !!end && end >= today && end <= in60;
      if (isExpired) expired++;
      else if (isRenewal) renewal++;
      else if (end) active++;
      const co = (i.insurance_company || "").trim();
      if (co) insurers[co] = (insurers[co] ?? 0) + 1;
    }
    return { total: items.length, expired, renewal, active, insurerCount: Object.keys(insurers).length };
  }, [items, today, in60]);

  return (
    <div>
      <PageHeader
        title="Vehicle Insurance Manager"
        description="Track insurance policies and validity."
        crumbs={[{ label: "Vehicles", to: "/admin/vehicles" }, { label: "Insurance" }]}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MiniStat label="Total Policies" value={stats.total} />
        <MiniStat label="Insurers" value={stats.insurerCount} tone="accent" />
        <MiniStat label="Expired" value={stats.expired} tone="destructive" />
        <MiniStat label="Renewal (≤60d)" value={stats.renewal} tone="warning" />
        <MiniStat label="Active" value={stats.active} />
      </div>


      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:max-w-xl">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by vehicle, policy, insurer…" className="h-10 rounded-lg pl-9" />
          </div>
          <Select
            value={status}
            onValueChange={(v) => navigate({ search: { status: v as StatusFilter }, replace: true })}
          >
            <SelectTrigger className="h-10 w-full sm:w-56 rounded-lg">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All policies</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="renewal">Coming up soon (≤60d)</SelectItem>
              <SelectItem value="due">Expired + Coming up soon</SelectItem>
              <SelectItem value="active">Active (not expired)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={insurerFilter} onValueChange={setInsurerFilter}>
            <SelectTrigger className="h-10 w-full sm:w-56 rounded-lg"><SelectValue placeholder="All insurers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All insurers</SelectItem>
              {insurerOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAddOpen(true)} className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90"><Plus className="mr-1.5 h-4 w-4" />Add Insurance</Button>
          <Button variant="outline" disabled={filtered.length === 0} onClick={() => downloadCsv("vehicle-insurances", filtered.map((i) => {
            const v = vMap.get(i.vehicle_id);
            return {
              vehicle: v?.vehicle_number ?? "",
              engine_number: i.engine_number, chassis_number: i.chassis_number,
              insurance_company: i.insurance_company, policy_number: i.policy_number,
              start_date: i.start_date ?? "", end_date: i.end_date ?? "",
              premium_amount: i.premium_amount, enabled: i.enabled ? "Yes" : "No",
            };
          }), [
            { key: "vehicle", header: "Vehicle" },
            { key: "engine_number", header: "Engine No." },
            { key: "chassis_number", header: "Chassis No." },
            { key: "insurance_company", header: "Insurer" },
            { key: "policy_number", header: "Policy No." },
            { key: "start_date", header: "Start" },
            { key: "end_date", header: "End" },
            { key: "premium_amount", header: "Premium" },
            { key: "enabled", header: "Enabled" },
          ])} className="h-10 rounded-lg"><Download className="mr-1.5 h-4 w-4" />Export</Button>
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
                <th className="px-5 py-3">Vehicle</th>
                <th className="px-5 py-3">Insurer</th>
                <th className="px-5 py-3">Policy No.</th>
                <th className="px-5 py-3">Valid From</th>
                <th className="px-5 py-3">Valid Till</th>
                <th className="px-5 py-3">Enabled</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((i) => {
                const v = vMap.get(i.vehicle_id);
                const expired = i.end_date && i.end_date < today;
                return (
                  <tr key={i.id} className="hover:bg-secondary/30">
                    <td className="px-5 py-3 font-mono font-semibold text-foreground">{v?.vehicle_number || "—"}</td>
                    <td className="px-5 py-3 text-foreground/90">{i.insurance_company || "—"}</td>
                    <td className="px-5 py-3 font-mono text-foreground/90">{i.policy_number || "—"}</td>
                    <td className="px-5 py-3 text-foreground/90">{fmtDate(i.start_date)}</td>
                    <td className="px-5 py-3">
                      <span className={expired ? "rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive" : "text-foreground/90"}>
                        {fmtDate(i.end_date)}{expired ? " · Expired" : ""}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <Switch checked={i.enabled} onCheckedChange={(val) =>
                        toggleMut.mutate({ id: i.id, enabled: val }, {
                          onSuccess: () => toast.success(val ? "Enabled" : "Disabled"),
                          onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
                        })} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => setEditing(i)} aria-label="Edit"><Edit2 className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => setDeleting(i)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground">No insurance records found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <InsuranceFormDialog
        open={addOpen} onOpenChange={setAddOpen} vehicles={vehicles} title="Add Insurance"
        onSubmit={async (p) => { try { await addMut.mutateAsync(p); toast.success("Insurance added"); return null; } catch (e) { return e instanceof Error ? e.message : "Could not add"; } }}
      />
      <InsuranceFormDialog
        open={!!editing} initial={editing} vehicles={vehicles} onOpenChange={(o) => !o && setEditing(null)} title="Edit Insurance"
        onSubmit={async (p) => { if (!editing) return null; try { await updateMut.mutateAsync({ id: editing.id, p }); toast.success("Insurance updated"); setEditing(null); return null; } catch (e) { return e instanceof Error ? e.message : "Could not update"; } }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this insurance record?</AlertDialogTitle>
            <AlertDialogDescription>{deleting && <span className="font-mono font-semibold text-foreground">{deleting.policy_number || vMap.get(deleting.vehicle_id)?.vehicle_number}</span>}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => { if (!deleting) return; try { await deleteMut.mutateAsync(deleting.id); toast.success("Deleted"); setDeleting(null); } catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); } }}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InsuranceFormDialog({ open, onOpenChange, title, initial, vehicles, onSubmit }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string;
  initial?: Insurance | null; vehicles: VehicleOption[];
  onSubmit: (p: Omit<Insurance, "id">) => Promise<string | null>;
}) {
  const [vehicleId, setVehicleId] = useState("");
  const [engineNumber, setEngineNumber] = useState("");
  const [chassisNumber, setChassisNumber] = useState("");
  const [insuranceCompany, setInsuranceCompany] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [premiumAmount, setPremiumAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useResetOnOpen(open, () => {
    setVehicleId(initial?.vehicle_id ?? "");
    setEngineNumber(initial?.engine_number ?? "");
    setChassisNumber(initial?.chassis_number ?? "");
    setInsuranceCompany(initial?.insurance_company ?? "");
    setPolicyNumber(initial?.policy_number ?? "");
    setStartDate(initial?.start_date ?? "");
    setEndDate(initial?.end_date ?? "");
    setPremiumAmount(String(initial?.premium_amount ?? 0));
    setNotes(initial?.notes ?? "");
    setEnabled(initial?.enabled ?? true);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle><span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" />{title}</span></DialogTitle>
          <DialogDescription>Insurance policy linked to a vehicle.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label>Vehicle *</Label>
            <Select value={vehicleId} onValueChange={(v) => {
              setVehicleId(v);
              const veh = vehicles.find((x) => x.id === v);
              setEngineNumber(veh?.engine_number?.toUpperCase() ?? "");
              setChassisNumber(veh?.chassis_number?.toUpperCase() ?? "");
            }}>
              <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
              <SelectContent>{vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.vehicle_number}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-2"><Label>Engine Number</Label><Input value={engineNumber} onChange={(e) => setEngineNumber(e.target.value.toUpperCase())} /></div>
          <div className="grid gap-2"><Label>Chassis Number</Label><Input value={chassisNumber} onChange={(e) => setChassisNumber(e.target.value.toUpperCase())} /></div>
          <div className="grid gap-2"><Label>Insurance Company</Label><Input value={insuranceCompany} onChange={(e) => setInsuranceCompany(e.target.value)} placeholder="e.g. ICICI Lombard" /></div>
          <div className="grid gap-2"><Label>Policy Number</Label><Input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} /></div>
          <div className="grid gap-2"><Label>Start Date</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
          <div className="grid gap-2"><Label>End Date</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
          <div className="grid gap-2 sm:col-span-2"><Label>Premium Amount (₹)</Label><Input type="number" step="0.01" value={premiumAmount} onChange={(e) => setPremiumAmount(e.target.value)} /></div>
          <div className="grid gap-2 sm:col-span-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 sm:col-span-2">
            <div><div className="text-sm font-medium">Enabled</div></div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button disabled={saving} onClick={async () => {
            if (!(await confirmAction({ title: "Save changes?", description: "Do you want to save these changes?", confirmText: "Save" }))) return;
            setSaving(true);
            const err = await onSubmit({
              vehicle_id: vehicleId, engine_number: engineNumber, chassis_number: chassisNumber,
              insurance_company: insuranceCompany, policy_number: policyNumber,
              start_date: startDate || null, end_date: endDate || null,
              premium_amount: Number(premiumAmount) || 0, notes, enabled,
            });
            setSaving(false);
            if (err) toast.error(err); else onOpenChange(false);
          }}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
