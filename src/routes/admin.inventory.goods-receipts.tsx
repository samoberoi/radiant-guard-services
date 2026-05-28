import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, PackageCheck, Eye, Trash2 } from "lucide-react";
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
import { nextSeq, fmtNumber, postMovements, statusBadgeClass } from "@/lib/inv-helpers";

export const Route = createFileRoute("/admin/inventory/goods-receipts")({ component: GRNPage });

const MODULE = "Inventory Delivery Challans";
const ENTITY = "inv_goods_receipts";

type GRN = {
  id: string; grn_number: string; receipt_date: string; status: string;
  po_id: string | null; vendor_id: string | null; warehouse_id: string;
  vendor_invoice_number: string; vendor_challan_number: string; vehicle_number: string; notes: string;
};
type PO = { id: string; po_number: string; vendor_id: string | null; destination_warehouse_id: string | null; status: string };
type POLine = { id: string; item_id: string; size_value: string; ordered_qty: number; received_qty: number };
type Item = { id: string; name: string; item_code: string; is_sized: boolean };
type Vendor = { id: string; name: string };
type Warehouse = { id: string; name: string };
type Line = { id?: string; po_line_id: string | null; item_id: string; size_value: string; ordered_qty: number; received_qty: number; accepted_qty: number; rejected_qty: number; rejection_reason: string };

function GRNPage() {
  const qc = useQueryClient();
  const { data: grns = [] } = useQuery({
    queryKey: ["inv", "grns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_goods_receipts" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as GRN[]) ?? [];
    },
  });
  const { data: pos = [] } = useQuery({
    queryKey: ["inv", "pos-open"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_purchase_orders" as never).select("id,po_number,vendor_id,destination_warehouse_id,status").in("status", ["open", "partially_received"]).order("po_date", { ascending: false });
      if (error) throw error;
      return (data as unknown as PO[]) ?? [];
    },
  });
  const { data: vendors = [] } = useQuery({
    queryKey: ["inv", "vendors-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_vendors" as never).select("id,name").eq("enabled", true);
      if (error) throw error;
      return (data as unknown as Vendor[]) ?? [];
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

  // Aggregate line totals per GRN (products count + total value using PO unit_price)
  const { data: lineAgg = new Map<string, { products: number; qty: number; value: number }>() } = useQuery({
    queryKey: ["inv", "grn-line-agg"],
    queryFn: async () => {
      const pageSize = 1000;
      let from = 0;
      const all: { grn_id: string; item_id: string; accepted_qty: number; rejected_qty: number; po_line_id: string | null }[] = [];
      while (true) {
        const { data, error } = await supabase
          .from("inv_goods_receipt_lines" as never)
          .select("grn_id,item_id,accepted_qty,rejected_qty,po_line_id")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const rows = (data as unknown as typeof all) ?? [];
        all.push(...rows);
        if (rows.length < pageSize) break;
        from += pageSize;
      }
      // Fetch unit prices for all referenced po_lines
      const polIds = Array.from(new Set(all.map((r) => r.po_line_id).filter(Boolean))) as string[];
      const priceMap = new Map<string, number>();
      for (let i = 0; i < polIds.length; i += 200) {
        const chunk = polIds.slice(i, i + 200);
        const { data: pls } = await supabase.from("inv_po_lines" as never).select("id,unit_price").in("id", chunk);
        for (const r of (pls as unknown as { id: string; unit_price: number }[]) ?? []) {
          priceMap.set(r.id, Number(r.unit_price ?? 0));
        }
      }
      const map = new Map<string, { products: number; qty: number; value: number; _items: Set<string> }>();
      for (const r of all) {
        const cur = map.get(r.grn_id) ?? { products: 0, qty: 0, value: 0, _items: new Set<string>() };
        const qty = Number(r.accepted_qty ?? 0) + Number(r.rejected_qty ?? 0);
        cur.qty += qty;
        cur.value += qty * (r.po_line_id ? priceMap.get(r.po_line_id) ?? 0 : 0);
        cur._items.add(r.item_id);
        map.set(r.grn_id, cur);
      }
      const out = new Map<string, { products: number; qty: number; value: number }>();
      for (const [k, v] of map) out.set(k, { products: v._items.size, qty: v.qty, value: v.value });
      return out;
    },
  });

  const vMap = useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors]);
  const wMap = useMemo(() => new Map(warehouses.map((w) => [w.id, w.name])), [warehouses]);
  const poMap = useMemo(() => new Map(pos.map((p) => [p.id, p])), [pos]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<GRN | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return grns;
    return grns.filter((g) => g.grn_number.toLowerCase().includes(q) || (g.vendor_invoice_number ?? "").toLowerCase().includes(q));
  }, [grns, query]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["inv", "grns"] });
    qc.invalidateQueries({ queryKey: ["inv", "pos-open"] });
    qc.invalidateQueries({ queryKey: ["inv", "pos"] });
    qc.invalidateQueries({ queryKey: ["inv", "balances-sum"] });
  };

  const deleteMut = useMutation({
    mutationFn: async (g: GRN) => {
      if (g.status === "received") throw new Error("Cannot delete a posted GRN. Create a stock adjustment instead.");
      const { error } = await supabase.from("inv_goods_receipts" as never).delete().eq("id", g.id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "delete", entityType: ENTITY, entityId: g.id, entityLabel: g.grn_number });
    },
    onSuccess: invalidate,
  });

  return (
    <div>
      <PageHeader title="Delivery Challans" description="Receive supplier deliveries against a Purchase Order. Posted challans increase warehouse stock." crumbs={[{ label: "Inventory", to: "/admin/inventory" }, { label: "Delivery Challans" }]} />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search challan, invoice…" className="h-10 rounded-lg pl-9" />
        </div>
        <Button onClick={() => setOpen(true)} className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-1.5 h-4 w-4" />New Delivery Challan
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Challan #</th>
                <th className="px-5 py-3">PO #</th>
                <th className="px-5 py-3">Supplier</th>
                <th className="px-5 py-3">Warehouse</th>
                <th className="px-5 py-3">Delivery Date</th>
                <th className="px-5 py-3 text-right">Products</th>
                <th className="px-5 py-3 text-right">Total Qty</th>
                <th className="px-5 py-3 text-right">Total Value</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((g) => {
                const agg = lineAgg.get(g.id) ?? { products: 0, qty: 0, value: 0 };
                return (
                <tr key={g.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs">{g.grn_number}</td>
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{g.po_id ? poMap.get(g.po_id)?.po_number ?? "—" : "—"}</td>
                  <td className="px-5 py-3">{g.vendor_id ? vMap.get(g.vendor_id) ?? "—" : "—"}</td>
                  <td className="px-5 py-3">{wMap.get(g.warehouse_id) ?? "—"}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{g.receipt_date}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{agg.products}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{agg.qty}</td>
                  <td className="px-5 py-3 text-right tabular-nums">₹{agg.value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                  <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${statusBadgeClass(g.status)}`}>{g.status}</span></td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setViewing(g)}><Eye className="h-4 w-4" /></Button>
                      {g.status !== "received" && (
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:text-destructive" onClick={async () => {
                          if (!(await confirmAction({ title: "Delete Delivery Challan?", description: `Delete ${g.grn_number}?`, confirmText: "Delete" }))) return;
                          try { await deleteMut.mutateAsync(g); toast.success("Deleted"); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                        }}><Trash2 className="h-4 w-4" /></Button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
              {!filtered.length && <tr><td colSpan={10} className="px-5 py-12 text-center text-sm text-muted-foreground"><PackageCheck className="mx-auto mb-2 h-8 w-8 opacity-40" />No delivery challans yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <GRNFormDialog open={open} onOpenChange={setOpen} pos={pos} onSaved={invalidate} />
      <GRNViewDialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)} grn={viewing} />
    </div>
  );
}

function GRNFormDialog({ open, onOpenChange, pos, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; pos: PO[]; onSaved: () => void }) {
  const [poId, setPoId] = useState<string>("");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [invoiceNo, setInvoiceNo] = useState("");
  const [challanNo, setChallanNo] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [items, setItems] = useState<Record<string, Item>>({});
  const [saving, setSaving] = useState(false);

  useResetOnOpen(open, async () => {
    setPoId(""); setReceiptDate(new Date().toISOString().slice(0, 10));
    setInvoiceNo(""); setChallanNo(""); setVehicleNo(""); setNotes(""); setLines([]); setItems({});
  });

  async function loadPo(id: string) {
    setPoId(id);
    if (!id) { setLines([]); return; }
    const { data: pls } = await supabase.from("inv_po_lines" as never).select("*").eq("po_id", id).order("sort_order");
    const polines = (pls as unknown as POLine[]) ?? [];
    setLines(polines.map((l) => ({
      po_line_id: l.id,
      item_id: l.item_id,
      size_value: l.size_value ?? "",
      ordered_qty: Number(l.ordered_qty),
      received_qty: Math.max(0, Number(l.ordered_qty) - Number(l.received_qty ?? 0)),
      accepted_qty: Math.max(0, Number(l.ordered_qty) - Number(l.received_qty ?? 0)),
      rejected_qty: 0,
      rejection_reason: "",
    })));
    const ids = polines.map((l) => l.item_id);
    if (ids.length) {
      const { data: its } = await supabase.from("inv_items" as never).select("id,name,item_code,is_sized").in("id", ids);
      const map: Record<string, Item> = {};
      for (const it of (its as unknown as Item[]) ?? []) map[it.id] = it;
      setItems(map);
    }
  }

  const po = pos.find((p) => p.id === poId);

  async function save() {
    if (!po) { toast.error("Pick a PO"); return; }
    if (!po.destination_warehouse_id) { toast.error("PO has no destination warehouse"); return; }
    if (!lines.some((l) => l.accepted_qty > 0 || l.rejected_qty > 0)) { toast.error("Enter received quantities"); return; }
    setSaving(true);
    try {
      const n = await nextSeq("inv_grn_number_seq");
      const grn_number = fmtNumber("GRN", n);
      const { data: { user } } = await supabase.auth.getUser();
      const { data: ins, error } = await supabase.from("inv_goods_receipts" as never).insert({
        grn_number, po_id: po.id, vendor_id: po.vendor_id, warehouse_id: po.destination_warehouse_id,
        receipt_date: receiptDate, vendor_invoice_number: invoiceNo, vendor_challan_number: challanNo,
        vehicle_number: vehicleNo, notes, status: "received",
        received_by: user?.id ?? null, received_at: new Date().toISOString(),
      } as never).select("id").single();
      if (error) throw error;
      const grnId = (ins as unknown as { id: string }).id;

      const linesPayload = lines.map((l, idx) => ({
        grn_id: grnId, po_line_id: l.po_line_id, item_id: l.item_id, size_value: l.size_value,
        ordered_qty: l.ordered_qty, received_qty: l.accepted_qty + l.rejected_qty,
        accepted_qty: l.accepted_qty, rejected_qty: l.rejected_qty,
        rejection_reason: l.rejection_reason, sort_order: idx,
      }));
      const { error: lineErr } = await supabase.from("inv_goods_receipt_lines" as never).insert(linesPayload as never);
      if (lineErr) throw lineErr;

      // Update PO line received_qty
      for (const l of lines) {
        if (l.po_line_id) {
          const { data: cur } = await supabase.from("inv_po_lines" as never).select("received_qty,accepted_qty").eq("id", l.po_line_id).single();
          const c = cur as unknown as { received_qty: number; accepted_qty: number };
          await supabase.from("inv_po_lines" as never).update({
            received_qty: Number(c.received_qty) + l.accepted_qty + l.rejected_qty,
            accepted_qty: Number(c.accepted_qty) + l.accepted_qty,
          } as never).eq("id", l.po_line_id);
        }
      }

      // Post stock movements for accepted qty
      await postMovements(lines.filter((l) => l.accepted_qty > 0).map((l) => ({
        movement_type: "GRN_IN",
        location_type: "warehouse",
        location_id: po.destination_warehouse_id!,
        item_id: l.item_id,
        size_value: l.size_value,
        qty_change: l.accepted_qty,
        reference_type: "grn",
        reference_id: grnId,
      })));

      // Moving-average cost + last-purchase tracking per accepted item
      const acceptedLines = lines.filter((l) => l.accepted_qty > 0 && l.po_line_id);
      if (acceptedLines.length) {
        // Fetch po-line prices in one shot
        const polIds = acceptedLines.map((l) => l.po_line_id!) as string[];
        const { data: polRows } = await supabase.from("inv_po_lines" as never).select("id,item_id,unit_price").in("id", polIds);
        const priceById = new Map(((polRows as unknown as { id: string; unit_price: number }[]) ?? []).map((r) => [String(r.id), Number(r.unit_price ?? 0)]));

        // Aggregate accepted qty * price per item (in case multiple lines hit same item)
        const perItem = new Map<string, { qty: number; cost: number; lastPrice: number }>();
        for (const l of acceptedLines) {
          const price = priceById.get(l.po_line_id!) ?? 0;
          const cur = perItem.get(l.item_id) ?? { qty: 0, cost: 0, lastPrice: 0 };
          cur.qty += l.accepted_qty;
          cur.cost += l.accepted_qty * price;
          cur.lastPrice = price;
          perItem.set(l.item_id, cur);
        }

        for (const [itemId, agg] of perItem) {
          // Fetch current item cost + on-hand qty across all locations
          const { data: itemRow } = await supabase.from("inv_items" as never).select("standard_cost").eq("id", itemId).single();
          const oldCost = Number((itemRow as unknown as { standard_cost?: number } | null)?.standard_cost ?? 0);
          const { data: balRows } = await supabase.from("inv_stock_balances" as never).select("qty").eq("item_id", itemId);
          const onHand = ((balRows as unknown as { qty: number }[]) ?? []).reduce((s, r) => s + Number(r.qty ?? 0), 0);
          // onHand already includes our just-posted movement, so prior qty = onHand - agg.qty
          const priorQty = Math.max(0, onHand - agg.qty);
          const newAvg = (priorQty + agg.qty) > 0
            ? (priorQty * oldCost + agg.cost) / (priorQty + agg.qty)
            : oldCost;
          await supabase.from("inv_items" as never).update({
            standard_cost: Number(newAvg.toFixed(4)),
            last_purchase_price: agg.lastPrice,
            last_purchase_vendor_id: po.vendor_id,
            last_purchase_at: new Date().toISOString(),
          } as never).eq("id", itemId);
        }
      }


      // Update PO status
      const { data: allLines } = await supabase.from("inv_po_lines" as never).select("ordered_qty,received_qty").eq("po_id", po.id);
      const rows = (allLines as unknown as { ordered_qty: number; received_qty: number }[]) ?? [];
      const allReceived = rows.every((r) => Number(r.received_qty) >= Number(r.ordered_qty));
      const anyReceived = rows.some((r) => Number(r.received_qty) > 0);
      const newStatus = allReceived ? "received" : anyReceived ? "partially_received" : "open";
      await supabase.from("inv_purchase_orders" as never).update({ status: newStatus } as never).eq("id", po.id);

      void logActivity({ module: "Inventory Goods Receipts", action: "create", entityType: "inv_goods_receipts", entityId: grnId, entityLabel: grn_number });
      toast.success(`GRN ${grn_number} posted — stock updated`);
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle>New Goods Receipt</DialogTitle><DialogDescription>Receive items against a Purchase Order.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2"><Label>Purchase Order</Label>
            <Select value={poId} onValueChange={loadPo}>
              <SelectTrigger><SelectValue placeholder="Pick an open PO" /></SelectTrigger>
              <SelectContent>{pos.map((p) => <SelectItem key={p.id} value={p.id}>{p.po_number}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="grid gap-2"><Label>Receipt Date</Label><Input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} /></div>
            <div className="grid gap-2"><Label>Vendor Invoice #</Label><Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} /></div>
            <div className="grid gap-2"><Label>Challan #</Label><Input value={challanNo} onChange={(e) => setChallanNo(e.target.value)} /></div>
            <div className="grid gap-2"><Label>Vehicle #</Label><Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} /></div>
          </div>

          {lines.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 w-16">Size</th>
                    <th className="px-3 py-2 w-20 text-right">Pending</th>
                    <th className="px-3 py-2 w-24 text-right">Accepted</th>
                    <th className="px-3 py-2 w-24 text-right">Rejected</th>
                    <th className="px-3 py-2">Reject Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((l, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2 font-medium">{items[l.item_id]?.name ?? "—"}</td>
                      <td className="px-3 py-2 text-xs">{l.size_value || "—"}</td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">{l.received_qty}</td>
                      <td className="px-2 py-1.5"><Input type="number" min={0} className="h-9 text-right" value={l.accepted_qty} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, accepted_qty: Number(e.target.value) || 0 } : x))} /></td>
                      <td className="px-2 py-1.5"><Input type="number" min={0} className="h-9 text-right" value={l.rejected_qty} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, rejected_qty: Number(e.target.value) || 0 } : x))} /></td>
                      <td className="px-2 py-1.5"><Input className="h-9" disabled={!l.rejected_qty} value={l.rejection_reason} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, rejection_reason: e.target.value } : x))} placeholder={l.rejected_qty ? "Why?" : "—"} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid gap-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !poId}>{saving ? "Posting…" : "Post GRN"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GRNViewDialog({ open, onOpenChange, grn }: { open: boolean; onOpenChange: (o: boolean) => void; grn: GRN | null }) {
  const { data: lines = [] } = useQuery({
    queryKey: ["inv", "grn-lines", grn?.id],
    enabled: !!grn,
    queryFn: async () => {
      if (!grn) return [];
      const { data, error } = await supabase.from("inv_goods_receipt_lines" as never).select("*, inv_items(name,item_code)").eq("grn_id", grn.id).order("sort_order");
      if (error) throw error;
      return (data as unknown as Record<string, unknown>[]) ?? [];
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader><DialogTitle>GRN {grn?.grn_number}</DialogTitle><DialogDescription>Posted on {grn?.receipt_date}</DialogDescription></DialogHeader>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">Size</th><th className="px-3 py-2 text-right">Ordered</th><th className="px-3 py-2 text-right">Accepted</th><th className="px-3 py-2 text-right">Rejected</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((l, i) => {
                const it = l.inv_items as { name?: string } | null;
                return (
                  <tr key={i}>
                    <td className="px-3 py-2 font-medium">{it?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{String(l.size_value || "—")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(l.ordered_qty ?? 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{Number(l.accepted_qty ?? 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-700">{Number(l.rejected_qty ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useResetOnOpen(open: boolean, reset: () => void) {
  const [last, setLast] = useState(false);
  if (open !== last) { setLast(open); if (open) reset(); }
}
