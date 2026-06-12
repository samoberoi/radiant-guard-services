import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, Truck, Eye, Trash2 } from "lucide-react";
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

export const Route = createFileRoute("/admin/inventory/transfers")({ component: TransfersPage });

const MODULE = "Inventory Transfers";
const ENTITY = "inv_transfers";

type Transfer = {
  id: string; transfer_number: string; transfer_date: string; status: string;
  source_type: string; source_id: string; destination_type: string; destination_id: string;
  vehicle_number: string; driver_name: string; driver_phone: string; notes: string;
};
type Warehouse = { id: string; name: string };
type Branch = { id: string; name: string; code: string };
type Item = { id: string; name: string; item_code: string; is_sized: boolean };
type Line = { id?: string; item_id: string; size_value: string; dispatched_qty: number; received_qty: number; variance_reason: string };

function TransfersPage() {
  const qc = useQueryClient();
  const { data: transfers = [] } = useQuery({
    queryKey: ["inv", "transfers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_transfers" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Transfer[]) ?? [];
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
      const { data, error } = await supabase.from("branches" as never).select("id,name,code").order("name");
      if (error) throw error;
      return (data as unknown as Branch[]) ?? [];
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

  const locName = (type: string, id: string): string => {
    if (type === "warehouse") return warehouses.find((w) => w.id === id)?.name ?? "—";
    if (type === "branch") return branches.find((b) => b.id === id)?.name ?? "—";
    return "—";
  };

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Transfer | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return transfers;
    return transfers.filter((t) => t.transfer_number.toLowerCase().includes(q));
  }, [transfers, query]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["inv", "transfers"] });
    qc.invalidateQueries({ queryKey: ["inv", "balances-sum"] });
  };

  const deleteMut = useMutation({
    mutationFn: async (t: Transfer) => {
      if (t.status !== "draft") throw new Error("Only drafts can be deleted.");
      const { error } = await supabase.from("inv_transfers" as never).delete().eq("id", t.id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "delete", entityType: ENTITY, entityId: t.id, entityLabel: t.transfer_number });
    },
    onSuccess: invalidate,
  });

  return (
    <div>
      <PageHeader title="Internal Transfers" description="Move stock warehouse → branch, or branch → branch. Dispatch decreases source; receipt increases destination." crumbs={[{ label: "Inventory", to: "/admin/inventory" }, { label: "Transfers" }]} />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search transfer #…" className="h-10 rounded-lg pl-9" />
        </div>
        <Button onClick={() => { setActive(null); setOpen(true); }} className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-1.5 h-4 w-4" />New Transfer
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-clip">
          <table className="ios-table w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Transfer #</th>
                <th className="px-5 py-3">From</th>
                <th className="px-5 py-3">To</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Vehicle</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right" data-col="actions">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs">{t.transfer_number}</td>
                  <td className="px-5 py-3">{locName(t.source_type, t.source_id)}</td>
                  <td className="px-5 py-3">{locName(t.destination_type, t.destination_id)}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{t.transfer_date}</td>
                  <td className="px-5 py-3 text-xs">{t.vehicle_number || "—"}</td>
                  <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${statusBadgeClass(t.status)}`}>{t.status.replace("_", " ")}</span></td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setActive(t); setOpen(true); }}><Eye className="h-4 w-4" /></Button>
                      {t.status === "draft" && (
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:text-destructive" onClick={async () => {
                          if (!(await confirmAction({ title: "Delete?", description: `Delete ${t.transfer_number}?`, confirmText: "Delete" }))) return;
                          try { await deleteMut.mutateAsync(t); toast.success("Deleted"); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                        }}><Trash2 className="h-4 w-4" /></Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground"><Truck className="mx-auto mb-2 h-8 w-8 opacity-40" />No transfers yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <TransferDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setActive(null); }} initial={active} warehouses={warehouses} branches={branches} items={items} onSaved={invalidate} />
    </div>
  );
}

function TransferDialog({ open, onOpenChange, initial, warehouses, branches, items, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; initial: Transfer | null;
  warehouses: Warehouse[]; branches: Branch[]; items: Item[]; onSaved: () => void;
}) {
  const [sourceType, setSourceType] = useState<LocationType>("warehouse");
  const [sourceId, setSourceId] = useState("");
  const [destType, setDestType] = useState<LocationType>("branch");
  const [destId, setDestId] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [vehicle, setVehicle] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const isDraft = !initial || initial.status === "draft";
  const isDispatched = initial?.status === "dispatched" || initial?.status === "in_transit";
  const isReceived = initial?.status === "acknowledged";

  useResetOnOpen(open, async () => {
    if (initial) {
      setSourceType(initial.source_type as LocationType);
      setSourceId(initial.source_id);
      setDestType(initial.destination_type as LocationType);
      setDestId(initial.destination_id);
      setTransferDate(initial.transfer_date);
      setVehicle(initial.vehicle_number); setDriverName(initial.driver_name); setDriverPhone(initial.driver_phone);
      setNotes(initial.notes);
      const { data } = await supabase.from("inv_transfer_lines" as never).select("*").eq("transfer_id", initial.id).order("sort_order");
      setLines(((data as unknown as Record<string, unknown>[]) ?? []).map((r) => ({
        id: String(r.id),
        item_id: String(r.item_id),
        size_value: String(r.size_value ?? ""),
        dispatched_qty: Number(r.dispatched_qty ?? 0),
        received_qty: Number(r.received_qty ?? 0),
        variance_reason: String(r.variance_reason ?? ""),
      })));
    } else {
      setSourceType("warehouse"); setSourceId(""); setDestType("branch"); setDestId("");
      setTransferDate(new Date().toISOString().slice(0, 10));
      setVehicle(""); setDriverName(""); setDriverPhone(""); setNotes(""); setLines([]);
    }
  });

  function srcOptions() { return sourceType === "warehouse" ? warehouses : branches; }
  function dstOptions() { return destType === "warehouse" ? warehouses : branches; }

  async function saveDraft() {
    if (!sourceId || !destId) { toast.error("Pick source and destination"); return; }
    if (!lines.length || lines.some((l) => !l.item_id || l.dispatched_qty <= 0)) { toast.error("Add lines with item + qty"); return; }
    setSaving(true);
    try {
      const linesPayload = lines.map((l, idx) => ({
        item_id: l.item_id, size_value: l.size_value,
        dispatched_qty: l.dispatched_qty, received_qty: 0, sort_order: idx,
      }));
      if (initial) {
        await supabase.from("inv_transfers" as never).update({
          source_type: sourceType, source_id: sourceId,
          destination_type: destType, destination_id: destId,
          transfer_date: transferDate, vehicle_number: vehicle, driver_name: driverName, driver_phone: driverPhone, notes,
        } as never).eq("id", initial.id);
        await supabase.from("inv_transfer_lines" as never).delete().eq("transfer_id", initial.id);
        await supabase.from("inv_transfer_lines" as never).insert(linesPayload.map((l) => ({ ...l, transfer_id: initial.id })) as never);
      } else {
        const n = await nextSeq("inv_transfer_number_seq");
        const number = fmtNumber("TR", n);
        const { data: ins, error } = await supabase.from("inv_transfers" as never).insert({
          transfer_number: number, source_type: sourceType, source_id: sourceId,
          destination_type: destType, destination_id: destId,
          transfer_date: transferDate, status: "draft",
          vehicle_number: vehicle, driver_name: driverName, driver_phone: driverPhone, notes,
        } as never).select("id").single();
        if (error) throw error;
        const tid = (ins as unknown as { id: string }).id;
        await supabase.from("inv_transfer_lines" as never).insert(linesPayload.map((l) => ({ ...l, transfer_id: tid })) as never);
      }
      void logActivity({ module: MODULE, action: initial ? "update" : "create", entityType: ENTITY, entityLabel: initial?.transfer_number ?? "Transfer" });
      toast.success("Draft saved");
      onSaved(); onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function dispatch() {
    if (!initial) { await saveDraft(); return; }
    if (!(await confirmAction({ title: "Dispatch this transfer?", description: "Stock will be deducted from the source location.", confirmText: "Dispatch" }))) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("inv_transfers" as never).update({
        status: "in_transit", dispatched_by: user?.id ?? null, dispatched_at: new Date().toISOString(),
      } as never).eq("id", initial.id);
      await postMovements(lines.filter((l) => l.dispatched_qty > 0).map((l) => ({
        movement_type: "TRANSFER_OUT", location_type: sourceType, location_id: sourceId,
        item_id: l.item_id, size_value: l.size_value, qty_change: -l.dispatched_qty,
        reference_type: "transfer", reference_id: initial.id,
      })));
      void logActivity({ module: MODULE, action: "dispatch", entityType: ENTITY, entityId: initial.id, entityLabel: initial.transfer_number });
      toast.success("Dispatched");
      onSaved(); onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function receive() {
    if (!initial) return;
    if (lines.some((l) => l.received_qty > l.dispatched_qty)) { toast.error("Received cannot exceed dispatched"); return; }
    if (!(await confirmAction({ title: "Acknowledge receipt?", description: "Stock will be added to the destination location.", confirmText: "Receive" }))) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // Update line received qty
      for (const l of lines) {
        if (l.id) await supabase.from("inv_transfer_lines" as never).update({ received_qty: l.received_qty, variance_reason: l.variance_reason } as never).eq("id", l.id);
      }
      await supabase.from("inv_transfers" as never).update({
        status: "acknowledged", received_by: user?.id ?? null, received_at: new Date().toISOString(),
      } as never).eq("id", initial.id);
      // Post IN at destination for received qty
      await postMovements(lines.filter((l) => l.received_qty > 0).map((l) => ({
        movement_type: "TRANSFER_IN", location_type: destType, location_id: destId,
        item_id: l.item_id, size_value: l.size_value, qty_change: l.received_qty,
        reference_type: "transfer", reference_id: initial.id,
      })));
      // If variance, post adjustment-style write off at scrap for the missing qty (already deducted from source, never reaches destination)
      const losses = lines.filter((l) => l.dispatched_qty - l.received_qty > 0).map((l) => ({
        movement_type: "TRANSIT_LOSS" as const,
        location_type: "scrap" as LocationType,
        location_id: initial.id,
        item_id: l.item_id, size_value: l.size_value, qty_change: l.dispatched_qty - l.received_qty,
        reference_type: "transfer", reference_id: initial.id,
        notes: l.variance_reason,
      }));
      if (losses.length) await postMovements(losses);
      void logActivity({ module: MODULE, action: "receive", entityType: ENTITY, entityId: initial.id, entityLabel: initial.transfer_number });
      toast.success("Receipt acknowledged");
      onSaved(); onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{initial ? `Transfer ${initial.transfer_number}` : "New Transfer"}</DialogTitle>
          <DialogDescription>{initial?.status === "acknowledged" ? "Completed." : isDispatched ? "In transit — receive to complete." : "Build line items and dispatch."}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">From</div>
              <div className="grid gap-2">
                <Select value={sourceType} onValueChange={(v) => { setSourceType(v as LocationType); setSourceId(""); }} disabled={!isDraft}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warehouse">Warehouse</SelectItem>
                    <SelectItem value="branch">Branch</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sourceId} onValueChange={setSourceId} disabled={!isDraft}>
                  <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                  <SelectContent>{srcOptions().map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-xl border border-border p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">To</div>
              <div className="grid gap-2">
                <Select value={destType} onValueChange={(v) => { setDestType(v as LocationType); setDestId(""); }} disabled={!isDraft}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warehouse">Warehouse</SelectItem>
                    <SelectItem value="branch">Branch</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={destId} onValueChange={setDestId} disabled={!isDraft}>
                  <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                  <SelectContent>{dstOptions().map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div className="grid gap-2"><Label>Date</Label><Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} disabled={!isDraft} /></div>
            <div className="grid gap-2"><Label>Vehicle</Label><Input value={vehicle} onChange={(e) => setVehicle(e.target.value)} disabled={isReceived} /></div>
            <div className="grid gap-2"><Label>Driver</Label><Input value={driverName} onChange={(e) => setDriverName(e.target.value)} disabled={isReceived} /></div>
            <div className="grid gap-2"><Label>Driver Phone</Label><Input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} disabled={isReceived} /></div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-sm font-semibold">Items</Label>
              {isDraft && <Button size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, { item_id: "", size_value: "", dispatched_qty: 1, received_qty: 0, variance_reason: "" }])}><Plus className="mr-1 h-3.5 w-3.5" />Add line</Button>}
            </div>
            <div className="overflow-x-clip rounded-xl border border-border">
              <table className="ios-table w-full text-sm">
                <thead className="bg-secondary/60 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 w-16">Size</th>
                    <th className="px-3 py-2 w-24 text-right">Dispatched</th>
                    {isDispatched && <th className="px-3 py-2 w-24 text-right">Received</th>}
                    {isDispatched && <th className="px-3 py-2">Variance Reason</th>}
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
                        <td className="px-2 py-1.5">
                          <Input className="h-9" disabled={!isDraft || !it?.is_sized} value={l.size_value} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, size_value: e.target.value } : x))} placeholder={it?.is_sized ? "M/L" : "—"} />
                        </td>
                        <td className="px-2 py-1.5"><Input type="number" min={0} disabled={!isDraft} className="h-9 text-right" value={l.dispatched_qty} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, dispatched_qty: Number(e.target.value) || 0 } : x))} /></td>
                        {isDispatched && <td className="px-2 py-1.5"><Input type="number" min={0} max={l.dispatched_qty} className="h-9 text-right" value={l.received_qty} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, received_qty: Number(e.target.value) || 0 } : x))} /></td>}
                        {isDispatched && <td className="px-2 py-1.5"><Input className="h-9" value={l.variance_reason} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, variance_reason: e.target.value } : x))} placeholder={l.received_qty < l.dispatched_qty ? "Required" : "—"} /></td>}
                        {isDraft && <td className="px-2 py-1.5"><Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:text-destructive" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}><Trash2 className="h-3.5 w-3.5" /></Button></td>}
                      </tr>
                    );
                  })}
                  {!lines.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-muted-foreground">No lines.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isReceived} rows={2} /></div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Close</Button>
          {isDraft && <Button variant="outline" onClick={saveDraft} disabled={saving}>Save Draft</Button>}
          {isDraft && initial && <Button onClick={dispatch} disabled={saving}>{saving ? "Dispatching…" : "Dispatch"}</Button>}
          {isDispatched && <Button onClick={receive} disabled={saving}>{saving ? "Saving…" : "Acknowledge Receipt"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useResetOnOpen(open: boolean, reset: () => void) {
  const [last, setLast] = useState(false);
  if (open !== last) { setLast(open); if (open) reset(); }
}
