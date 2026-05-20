import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Edit2, Plus, Search, Trash2, Wind } from "lucide-react";
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
import { useResetOnOpen, useVehicleOptions, vehicleLabel } from "@/lib/vehicle-helpers";

export const Route = createFileRoute("/admin/vehicles/pucs")({
  component: PucManagerPage,
});

type Puc = {
  id: string;
  vehicle_id: string;
  puc_number: string;
  issuing_authority: string;
  issued_date: string | null;
  expiry_date: string | null;
  notes: string;
  enabled: boolean;
};

const QK = ["admin", "vehicle_pucs"] as const;
const MODULE = "Vehicle PUC Manager";
const ENTITY = "vehicle_pucs";

function rowTo(r: Record<string, unknown>): Puc {
  return {
    id: String(r.id),
    vehicle_id: String(r.vehicle_id ?? ""),
    puc_number: String(r.puc_number ?? ""),
    issuing_authority: String(r.issuing_authority ?? ""),
    issued_date: (r.issued_date as string) ?? null,
    expiry_date: (r.expiry_date as string) ?? null,
    notes: String(r.notes ?? ""),
    enabled: Boolean(r.enabled ?? true),
  };
}

function PucManagerPage() {
  const qc = useQueryClient();
  const { data: vehicles = [] } = useVehicleOptions();
  const vMap = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);

  const { data: items = [] } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<Puc[]> => {
      const { data, error } = await supabase
        .from("vehicle_pucs" as never)
        .select("id,vehicle_id,puc_number,issuing_authority,issued_date,expiry_date,notes,enabled")
        .order("expiry_date", { ascending: false });
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[]).map(rowTo);
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });
  type Payload = Omit<Puc, "id">;
  const toRow = (p: Payload) => ({
    vehicle_id: p.vehicle_id,
    puc_number: p.puc_number.trim(),
    issuing_authority: p.issuing_authority.trim(),
    issued_date: p.issued_date || null,
    expiry_date: p.expiry_date || null,
    notes: p.notes.trim(),
    enabled: p.enabled,
  });

  const addMut = useMutation({
    mutationFn: async (p: Payload) => {
      if (!p.vehicle_id) throw new Error("Vehicle is required");
      const { error } = await supabase.from("vehicle_pucs" as never).insert(toRow(p) as never);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "create", entityType: ENTITY, entityLabel: p.puc_number || vMap.get(p.vehicle_id)?.vehicle_number || "PUC", details: p as Record<string, unknown> });
    },
    onSuccess: invalidate,
  });
  const updateMut = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: Payload }) => {
      const { error } = await supabase.from("vehicle_pucs" as never).update(toRow(p) as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "update", entityType: ENTITY, entityId: id, entityLabel: p.puc_number, details: p as Record<string, unknown> });
    },
    onSuccess: invalidate,
  });
  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("vehicle_pucs" as never).update({ enabled } as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: enabled ? "enable" : "disable", entityType: ENTITY, entityId: id, details: { enabled } });
    },
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicle_pucs" as never).delete().eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "delete", entityType: ENTITY, entityId: id });
    },
    onSuccess: invalidate,
  });

  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Puc | null>(null);
  const [deleting, setDeleting] = useState<Puc | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => {
      const v = vMap.get(i.vehicle_id);
      return (
        i.puc_number.toLowerCase().includes(q) ||
        i.issuing_authority.toLowerCase().includes(q) ||
        (v?.vehicle_number.toLowerCase().includes(q) ?? false)
      );
    });
  }, [items, query, vMap]);

  return (
    <div>
      <PageHeader
        title="Vehicle PUC Manager"
        description="Pollution Under Control certificates for vehicles."
        crumbs={[{ label: "Vehicles", to: "/admin/vehicles" }, { label: "PUC" }]}
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by vehicle, PUC no., authority…" className="h-10 rounded-lg pl-9" />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAddOpen(true)} className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90"><Plus className="mr-1.5 h-4 w-4" />Add PUC</Button>
          <Button variant="outline" disabled={filtered.length === 0} onClick={() => downloadCsv("vehicle-pucs", filtered.map((i) => {
            const v = vMap.get(i.vehicle_id);
            return {
              vehicle: v?.vehicle_number ?? "",
              puc_number: i.puc_number, issuing_authority: i.issuing_authority,
              issued_date: i.issued_date ?? "", expiry_date: i.expiry_date ?? "",
              enabled: i.enabled ? "Yes" : "No",
            };
          }), [
            { key: "vehicle", header: "Vehicle" },
            { key: "puc_number", header: "PUC No." },
            { key: "issuing_authority", header: "Authority" },
            { key: "issued_date", header: "Issued" },
            { key: "expiry_date", header: "Expires" },
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
                <th className="px-5 py-3">PUC No.</th>
                <th className="px-5 py-3">Authority</th>
                <th className="px-5 py-3">Issued</th>
                <th className="px-5 py-3">Expires</th>
                <th className="px-5 py-3">Enabled</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((i) => {
                const v = vMap.get(i.vehicle_id);
                const expired = i.expiry_date && i.expiry_date < today;
                return (
                  <tr key={i.id} className="hover:bg-secondary/30">
                    <td className="px-5 py-3 font-mono font-semibold text-foreground">{v ? vehicleLabel(v) : "—"}</td>
                    <td className="px-5 py-3 font-mono text-foreground/90">{i.puc_number || "—"}</td>
                    <td className="px-5 py-3 text-foreground/90">{i.issuing_authority || "—"}</td>
                    <td className="px-5 py-3 text-foreground/90">{i.issued_date ?? "—"}</td>
                    <td className="px-5 py-3">
                      <span className={expired ? "rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive" : "text-foreground/90"}>
                        {i.expiry_date ?? "—"}{expired ? " · Expired" : ""}
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
                <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground">No PUC records found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PucFormDialog
        open={addOpen} onOpenChange={setAddOpen} vehicles={vehicles} title="Add PUC"
        onSubmit={async (p) => { try { await addMut.mutateAsync(p); toast.success("PUC added"); return null; } catch (e) { return e instanceof Error ? e.message : "Could not add"; } }}
      />
      <PucFormDialog
        open={!!editing} initial={editing} vehicles={vehicles} onOpenChange={(o) => !o && setEditing(null)} title="Edit PUC"
        onSubmit={async (p) => { if (!editing) return null; try { await updateMut.mutateAsync({ id: editing.id, p }); toast.success("PUC updated"); setEditing(null); return null; } catch (e) { return e instanceof Error ? e.message : "Could not update"; } }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this PUC record?</AlertDialogTitle>
            <AlertDialogDescription>{deleting && <span className="font-mono font-semibold text-foreground">{deleting.puc_number || vMap.get(deleting.vehicle_id)?.vehicle_number}</span>}</AlertDialogDescription>
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

function PucFormDialog({ open, onOpenChange, title, initial, vehicles, onSubmit }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string;
  initial?: Puc | null; vehicles: { id: string; vehicle_number: string; name: string }[];
  onSubmit: (p: Omit<Puc, "id">) => Promise<string | null>;
}) {
  const [vehicleId, setVehicleId] = useState("");
  const [pucNumber, setPucNumber] = useState("");
  const [issuingAuthority, setIssuingAuthority] = useState("");
  const [issuedDate, setIssuedDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useResetOnOpen(open, () => {
    setVehicleId(initial?.vehicle_id ?? "");
    setPucNumber(initial?.puc_number ?? "");
    setIssuingAuthority(initial?.issuing_authority ?? "");
    setIssuedDate(initial?.issued_date ?? "");
    setExpiryDate(initial?.expiry_date ?? "");
    setNotes(initial?.notes ?? "");
    setEnabled(initial?.enabled ?? true);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle><span className="inline-flex items-center gap-2"><Wind className="h-4 w-4" />{title}</span></DialogTitle>
          <DialogDescription>Pollution Under Control certificate.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label>Vehicle *</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
              <SelectContent>{vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{vehicleLabel(v)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-2"><Label>PUC Certificate Number</Label><Input value={pucNumber} onChange={(e) => setPucNumber(e.target.value)} /></div>
          <div className="grid gap-2"><Label>Issuing Authority</Label><Input value={issuingAuthority} onChange={(e) => setIssuingAuthority(e.target.value)} placeholder="e.g. RTO authorised centre" /></div>
          <div className="grid gap-2"><Label>Issued Date</Label><Input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} /></div>
          <div className="grid gap-2"><Label>Expiry Date</Label><Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></div>
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
              vehicle_id: vehicleId, puc_number: pucNumber, issuing_authority: issuingAuthority,
              issued_date: issuedDate || null, expiry_date: expiryDate || null, notes, enabled,
            });
            setSaving(false);
            if (err) toast.error(err); else onOpenChange(false);
          }}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
