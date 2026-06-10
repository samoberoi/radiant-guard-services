import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, SlidersHorizontal, Eye, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { toast } from "sonner";
import { confirmAction } from "@/components/ConfirmProvider";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { nextSeq, fmtNumber, postMovements, statusBadgeClass, type LocationType, LOCATION_TYPE_LABELS } from "@/lib/inv-helpers";

export const Route = createFileRoute("/admin/inventory/adjustments")({ component: AdjustmentsPage });

const MODULE = "Inventory Adjustments";
const ENTITY = "inv_adjustments";

type Adj = { id: string; adjustment_number: string; adjustment_date: string; status: string; location_type: string; location_id: string; reason: string; notes: string };
type Warehouse = { id: string; name: string };
type Branch = { id: string; name: string };
type Candidate = { id: string; full_name: string; employee_code: string };
type Item = { id: string; name: string; is_sized: boolean };
type Line = { item_id: string; size_value: string; qty_change: number; notes: string };

function AdjustmentsPage() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["inv", "adjustments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_adjustments" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Adj[]) ?? [];
    },
  });
  const { data: warehouses = [] } = useQuery({ queryKey: ["inv", "warehouses-list"], queryFn: async () => { const { data } = await supabase.from("inv_warehouses" as never).select("id,name").eq("enabled", true); return (data as unknown as Warehouse[]) ?? []; } });
  const { data: branches = [] } = useQuery({ queryKey: ["branches-list"], queryFn: async () => { const { data } = await supabase.from("branches" as never).select("id,name").order("name"); return (data as unknown as Branch[]) ?? []; } });
  const { data: candidates = [] } = useQuery({ queryKey: ["candidates-active-min"], queryFn: async () => { const { data } = await supabase.from("candidates" as never).select("id,full_name,employee_code").eq("status", "active").order("full_name"); return (data as unknown as Candidate[]) ?? []; } });
  const { data: items = [] } = useQuery({ queryKey: ["inv", "items-list"], queryFn: async () => { const { data } = await supabase.from("inv_items" as never).select("id,name,is_sized").eq("enabled", true).order("name"); return (data as unknown as Item[]) ?? []; } });

  const whMap = useMemo(() => new Map(warehouses.map((w) => [w.id, w.name])), [warehouses]);
  const brMap = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);
  const cMap = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const locName = (type: string, id: string) => {
    if (type === "warehouse") return whMap.get(id) ?? "—";
    if (type === "branch") return brMap.get(id) ?? "—";
    if (type === "field_officer" || type === "guard") return cMap.get(id)?.full_name ?? "—";
    return "—";
  };

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Adj | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.adjustment_number.toLowerCase().includes(q));
  }, [rows, query]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["inv", "adjustments"] });
    qc.invalidateQueries({ queryKey: ["inv", "balances-sum"] });
  };

  const deleteMut = useMutation({
    mutationFn: async (a: Adj) => {
      if (a.status === "approved") throw new Error("Cannot delete an approved adjustment.");
      const { error } = await supabase.from("inv_adjustments" as never).delete().eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return (
    <div>
      <PageHeader title="Stock Adjustments" description="Reconcile physical vs system counts. Positive/negative entries posted on approval." crumbs={[{ label: "Inventory", to: "/admin/inventory" }, { label: "Adjustments" }]} />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search #…" className="h-10 rounded-lg pl-9" />
        </div>
        <Button onClick={() => { setActive(null); setOpen(true); }} className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-1.5 h-4 w-4" />New Adjustment
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="ios-table w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr><th className="px-5 py-3">Adj #</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Location</th><th className="px-5 py-3">Reason</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs">{r.adjustment_number}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{r.adjustment_date}</td>
                  <td className="px-5 py-3">{locName(r.location_type, r.location_id)}</td>
                  <td className="px-5 py-3 text-xs">{r.reason || "—"}</td>
                  <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${statusBadgeClass(r.status)}`}>{r.status}</span></td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setActive(r); setOpen(true); }}><Eye className="h-4 w-4" /></Button>
                      {r.status !== "approved" && (
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:text-destructive" onClick={async () => {
                          if (!(await confirmAction({ title: "Delete?", description: `Delete ${r.adjustment_number}?`, confirmText: "Delete" }))) return;
                          try { await deleteMut.mutateAsync(r); toast.success("Deleted"); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                        }}><Trash2 className="h-4 w-4" /></Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground"><SlidersHorizontal className="mx-auto mb-2 h-8 w-8 opacity-40" />No adjustments yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <AdjDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setActive(null); }} initial={active} warehouses={warehouses} branches={branches} candidates={candidates} items={items} onSaved={invalidate} />
    </div>
  );
}

function AdjDialog({ open, onOpenChange, initial, warehouses, branches, candidates, items, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; initial: Adj | null;
  warehouses: Warehouse[]; branches: Branch[]; candidates: Candidate[]; items: Item[]; onSaved: () => void;
}) {
  const [locType, setLocType] = useState<LocationType>("warehouse");
  const [locId, setLocId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const isDraft = !initial || initial.status === "draft";

  function locOptions() {
    if (locType === "warehouse") return warehouses;
    if (locType === "branch") return branches;
    return candidates;
  }

  useResetOnOpen(open, async () => {
    if (initial) {
      setLocType(initial.location_type as LocationType); setLocId(initial.location_id);
      setDate(initial.adjustment_date); setReason(initial.reason); setNotes(initial.notes);
      const { data } = await supabase.from("inv_adjustment_lines" as never).select("*").eq("adjustment_id", initial.id);
      setLines(((data as unknown as Record<string, unknown>[]) ?? []).map((r) => ({
        item_id: String(r.item_id), size_value: String(r.size_value ?? ""),
        qty_change: Number(r.qty_change ?? 0), notes: String(r.notes ?? ""),
      })));
    } else {
      setLocType("warehouse"); setLocId(""); setDate(new Date().toISOString().slice(0, 10));
      setReason(""); setNotes(""); setLines([]);
    }
  });

  async function save(target: "draft" | "approve") {
    if (!locId) { toast.error("Pick location"); return; }
    if (!lines.length || lines.some((l) => !l.item_id || l.qty_change === 0)) { toast.error("Add lines with non-zero qty"); return; }
    setSaving(true);
    try {
      const linesPayload = lines.map((l) => ({ item_id: l.item_id, size_value: l.size_value, qty_change: l.qty_change, notes: l.notes }));
      let id = initial?.id;
      if (initial) {
        await supabase.from("inv_adjustments" as never).update({ location_type: locType, location_id: locId, adjustment_date: date, reason, notes } as never).eq("id", initial.id);
        await supabase.from("inv_adjustment_lines" as never).delete().eq("adjustment_id", initial.id);
        await supabase.from("inv_adjustment_lines" as never).insert(linesPayload.map((l) => ({ ...l, adjustment_id: initial.id })) as never);
      } else {
        const n = await nextSeq("inv_adjustment_number_seq");
        const number = fmtNumber("ADJ", n);
        const { data: { user } } = await supabase.auth.getUser();
        const { data: ins, error } = await supabase.from("inv_adjustments" as never).insert({
          adjustment_number: number, adjustment_date: date, location_type: locType, location_id: locId,
          reason, status: "draft", notes, created_by: user?.id ?? null,
        } as never).select("id").single();
        if (error) throw error;
        id = (ins as unknown as { id: string }).id;
        await supabase.from("inv_adjustment_lines" as never).insert(linesPayload.map((l) => ({ ...l, adjustment_id: id })) as never);
      }

      if (target === "approve" && id) {
        if (!(await confirmAction({ title: "Approve adjustment?", description: "Stock balances will be updated.", confirmText: "Approve" }))) { setSaving(false); return; }
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("inv_adjustments" as never).update({ status: "approved", approved_by: user?.id ?? null, approved_at: new Date().toISOString() } as never).eq("id", id);
        await postMovements(lines.map((l) => ({
          movement_type: l.qty_change > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
          location_type: locType, location_id: locId, item_id: l.item_id, size_value: l.size_value,
          qty_change: l.qty_change, reference_type: "adjustment", reference_id: id!, notes: reason,
        })));
      }

      void logActivity({ module: MODULE, action: target === "approve" ? "approve" : (initial ? "update" : "create"), entityType: ENTITY, entityId: id });
      toast.success(target === "approve" ? "Approved — balances updated" : "Saved");
      onSaved(); onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>{initial ? `Adjustment ${initial.adjustment_number}` : "New Adjustment"}</DialogTitle><DialogDescription>Use positive qty to add, negative to remove.</DialogDescription></DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2"><Label>Holder Type</Label>
              <Select value={locType} onValueChange={(v) => { setLocType(v as LocationType); setLocId(""); }} disabled={!isDraft}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(["warehouse", "branch", "field_officer", "guard"] as LocationType[]).map((t) => <SelectItem key={t} value={t}>{LOCATION_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 sm:col-span-2"><Label>Holder</Label>
              <Select value={locId} onValueChange={setLocId} disabled={!isDraft}>
                <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                <SelectContent>{locOptions().map((o) => <SelectItem key={o.id} value={o.id}>{"full_name" in o ? `${o.full_name} (${o.employee_code})` : (o as { name: string }).name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={!isDraft} /></div>
            <div className="grid gap-2 sm:col-span-2"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} disabled={!isDraft} placeholder="Cycle count, found stock, system correction…" /></div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-sm font-semibold">Items</Label>
              {isDraft && <Button size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, { item_id: "", size_value: "", qty_change: 0, notes: "" }])}><Plus className="mr-1 h-3.5 w-3.5" />Add line</Button>}
            </div>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="ios-table w-full text-sm">
                <thead className="bg-secondary/60 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 w-16">Size</th><th className="px-3 py-2 w-28 text-right">Qty Change</th><th className="px-3 py-2">Notes</th>{isDraft && <th className="px-3 py-2 w-10"></th>}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((l, idx) => {
                    const it = itemMap.get(l.item_id);
                    return (
                      <tr key={idx}>
                        <td className="px-2 py-1.5">
                          {isDraft ? (
                            <Select value={l.item_id} onValueChange={(v) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, item_id: v } : x))}>
                              <SelectTrigger className="h-9"><SelectValue placeholder="Pick" /></SelectTrigger>
                              <SelectContent>{items.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
                            </Select>
                          ) : <div className="px-1 font-medium">{it?.name ?? "—"}</div>}
                        </td>
                        <td className="px-2 py-1.5"><Input className="h-9" disabled={!isDraft || !it?.is_sized} value={l.size_value} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, size_value: e.target.value } : x))} placeholder={it?.is_sized ? "M/L" : "—"} /></td>
                        <td className="px-2 py-1.5"><Input type="number" className={`h-9 text-right ${l.qty_change < 0 ? "text-rose-700" : l.qty_change > 0 ? "text-emerald-700" : ""}`} disabled={!isDraft} value={l.qty_change} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, qty_change: Number(e.target.value) || 0 } : x))} /></td>
                        <td className="px-2 py-1.5"><Input className="h-9" disabled={!isDraft} value={l.notes} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, notes: e.target.value } : x))} /></td>
                        {isDraft && <td className="px-2 py-1.5"><Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:text-destructive" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}><Trash2 className="h-3.5 w-3.5" /></Button></td>}
                      </tr>
                    );
                  })}
                  {!lines.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-xs text-muted-foreground">No lines.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!isDraft} rows={2} /></div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Close</Button>
          {isDraft && <Button variant="outline" onClick={() => save("draft")} disabled={saving}>Save Draft</Button>}
          {isDraft && <Button onClick={() => save("approve")} disabled={saving}>{saving ? "Approving…" : "Approve & Post"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useResetOnOpen(open: boolean, reset: () => void) {
  const [last, setLast] = useState(false);
  if (open !== last) { setLast(open); if (open) reset(); }
}
