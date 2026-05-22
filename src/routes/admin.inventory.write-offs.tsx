import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, ShieldAlert, Eye, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { nextSeq, fmtNumber, postMovements, statusBadgeClass, type LocationType, LOCATION_TYPE_LABELS } from "@/lib/inv-helpers";

export const Route = createFileRoute("/admin/inventory/write-offs")({ component: WriteOffsPage });

const MODULE = "Inventory Write-offs";
const ENTITY = "inv_write_offs";

type WO = {
  id: string; writeoff_number: string; writeoff_date: string; status: string;
  location_type: string; location_id: string; reason: string;
  responsible_candidate_id: string | null; recovery_amount: number; recovery_via_payroll: boolean; notes: string;
};
type Warehouse = { id: string; name: string };
type Branch = { id: string; name: string };
type Candidate = { id: string; full_name: string; employee_code: string };
type Item = { id: string; name: string; is_sized: boolean };
type Line = { item_id: string; size_value: string; qty: number; unit_value: number; notes: string };

const REASONS = ["damaged", "lost", "stolen", "expired", "obsolete"];

function WriteOffsPage() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["inv", "writeoffs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_write_offs" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as WO[]) ?? [];
    },
  });
  const { data: warehouses = [] } = useQuery({
    queryKey: ["inv", "warehouses-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_warehouses" as never).select("id,name").eq("enabled", true);
      if (error) throw error;
      return (data as unknown as Warehouse[]) ?? [];
    },
  });
  const { data: branches = [] } = useQuery({
    queryKey: ["branches-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches" as never).select("id,name").order("name");
      if (error) throw error;
      return (data as unknown as Branch[]) ?? [];
    },
  });
  const { data: candidates = [] } = useQuery({
    queryKey: ["candidates-active-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("candidates" as never).select("id,full_name,employee_code").eq("status", "active").order("full_name");
      if (error) throw error;
      return (data as unknown as Candidate[]) ?? [];
    },
  });
  const { data: items = [] } = useQuery({
    queryKey: ["inv", "items-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_items" as never).select("id,name,is_sized").eq("enabled", true).order("name");
      if (error) throw error;
      return (data as unknown as Item[]) ?? [];
    },
  });

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
  const [active, setActive] = useState<WO | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.writeoff_number.toLowerCase().includes(q));
  }, [rows, query]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["inv", "writeoffs"] });
    qc.invalidateQueries({ queryKey: ["inv", "balances-sum"] });
  };

  const deleteMut = useMutation({
    mutationFn: async (wo: WO) => {
      if (wo.status === "approved") throw new Error("Cannot delete an approved write-off.");
      const { error } = await supabase.from("inv_write_offs" as never).delete().eq("id", wo.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return (
    <div>
      <PageHeader title="Returns & Write-offs" description="Damaged, lost or stolen items. Approve to deduct from the holder and optionally recover via payroll." crumbs={[{ label: "Inventory", to: "/admin/inventory" }, { label: "Write-offs" }]} />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search #…" className="h-10 rounded-lg pl-9" />
        </div>
        <Button onClick={() => { setActive(null); setOpen(true); }} className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-1.5 h-4 w-4" />New Write-off
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Write-off #</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Location</th>
                <th className="px-5 py-3">Reason</th>
                <th className="px-5 py-3">Responsible</th>
                <th className="px-5 py-3 text-right">Recovery ₹</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs">{r.writeoff_number}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{r.writeoff_date}</td>
                  <td className="px-5 py-3">{locName(r.location_type, r.location_id)}</td>
                  <td className="px-5 py-3 text-xs uppercase tracking-wider">{r.reason}</td>
                  <td className="px-5 py-3">{r.responsible_candidate_id ? cMap.get(r.responsible_candidate_id)?.full_name ?? "—" : "—"}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{r.recovery_amount > 0 ? `₹${Number(r.recovery_amount).toLocaleString("en-IN")}${r.recovery_via_payroll ? " (payroll)" : ""}` : "—"}</td>
                  <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${statusBadgeClass(r.status)}`}>{r.status}</span></td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setActive(r); setOpen(true); }}><Eye className="h-4 w-4" /></Button>
                      {r.status !== "approved" && (
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:text-destructive" onClick={async () => {
                          if (!(await confirmAction({ title: "Delete?", description: `Delete ${r.writeoff_number}?`, confirmText: "Delete" }))) return;
                          try { await deleteMut.mutateAsync(r); toast.success("Deleted"); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                        }}><Trash2 className="h-4 w-4" /></Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-muted-foreground"><ShieldAlert className="mx-auto mb-2 h-8 w-8 opacity-40" />No write-offs yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <WODialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setActive(null); }} initial={active} warehouses={warehouses} branches={branches} candidates={candidates} items={items} onSaved={invalidate} />
    </div>
  );
}

function WODialog({ open, onOpenChange, initial, warehouses, branches, candidates, items, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; initial: WO | null;
  warehouses: Warehouse[]; branches: Branch[]; candidates: Candidate[]; items: Item[]; onSaved: () => void;
}) {
  const [locType, setLocType] = useState<LocationType>("warehouse");
  const [locId, setLocId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("damaged");
  const [respId, setRespId] = useState<string>("");
  const [recovery, setRecovery] = useState(0);
  const [viaPayroll, setViaPayroll] = useState(false);
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
      setDate(initial.writeoff_date); setReason(initial.reason);
      setRespId(initial.responsible_candidate_id ?? "");
      setRecovery(Number(initial.recovery_amount)); setViaPayroll(initial.recovery_via_payroll);
      setNotes(initial.notes);
      const { data } = await supabase.from("inv_write_off_lines" as never).select("*").eq("writeoff_id", initial.id);
      setLines(((data as unknown as Record<string, unknown>[]) ?? []).map((r) => ({
        item_id: String(r.item_id), size_value: String(r.size_value ?? ""),
        qty: Number(r.qty ?? 0), unit_value: Number(r.unit_value ?? 0), notes: String(r.notes ?? ""),
      })));
    } else {
      setLocType("warehouse"); setLocId(""); setDate(new Date().toISOString().slice(0, 10));
      setReason("damaged"); setRespId(""); setRecovery(0); setViaPayroll(false); setNotes(""); setLines([]);
    }
  });

  async function save(target: "draft" | "approve") {
    if (!locId) { toast.error("Pick location"); return; }
    if (!lines.length || lines.some((l) => !l.item_id || l.qty <= 0)) { toast.error("Add items with qty"); return; }
    setSaving(true);
    try {
      const linesPayload = lines.map((l) => ({
        item_id: l.item_id, size_value: l.size_value, qty: l.qty,
        unit_value: l.unit_value, line_total: l.qty * l.unit_value, notes: l.notes,
      }));
      let id = initial?.id;
      if (initial) {
        await supabase.from("inv_write_offs" as never).update({
          location_type: locType, location_id: locId, writeoff_date: date,
          reason, responsible_candidate_id: respId || null,
          recovery_amount: recovery, recovery_via_payroll: viaPayroll, notes,
        } as never).eq("id", initial.id);
        await supabase.from("inv_write_off_lines" as never).delete().eq("writeoff_id", initial.id);
        await supabase.from("inv_write_off_lines" as never).insert(linesPayload.map((l) => ({ ...l, writeoff_id: initial.id })) as never);
      } else {
        const n = await nextSeq("inv_writeoff_number_seq");
        const number = fmtNumber("WO", n);
        const { data: { user } } = await supabase.auth.getUser();
        const { data: ins, error } = await supabase.from("inv_write_offs" as never).insert({
          writeoff_number: number, writeoff_date: date,
          location_type: locType, location_id: locId, reason,
          responsible_candidate_id: respId || null, recovery_amount: recovery, recovery_via_payroll: viaPayroll,
          status: "draft", notes, created_by: user?.id ?? null,
        } as never).select("id").single();
        if (error) throw error;
        id = (ins as unknown as { id: string }).id;
        await supabase.from("inv_write_off_lines" as never).insert(linesPayload.map((l) => ({ ...l, writeoff_id: id })) as never);
      }

      if (target === "approve" && id) {
        // Check approval threshold
        const { data: setting } = await supabase.from("inv_settings" as never).select("value").eq("key", "approval_thresholds").maybeSingle();
        const thr = ((setting as unknown as { value?: { writeoff_amount?: number } } | null)?.value?.writeoff_amount) ?? 5000;
        const total = lines.reduce((s, l) => s + l.qty * l.unit_value, 0);
        const above = total >= thr;
        const msg = above
          ? `Total ₹${total.toLocaleString("en-IN")} is at/above the ₹${thr.toLocaleString("en-IN")} threshold — owner approval required. Continue?`
          : "Stock will be deducted from the holder.";
        if (!(await confirmAction({ title: above ? "Owner approval required" : "Approve write-off?", description: msg, confirmText: "Approve" }))) { setSaving(false); return; }
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("inv_write_offs" as never).update({
          status: "approved", approved_by: user?.id ?? null, approved_at: new Date().toISOString(),
        } as never).eq("id", id);
        // Deduct from holder, post into scrap
        const movs = lines.flatMap((l) => [
          { movement_type: "WRITE_OFF_OUT", location_type: locType, location_id: locId, item_id: l.item_id, size_value: l.size_value, qty_change: -l.qty, reference_type: "writeoff", reference_id: id!, notes: reason },
          { movement_type: "WRITE_OFF_IN", location_type: "scrap" as LocationType, location_id: id!, item_id: l.item_id, size_value: l.size_value, qty_change: l.qty, reference_type: "writeoff", reference_id: id! },
        ]);
        await postMovements(movs);
        // Queue payroll recovery
        if (viaPayroll && respId && recovery > 0) {
          await supabase.from("inv_payroll_recoveries" as never).insert({
            writeoff_id: id, candidate_id: respId, amount: recovery, status: "pending",
            notes: `Auto-queued from write-off ${initial?.writeoff_number ?? ""}`,
          } as never);
        }
      }

      void logActivity({ module: MODULE, action: target === "approve" ? "approve" : (initial ? "update" : "create"), entityType: ENTITY, entityId: id, entityLabel: initial?.writeoff_number ?? "Write-off" });
      toast.success(target === "approve" ? "Approved — stock deducted" : "Saved");
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
        <DialogHeader>
          <DialogTitle>{initial ? `Write-off ${initial.writeoff_number}` : "New Write-off"}</DialogTitle>
          <DialogDescription>Damaged/lost items from a holder.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2"><Label>Holder Type</Label>
              <Select value={locType} onValueChange={(v) => { setLocType(v as LocationType); setLocId(""); }} disabled={!isDraft}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["warehouse", "branch", "field_officer", "guard"] as LocationType[]).map((t) => <SelectItem key={t} value={t}>{LOCATION_TYPE_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 sm:col-span-2"><Label>Holder</Label>
              <Select value={locId} onValueChange={setLocId} disabled={!isDraft}>
                <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                <SelectContent>{locOptions().map((o) => <SelectItem key={o.id} value={o.id}>{"full_name" in o ? `${o.full_name} (${o.employee_code})` : (o as { name: string }).name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={!isDraft} /></div>
            <div className="grid gap-2"><Label>Reason</Label>
              <Select value={reason} onValueChange={setReason} disabled={!isDraft}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>Responsible Employee</Label>
              <Select value={respId} onValueChange={setRespId} disabled={!isDraft}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>{candidates.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>Recovery Amount ₹</Label><Input type="number" min={0} value={recovery} onChange={(e) => setRecovery(Number(e.target.value) || 0)} disabled={!isDraft} /></div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 sm:col-span-2">
              <div><div className="text-sm font-medium">Recover via payroll</div><div className="text-xs text-muted-foreground">Auto-deduct from next payroll cycle</div></div>
              <Switch checked={viaPayroll} onCheckedChange={setViaPayroll} disabled={!isDraft} />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-sm font-semibold">Items</Label>
              {isDraft && <Button size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, { item_id: "", size_value: "", qty: 1, unit_value: 0, notes: "" }])}><Plus className="mr-1 h-3.5 w-3.5" />Add line</Button>}
            </div>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 w-16">Size</th><th className="px-3 py-2 w-20 text-right">Qty</th><th className="px-3 py-2 w-24 text-right">Unit ₹</th><th className="px-3 py-2">Notes</th>{isDraft && <th className="px-3 py-2 w-10"></th>}</tr>
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
                        <td className="px-2 py-1.5"><Input type="number" min={0} className="h-9 text-right" disabled={!isDraft} value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, qty: Number(e.target.value) || 0 } : x))} /></td>
                        <td className="px-2 py-1.5"><Input type="number" min={0} className="h-9 text-right" disabled={!isDraft} value={l.unit_value} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, unit_value: Number(e.target.value) || 0 } : x))} /></td>
                        <td className="px-2 py-1.5"><Input className="h-9" disabled={!isDraft} value={l.notes} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, notes: e.target.value } : x))} /></td>
                        {isDraft && <td className="px-2 py-1.5"><Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:text-destructive" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}><Trash2 className="h-3.5 w-3.5" /></Button></td>}
                      </tr>
                    );
                  })}
                  {!lines.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground">No lines.</td></tr>}
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
