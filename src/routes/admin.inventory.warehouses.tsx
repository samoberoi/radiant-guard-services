import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Edit2, Plus, Search, Trash2, Warehouse, Star } from "lucide-react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/admin/inventory/warehouses")({ component: WarehousesPage });

type WH = {
  id: string;
  warehouse_code: string;
  name: string;
  phone: string;
  address1: string;
  city: string;
  state: string;
  pincode: string;
  notes: string;
  is_default: boolean;
  enabled: boolean;
};
type Payload = Omit<WH, "id" | "warehouse_code">;

const MODULE = "Inventory Warehouses";
const ENTITY = "inv_warehouses";
const QK = ["inv", "warehouses"] as const;

function rowToWH(r: Record<string, unknown>): WH {
  return {
    id: String(r.id), warehouse_code: String(r.warehouse_code ?? ""), name: String(r.name ?? ""),
    phone: String(r.phone ?? ""), address1: String(r.address1 ?? ""), city: String(r.city ?? ""),
    state: String(r.state ?? ""), pincode: String(r.pincode ?? ""), notes: String(r.notes ?? ""),
    is_default: Boolean(r.is_default), enabled: Boolean(r.enabled ?? true),
  };
}

function WarehousesPage() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_warehouses" as never).select("*").order("name");
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[]).map(rowToWH);
    },
  });
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<WH | null>(null);
  const [deleting, setDeleting] = useState<WH | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q) || i.warehouse_code.toLowerCase().includes(q) || i.city.toLowerCase().includes(q));
  }, [items, query]);

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const addMut = useMutation({
    mutationFn: async (p: Payload) => {
      if (!p.name.trim()) throw new Error("Name is required");
      const { data: seq } = await supabase.rpc("nextval" as never, { sequence_name: "inv_warehouse_code_seq" } as never);
      const code = `WH-${String(Number(seq ?? 0) || items.length + 1).padStart(3, "0")}`;
      if (p.is_default) await supabase.from("inv_warehouses" as never).update({ is_default: false } as never).eq("is_default", true);
      const { error } = await supabase.from("inv_warehouses" as never).insert({ ...p, warehouse_code: code } as never);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "create", entityType: ENTITY, entityLabel: p.name });
    },
    onSuccess: invalidate,
  });
  const updateMut = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: Payload }) => {
      if (p.is_default) await supabase.from("inv_warehouses" as never).update({ is_default: false } as never).neq("id", id);
      const { error } = await supabase.from("inv_warehouses" as never).update(p as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "update", entityType: ENTITY, entityId: id, entityLabel: p.name });
    },
    onSuccess: invalidate,
  });
  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("inv_warehouses" as never).update({ enabled } as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: enabled ? "enable" : "disable", entityType: ENTITY, entityId: id });
    },
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inv_warehouses" as never).delete().eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "delete", entityType: ENTITY, entityId: id });
    },
    onSuccess: invalidate,
  });

  return (
    <div>
      <PageHeader title="Warehouses" description="Storage locations that receive vendor deliveries and dispatch to branches." crumbs={[{ label: "Inventory", to: "/admin/inventory" }, { label: "Warehouses" }]} />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="h-10 rounded-lg pl-9" />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAddOpen(true)} className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90"><Plus className="mr-1.5 h-4 w-4" />Add Warehouse</Button>
          <Button variant="outline" disabled={!filtered.length} onClick={() => downloadCsv("warehouses", filtered.map((w) => ({ code: w.warehouse_code, name: w.name, city: w.city, state: w.state, default: w.is_default ? "Yes" : "No", enabled: w.enabled ? "Yes" : "No" })))} className="h-10 rounded-lg"><Download className="mr-1.5 h-4 w-4" />Export</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-accent/10 px-5 py-2.5 text-xs"><span className="inline-flex items-center gap-2"><span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">{filtered.length}</span><span className="uppercase tracking-[0.14em] text-muted-foreground">Total rows</span></span></div>
        <div className="overflow-x-clip">
          <table className="ios-table w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr><th className="px-5 py-3">Code</th><th className="px-5 py-3">Name</th><th className="px-5 py-3">Address</th><th className="px-5 py-3">City</th><th className="px-5 py-3">Default</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((w) => (
                <tr key={w.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{w.warehouse_code}</td>
                  <td className="px-5 py-3 font-medium"><span className="inline-flex items-center gap-2"><Warehouse className="h-4 w-4 text-muted-foreground" />{w.name}</span></td>
                  <td className="px-5 py-3 text-xs">{w.address1 || "—"}</td>
                  <td className="px-5 py-3">{w.city || "—"}</td>
                  <td className="px-5 py-3">{w.is_default && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600"><Star className="h-3 w-3" />Default</span>}</td>
                  <td className="px-5 py-3"><Switch checked={w.enabled} onCheckedChange={(v) => toggleMut.mutate({ id: w.id, enabled: v }, { onSuccess: () => toast.success(v ? "Enabled" : "Disabled") })} /></td>
                  <td className="px-5 py-3 text-right"><div className="inline-flex gap-1"><Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditing(w)}><Edit2 className="h-4 w-4" /></Button><Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:text-destructive" onClick={() => setDeleting(w)}><Trash2 className="h-4 w-4" /></Button></div></td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground">No warehouses yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <WHFormDialog open={addOpen} onOpenChange={setAddOpen} title="Add Warehouse" onSubmit={async (p) => { try { await addMut.mutateAsync(p); toast.success("Warehouse added"); return null; } catch (e) { return e instanceof Error ? e.message : "Failed"; } }} />
      <WHFormDialog open={!!editing} initial={editing} onOpenChange={(o) => !o && setEditing(null)} title="Edit Warehouse" onSubmit={async (p) => { if (!editing) return null; try { await updateMut.mutateAsync({ id: editing.id, p }); toast.success("Updated"); setEditing(null); return null; } catch (e) { return e instanceof Error ? e.message : "Failed"; } }} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this warehouse?</AlertDialogTitle><AlertDialogDescription>{deleting && <span className="font-semibold">{deleting.name}</span>}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => { if (!deleting) return; try { await deleteMut.mutateAsync(deleting.id); toast.success("Deleted"); setDeleting(null); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } }}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function WHFormDialog({ open, onOpenChange, title, initial, onSubmit }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; initial?: WH | null; onSubmit: (p: Payload) => Promise<string | null> }) {
  const [p, setP] = useState<Payload>({ name: "", phone: "", address1: "", city: "", state: "", pincode: "", notes: "", is_default: false, enabled: true });
  const [saving, setSaving] = useState(false);
  const [last, setLast] = useState(false);
  if (open !== last) { setLast(open); if (open) setP({ name: initial?.name ?? "", phone: initial?.phone ?? "", address1: initial?.address1 ?? "", city: initial?.city ?? "", state: initial?.state ?? "", pincode: initial?.pincode ?? "", notes: initial?.notes ?? "", is_default: initial?.is_default ?? false, enabled: initial?.enabled ?? true }); }
  const set = <K extends keyof Payload>(k: K, v: Payload[K]) => setP((s) => ({ ...s, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>Storage location.</DialogDescription></DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-2"><Label>Name *</Label><Input value={p.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Main Warehouse" /></div>
          <div className="grid gap-2"><Label>Phone</Label><Input value={p.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div className="grid gap-2"><Label>Address</Label><Input value={p.address1} onChange={(e) => set("address1", e.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-2"><Label>City</Label><Input value={p.city} onChange={(e) => set("city", e.target.value)} /></div>
            <div className="grid gap-2"><Label>State</Label><Input value={p.state} onChange={(e) => set("state", e.target.value)} /></div>
            <div className="grid gap-2"><Label>Pincode</Label><Input value={p.pincode} onChange={(e) => set("pincode", e.target.value)} /></div>
          </div>
          <div className="grid gap-2"><Label>Notes</Label><Textarea rows={2} value={p.notes} onChange={(e) => set("notes", e.target.value)} /></div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2"><div><div className="text-sm font-medium">Default warehouse</div><div className="text-xs text-muted-foreground">Used by default in POs and transfers</div></div><Switch checked={p.is_default} onCheckedChange={(v) => set("is_default", v)} /></div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2"><div className="text-sm font-medium">Enabled</div><Switch checked={p.enabled} onCheckedChange={(v) => set("enabled", v)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button disabled={saving} onClick={async () => {
            if (!(await confirmAction({ title: "Save?", description: "Save these changes?", confirmText: "Save" }))) return;
            setSaving(true);
            const err = await onSubmit(p);
            setSaving(false);
            if (err) toast.error(err); else onOpenChange(false);
          }}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
