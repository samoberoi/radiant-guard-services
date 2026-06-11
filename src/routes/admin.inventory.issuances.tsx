import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, UserCheck, Eye, Trash2 } from "lucide-react";
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
import { nextSeq, fmtNumber, postMovements, statusBadgeClass, type LocationType } from "@/lib/inv-helpers";

export const Route = createFileRoute("/admin/inventory/issuances")({ component: IssuancesPage });

const MODULE = "Inventory Issuances";
const ENTITY = "inv_issuances";

type Issuance = {
  id: string; issuance_number: string; issuance_type: string; issuance_date: string; status: string;
  source_type: string; source_id: string; destination_type: string; destination_id: string;
  ack_method: string; notes: string;
};
type Warehouse = { id: string; name: string };
type Branch = { id: string; name: string };
type Candidate = { id: string; full_name: string; employee_code: string; role_key: string };
type Item = { id: string; name: string; item_code: string; is_sized: boolean };
type Line = { id?: string; item_id: string; size_value: string; qty: number; condition: string; notes: string };

function IssuancesPage() {
  const qc = useQueryClient();
  const { data: issuances = [] } = useQuery({
    queryKey: ["inv", "issuances"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_issuances" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Issuance[]) ?? [];
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
      const { data, error } = await supabase.from("candidates" as never).select("id,full_name,employee_code,role_key").eq("status", "active").order("full_name");
      if (error) throw error;
      return (data as unknown as Candidate[]) ?? [];
    },
  });
  const { data: items = [] } = useQuery({
    queryKey: ["inv", "items-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_items" as never).select("id,name,item_code,is_sized").eq("enabled", true).order("name");
      if (error) throw error;
      return (data as unknown as Item[]) ?? [];
    },
  });

  const fos = useMemo(() => candidates.filter((c) => /field|fo|supervisor|officer/i.test(c.role_key)), [candidates]);
  const guards = useMemo(() => candidates.filter((c) => !/field|fo|supervisor|officer|manager|head/i.test(c.role_key)), [candidates]);
  const candMap = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const whMap = useMemo(() => new Map(warehouses.map((w) => [w.id, w.name])), [warehouses]);
  const brMap = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);

  const locName = (type: string, id: string): string => {
    if (type === "warehouse") return whMap.get(id) ?? "—";
    if (type === "branch") return brMap.get(id) ?? "—";
    if (type === "field_officer" || type === "guard") return candMap.get(id)?.full_name ?? "—";
    return "—";
  };

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Issuance | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return issuances;
    return issuances.filter((i) => i.issuance_number.toLowerCase().includes(q));
  }, [issuances, query]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["inv", "issuances"] });
    qc.invalidateQueries({ queryKey: ["inv", "balances-sum"] });
  };

  const deleteMut = useMutation({
    mutationFn: async (i: Issuance) => {
      if (i.status !== "draft") throw new Error("Only drafts can be deleted.");
      const { error } = await supabase.from("inv_issuances" as never).delete().eq("id", i.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return (
    <div>
      <PageHeader title="Issuances" description="Issue items: branch → field officer, or field officer / branch → guard. Stock moves on receiver acknowledgement." crumbs={[{ label: "Inventory", to: "/admin/inventory" }, { label: "Issuances" }]} />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search issuance #…" className="h-10 rounded-lg pl-9" />
        </div>
        <Button onClick={() => { setActive(null); setOpen(true); }} className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-1.5 h-4 w-4" />New Issuance
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-clip">
          <table className="ios-table w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Issuance #</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">From</th>
                <th className="px-5 py-3">To</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((i) => (
                <tr key={i.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs">{i.issuance_number}</td>
                  <td className="px-5 py-3 text-xs uppercase tracking-wider text-muted-foreground">{i.issuance_type.replace("_", " ")}</td>
                  <td className="px-5 py-3">{locName(i.source_type, i.source_id)}</td>
                  <td className="px-5 py-3 font-medium">{locName(i.destination_type, i.destination_id)}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{i.issuance_date}</td>
                  <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${statusBadgeClass(i.status)}`}>{i.status}</span></td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setActive(i); setOpen(true); }}><Eye className="h-4 w-4" /></Button>
                      {i.status === "draft" && (
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:text-destructive" onClick={async () => {
                          if (!(await confirmAction({ title: "Delete?", description: `Delete ${i.issuance_number}?`, confirmText: "Delete" }))) return;
                          try { await deleteMut.mutateAsync(i); toast.success("Deleted"); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                        }}><Trash2 className="h-4 w-4" /></Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground"><UserCheck className="mx-auto mb-2 h-8 w-8 opacity-40" />No issuances yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <IssuanceDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setActive(null); }} initial={active} warehouses={warehouses} branches={branches} fos={fos} guards={guards} candidates={candidates} items={items} onSaved={invalidate} />
    </div>
  );
}

const ISSUANCE_TYPES = [
  { key: "branch_to_fo", label: "Branch → Field Officer", source: "branch", dest: "field_officer" },
  { key: "branch_to_guard", label: "Branch → Guard", source: "branch", dest: "guard" },
  { key: "fo_to_guard", label: "Field Officer → Guard", source: "field_officer", dest: "guard" },
  { key: "warehouse_to_fo", label: "Warehouse → Field Officer", source: "warehouse", dest: "field_officer" },
  { key: "warehouse_to_guard", label: "Warehouse → Guard", source: "warehouse", dest: "guard" },
] as const;

function IssuanceDialog({ open, onOpenChange, initial, warehouses, branches, fos, guards, candidates, items, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; initial: Issuance | null;
  warehouses: Warehouse[]; branches: Branch[]; fos: Candidate[]; guards: Candidate[]; candidates: Candidate[]; items: Item[];
  onSaved: () => void;
}) {
  const [type, setType] = useState<string>("branch_to_guard");
  const [sourceId, setSourceId] = useState("");
  const [destId, setDestId] = useState("");
  const [issDate, setIssDate] = useState(new Date().toISOString().slice(0, 10));
  const [ackMethod, setAckMethod] = useState("signature");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  const meta = ISSUANCE_TYPES.find((t) => t.key === type)!;
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const isDraft = !initial || initial.status === "draft";
  const isIssued = initial?.status === "issued";

  function sourceOptions() {
    if (meta.source === "warehouse") return warehouses;
    if (meta.source === "branch") return branches;
    if (meta.source === "field_officer") return fos;
    return [];
  }
  function destOptions() {
    if (meta.dest === "field_officer") return fos;
    if (meta.dest === "guard") return guards;
    return [];
  }

  useResetOnOpen(open, async () => {
    if (initial) {
      setType(initial.issuance_type); setSourceId(initial.source_id); setDestId(initial.destination_id);
      setIssDate(initial.issuance_date); setAckMethod(initial.ack_method || "signature"); setNotes(initial.notes);
      const { data } = await supabase.from("inv_issuance_lines" as never).select("*").eq("issuance_id", initial.id).order("sort_order");
      setLines(((data as unknown as Record<string, unknown>[]) ?? []).map((r) => ({
        id: String(r.id),
        item_id: String(r.item_id),
        size_value: String(r.size_value ?? ""),
        qty: Number(r.qty ?? 0),
        condition: String(r.condition ?? "new"),
        notes: String(r.notes ?? ""),
      })));
    } else {
      setType("branch_to_guard"); setSourceId(""); setDestId("");
      setIssDate(new Date().toISOString().slice(0, 10));
      setAckMethod("signature"); setNotes(""); setLines([]);
    }
  });

  async function saveOrIssue(target: "draft" | "issue") {
    if (!sourceId || !destId) { toast.error("Pick source and destination"); return; }
    if (!lines.length || lines.some((l) => !l.item_id || l.qty <= 0)) { toast.error("Add items with qty"); return; }
    setSaving(true);
    try {
      const linesPayload = lines.map((l, idx) => ({
        item_id: l.item_id, size_value: l.size_value, qty: l.qty,
        condition: l.condition, notes: l.notes, sort_order: idx,
      }));
      let id = initial?.id;
      if (initial) {
        await supabase.from("inv_issuances" as never).update({
          issuance_type: type, source_type: meta.source, source_id: sourceId,
          destination_type: meta.dest, destination_id: destId,
          issuance_date: issDate, ack_method: ackMethod, notes,
        } as never).eq("id", initial.id);
        await supabase.from("inv_issuance_lines" as never).delete().eq("issuance_id", initial.id);
        await supabase.from("inv_issuance_lines" as never).insert(linesPayload.map((l) => ({ ...l, issuance_id: initial.id })) as never);
      } else {
        const n = await nextSeq("inv_issuance_number_seq");
        const number = fmtNumber("ISS", n);
        const { data: ins, error } = await supabase.from("inv_issuances" as never).insert({
          issuance_number: number, issuance_type: type, source_type: meta.source, source_id: sourceId,
          destination_type: meta.dest, destination_id: destId,
          issuance_date: issDate, status: "draft", ack_method: ackMethod, notes,
        } as never).select("id").single();
        if (error) throw error;
        id = (ins as unknown as { id: string }).id;
        await supabase.from("inv_issuance_lines" as never).insert(linesPayload.map((l) => ({ ...l, issuance_id: id })) as never);
      }

      if (target === "issue" && id) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("inv_issuances" as never).update({
          status: "issued", issued_by: user?.id ?? null, issued_at: new Date().toISOString(),
        } as never).eq("id", id);
        // Post movements: out from source, in to destination
        const movs = lines.flatMap((l) => [
          { movement_type: `ISSUE_${meta.dest.toUpperCase()}_OUT`, location_type: meta.source as LocationType, location_id: sourceId, item_id: l.item_id, size_value: l.size_value, qty_change: -l.qty, reference_type: "issuance", reference_id: id! },
          { movement_type: `ISSUE_${meta.dest.toUpperCase()}_IN`, location_type: meta.dest as LocationType, location_id: destId, item_id: l.item_id, size_value: l.size_value, qty_change: l.qty, reference_type: "issuance", reference_id: id! },
        ]);
        await postMovements(movs);
      }

      void logActivity({ module: MODULE, action: target === "issue" ? "issue" : (initial ? "update" : "create"), entityType: ENTITY, entityId: id, entityLabel: initial?.issuance_number ?? "Issuance" });
      toast.success(target === "issue" ? "Issued — stock moved" : "Saved");
      onSaved(); onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function acknowledge() {
    if (!initial) return;
    if (!(await confirmAction({ title: "Confirm acknowledgement?", description: "Mark this issuance as acknowledged by the receiver.", confirmText: "Acknowledge" }))) return;
    try {
      await supabase.from("inv_issuances" as never).update({
        status: "acknowledged", acknowledged_at: new Date().toISOString(),
      } as never).eq("id", initial.id);
      void logActivity({ module: MODULE, action: "acknowledge", entityType: ENTITY, entityId: initial.id, entityLabel: initial.issuance_number });
      toast.success("Acknowledged");
      onSaved(); onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{initial ? `Issuance ${initial.issuance_number}` : "New Issuance"}</DialogTitle>
          <DialogDescription>{initial?.status === "acknowledged" ? "Acknowledged." : isIssued ? "Issued — waiting for acknowledgement." : "Build and issue."}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2"><Label>Type</Label>
            <Select value={type} onValueChange={(v) => { setType(v); setSourceId(""); setDestId(""); }} disabled={!isDraft}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ISSUANCE_TYPES.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>From ({meta.source.replace("_", " ")})</Label>
              <Select value={sourceId} onValueChange={setSourceId} disabled={!isDraft}>
                <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                <SelectContent>{sourceOptions().map((o) => <SelectItem key={o.id} value={o.id}>{"full_name" in o ? `${o.full_name} (${o.employee_code})` : o.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>To ({meta.dest.replace("_", " ")})</Label>
              <Select value={destId} onValueChange={setDestId} disabled={!isDraft}>
                <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                <SelectContent>{destOptions().map((o) => <SelectItem key={o.id} value={o.id}>{"full_name" in o ? `${o.full_name} (${o.employee_code})` : (o as { name: string }).name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>Date</Label><Input type="date" value={issDate} onChange={(e) => setIssDate(e.target.value)} disabled={!isDraft} /></div>
            <div className="grid gap-2"><Label>Ack Method</Label>
              <Select value={ackMethod} onValueChange={setAckMethod} disabled={initial?.status === "acknowledged"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="signature">Signature</SelectItem>
                  <SelectItem value="photo">Photo</SelectItem>
                  <SelectItem value="otp">OTP</SelectItem>
                  <SelectItem value="thumbprint">Thumbprint</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-sm font-semibold">Items</Label>
              {isDraft && <Button size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, { item_id: "", size_value: "", qty: 1, condition: "new", notes: "" }])}><Plus className="mr-1 h-3.5 w-3.5" />Add line</Button>}
            </div>
            <div className="overflow-x-clip rounded-xl border border-border">
              <table className="ios-table w-full text-sm">
                <thead className="bg-secondary/60 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 w-16">Size</th>
                    <th className="px-3 py-2 w-20 text-right">Qty</th>
                    <th className="px-3 py-2 w-28">Condition</th>
                    <th className="px-3 py-2">Notes</th>
                    {isDraft && <th className="px-3 py-2 w-10"></th>}
                  </tr>
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
                        <td className="px-2 py-1.5">
                          <Select value={l.condition} onValueChange={(v) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, condition: v } : x))} disabled={!isDraft}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="new">New</SelectItem><SelectItem value="used_good">Used – Good</SelectItem><SelectItem value="used_fair">Used – Fair</SelectItem></SelectContent>
                          </Select>
                        </td>
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

          <div className="grid gap-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={initial?.status === "acknowledged"} rows={2} /></div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Close</Button>
          {isDraft && <Button variant="outline" onClick={() => saveOrIssue("draft")} disabled={saving}>Save Draft</Button>}
          {isDraft && <Button onClick={() => saveOrIssue("issue")} disabled={saving}>{saving ? "Issuing…" : "Issue Now"}</Button>}
          {isIssued && <Button onClick={acknowledge} disabled={saving}>Mark Acknowledged</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useResetOnOpen(open: boolean, reset: () => void) {
  const [last, setLast] = useState(false);
  if (open !== last) { setLast(open); if (open) reset(); }
}
