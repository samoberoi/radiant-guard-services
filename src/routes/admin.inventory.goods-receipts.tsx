import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, PackageCheck, Eye, Trash2, FileText } from "lucide-react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, useDialogDirty } from "@/components/ui/dialog";
import { nextSeq, fmtNumber, postMovements, statusBadgeClass, type LocationType } from "@/lib/inv-helpers";
import { useUserBranchScope } from "@/lib/use-user-branch-scope";
import { useCurrentUserRole } from "@/lib/use-current-user-role";
import { useDemandRequesters } from "@/lib/use-demand-requesters";
import { useDocItemSummaries } from "@/lib/inv-doc-summary";



export const Route = createFileRoute("/admin/inventory/goods-receipts")({ component: GRNPage });

const MODULE = "Inventory Delivery Challans";
const ENTITY = "inv_goods_receipts";

type GRN = {
  id: string; grn_number: string; receipt_date: string; status: string;
  po_id: string | null; vendor_id: string | null; warehouse_id: string | null;
  vendor_invoice_number: string; vendor_challan_number: string; vehicle_number: string; notes: string;
  vendor_invoice_url?: string | null;
  transfer_id?: string | null; demand_id?: string | null; branch_id?: string | null; kind?: string;
};
type PO = { id: string; po_number: string; vendor_id: string | null; destination_warehouse_id: string | null; destination_branch_id: string | null; status: string };
type POLine = { id: string; item_id: string; size_value: string; ordered_qty: number; received_qty: number };
type Item = { id: string; name: string; item_code: string; is_sized: boolean };
type Vendor = { id: string; name: string };
type Warehouse = { id: string; name: string };
type Transfer = { id: string; transfer_number: string; source_type: string; source_id: string; destination_type: string; destination_id: string; demand_id: string | null };
type TransferLine = { id: string; transfer_id: string; item_id: string; size_value: string; dispatched_qty: number };
type Line = { id?: string; po_line_id: string | null; transfer_line_id?: string | null; item_id: string; size_value: string; ordered_qty: number; received_qty: number; accepted_qty: number; rejected_qty: number; rejection_reason: string };

function GRNPage() {
  const qc = useQueryClient();
  const scope = useUserBranchScope();
  const role = useCurrentUserRole();
  const adminMode = !scope.isScoped;

  const { data: grnsRaw = [] } = useQuery({
    queryKey: ["inv", "grns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_goods_receipts" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as GRN[]) ?? [];
    },
  });
  // Field officers should only see delivery challans they themselves posted (against issuances received).
  const grns = useMemo(
    () => (role.isFieldOfficer
      ? grnsRaw.filter((g) => (g as unknown as { received_by?: string | null }).received_by === role.userId)
      : grnsRaw),
    [grnsRaw, role.isFieldOfficer, role.userId],
  );

  // Pending issuances destined to this Field Officer (awaiting their delivery-challan ack)
  const { data: foPendingIssuances = [] } = useQuery({
    queryKey: ["inv", "fo-pending-issuances", role.candidateId],
    enabled: role.isFieldOfficer && !!role.candidateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inv_issuances" as never)
        .select("id,issuance_number,issuance_date,issuance_type,source_type,source_id,destination_type,destination_id,demand_id,status,notes")
        .eq("destination_type", "field_officer")
        .eq("destination_id", role.candidateId as string)
        .eq("status", "issued")
        .order("issuance_date", { ascending: false });
      if (error) throw error;
      return (data as unknown as { id: string; issuance_number: string; issuance_date: string; issuance_type: string; source_type: string; source_id: string; destination_type: string; destination_id: string; demand_id: string | null; status: string; notes: string }[]) ?? [];
    },
  });
  const { data: pos = [] } = useQuery({
    queryKey: ["inv", "pos-open"],
    enabled: adminMode,
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_purchase_orders" as never).select("id,po_number,vendor_id,destination_warehouse_id,destination_branch_id,status").in("status", ["open", "partially_received"]).order("po_date", { ascending: false });
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
    enabled: adminMode,
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_warehouses" as never).select("id,name").eq("enabled", true);
      if (error) throw error;
      return (data as unknown as Warehouse[]) ?? [];
    },
  });
  const { data: branches = [] } = useQuery({
    queryKey: ["inv", "branches-list-grn"],
    enabled: adminMode,
    queryFn: async () => {
      const { data, error } = await supabase.from("branches" as never).select("id,name").order("name");
      if (error) throw error;
      return (data as unknown as { id: string; name: string }[]) ?? [];
    },
  });
  const { data: incomingTransfers = [] } = useQuery({
    queryKey: ["inv", "transfers-incoming", scope.branchId],
    enabled: !!scope.branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inv_transfers" as never)
        .select("id,transfer_number,source_type,source_id,destination_type,destination_id,demand_id,status")
        .eq("destination_type", "branch")
        .eq("destination_id", scope.branchId as string)
        .eq("status", "in_transit")
        .order("transfer_date", { ascending: false });
      if (error) throw error;
      return (data as unknown as Transfer[]) ?? [];
    },
  });
  // Direct vendor POs raised by admin where the delivery destination is THIS branch.
  // The branch manager needs to receive these as a delivery challan too.
  const { data: incomingBranchPOs = [] } = useQuery({
    queryKey: ["inv", "pos-incoming-branch", scope.branchId],
    enabled: !!scope.branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inv_purchase_orders" as never)
        .select("id,po_number,vendor_id,destination_warehouse_id,destination_branch_id,status")
        .eq("destination_branch_id", scope.branchId as string)
        .in("status", ["open", "partially_received"])
        .order("po_date", { ascending: false });
      if (error) throw error;
      return (data as unknown as PO[]) ?? [];
    },
  });
  const { data: items = [] } = useQuery({
    queryKey: ["inv", "items-list-grn"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_items" as never).select("id,name,item_code,is_sized,standard_cost").order("name");
      if (error) throw error;
      return (data as unknown as (Item & { standard_cost?: number })[]) ?? [];
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
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<GRN | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return grns;
    return grns.filter((g) => g.grn_number.toLowerCase().includes(q) || (g.vendor_invoice_number ?? "").toLowerCase().includes(q));
  }, [grns, query]);

  // Resolve linked demand_id for each GRN: direct demand_id, or via transfer.demand_id
  const transferIds = useMemo(
    () => Array.from(new Set(filtered.map((g) => g.transfer_id).filter((x): x is string => !!x))).sort(),
    [filtered],
  );
  const { data: transferDemandMap = new Map<string, string | null>() } = useQuery({
    queryKey: ["inv", "grn-transfer-demand-map", transferIds.join(",")],
    enabled: transferIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inv_transfers" as never)
        .select("id,demand_id")
        .in("id", transferIds);
      if (error) throw error;
      const m = new Map<string, string | null>();
      for (const r of (data as unknown as { id: string; demand_id: string | null }[]) ?? []) {
        m.set(r.id, r.demand_id);
      }
      return m;
    },
  });
  const grnDemandId = (g: GRN): string | null =>
    g.demand_id ?? (g.transfer_id ? transferDemandMap.get(g.transfer_id) ?? null : null);
  const demandInfo = useDemandRequesters(filtered.map((g) => grnDemandId(g)));


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
      <PageHeader title="Delivery Challans" description="Receive vendor deliveries against a Purchase Order. Posted challans increase warehouse stock." crumbs={[{ label: "Inventory", to: "/admin/inventory" }, { label: "Delivery Challans" }]} />

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
        <div className="overflow-x-clip">
          <table className="ios-table w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Challan #</th>
                <th className="px-5 py-3">Requested From</th>
                <th className="px-5 py-3">Requested By</th>
                <th className="px-5 py-3">Vendor</th>
                <th className="px-5 py-3">Warehouse</th>
                <th className="px-5 py-3">Delivery Date</th>
                <th className="px-5 py-3 text-right">Products</th>
                <th className="px-5 py-3 text-right">Total Qty</th>
                <th className="px-5 py-3 text-right">Total Value</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right" data-col="actions">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((g) => {
                const agg = lineAgg.get(g.id) ?? { products: 0, qty: 0, value: 0 };
                const did = grnDemandId(g);
                const info = did ? demandInfo.get(did) : null;
                return (
                <tr key={g.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs">{g.grn_number}</td>
                  <td className="px-5 py-3 font-mono text-xs">{info?.demandNumber ?? "—"}</td>
                  <td className="px-5 py-3">
                    {info ? (
                      <>
                        <div className="font-medium">{info.requesterName}</div>
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          {info.requesterRole}{info.requesterCode ? ` · ${info.requesterCode}` : ""}
                        </div>
                      </>
                    ) : "—"}
                  </td>
                  <td className="px-5 py-3">{g.vendor_id ? vMap.get(g.vendor_id) ?? "—" : "—"}</td>
                  <td className="px-5 py-3">{g.warehouse_id ? (wMap.get(g.warehouse_id) ?? "—") : (g.transfer_id ? "Branch Receipt" : "—")}</td>
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
              {!filtered.length && <tr><td colSpan={11} className="px-5 py-12 text-center text-sm text-muted-foreground"><PackageCheck className="mx-auto mb-2 h-8 w-8 opacity-40" />No delivery challans yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>


      {adminMode && !role.isFieldOfficer ? (
        <GRNFormDialog open={open} onOpenChange={setOpen} pos={pos} vendors={vendors} branches={branches} warehouses={warehouses} onSaved={invalidate} />
      ) : role.isFieldOfficer ? (
        <FieldOfficerGRNFormDialog
          open={open}
          onOpenChange={setOpen}
          candidateId={role.candidateId ?? ""}
          userId={role.userId ?? ""}
          pendingIssuances={foPendingIssuances}
          items={items}
          onSaved={invalidate}
        />
      ) : (
        <BranchGRNFormDialog
          open={open}
          onOpenChange={setOpen}
          branchId={scope.branchId ?? ""}
          transfers={incomingTransfers}
          incomingPOs={incomingBranchPOs}
          vendors={vendors}
          items={items}
          warehouses={warehouses}
          branches={branches}
          onSaved={invalidate}
        />
      )}
      <GRNViewDialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)} grn={viewing} />
    </div>
  );
}

function GRNFormDialog({ open, onOpenChange, pos, vendors, branches, warehouses, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; pos: PO[]; vendors: Vendor[]; branches: { id: string; name: string }[]; warehouses: { id: string; name: string }[]; onSaved: () => void }) {
  const [poId, setPoId] = useState<string>("");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [invoiceNo, setInvoiceNo] = useState("");
  const [challanNo, setChallanNo] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [items, setItems] = useState<Record<string, Item>>({});
  const [saving, setSaving] = useState(false);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const { data: poSummary = new Map<string, string>() } = useDocItemSummaries("inv_po_lines", pos.map((p) => p.id));



  useResetOnOpen(open, async () => {
    setPoId(""); setReceiptDate(new Date().toISOString().slice(0, 10));
    setInvoiceNo(""); setChallanNo(""); setVehicleNo(""); setNotes(""); setLines([]); setItems({});
    setInvoiceFile(null);
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

      // Upload invoice file if provided
      if (invoiceFile) {
        const ext = invoiceFile.name.split(".").pop() || "pdf";
        const path = `${grnId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("vendor-invoices").upload(path, invoiceFile, { upsert: true, contentType: invoiceFile.type });
        if (upErr) throw upErr;
        await supabase.from("inv_goods_receipts" as never).update({ vendor_invoice_url: path } as never).eq("id", grnId);
      }

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

      // Books-of-record passthrough: if the PO designates a destination branch,
      // auto-create a completed transfer (warehouse → branch) so books show:
      //   IN at warehouse  →  OUT from warehouse  →  IN at branch
      const acceptedForTransfer = lines.filter((l) => l.accepted_qty > 0);
      const finalBranchId = po.destination_branch_id ?? "";
      let passthroughTransferId: string | null = null;
      if (finalBranchId && acceptedForTransfer.length) {
        const tn = await nextSeq("inv_transfer_number_seq");
        const transferNumber = fmtNumber("TR", tn);
        const { data: tIns, error: tErr } = await supabase.from("inv_transfers" as never).insert({
          transfer_number: transferNumber,
          source_type: "warehouse", source_id: po.destination_warehouse_id!,
          destination_type: "branch", destination_id: finalBranchId,
          linked_po_id: po.id,
          transfer_date: receiptDate, status: "completed",
          vehicle_number: vehicleNo, driver_name: "", driver_phone: "",
          notes: `Auto-created from GRN ${grn_number} — PO destination branch.`,
          dispatched_by: user?.id ?? null, dispatched_at: new Date().toISOString(),
          received_by: user?.id ?? null, received_at: new Date().toISOString(),
        } as never).select("id").single();
        if (tErr) throw tErr;
        passthroughTransferId = (tIns as unknown as { id: string }).id;
        const tLines = acceptedForTransfer.map((l, idx) => ({
          transfer_id: passthroughTransferId, item_id: l.item_id, size_value: l.size_value,
          dispatched_qty: l.accepted_qty, received_qty: l.accepted_qty, sort_order: idx,
        }));
        const { error: tlErr } = await supabase.from("inv_transfer_lines" as never).insert(tLines as never);
        if (tlErr) throw tlErr;
        // Leg 2: OUT from warehouse
        await postMovements(acceptedForTransfer.map((l) => ({
          movement_type: "TRANSFER_OUT", location_type: "warehouse" as LocationType,
          location_id: po.destination_warehouse_id!,
          item_id: l.item_id, size_value: l.size_value, qty_change: -l.accepted_qty,
          reference_type: "transfer", reference_id: passthroughTransferId!,
        })));
        // Leg 3: IN at branch
        await postMovements(acceptedForTransfer.map((l) => ({
          movement_type: "TRANSFER_IN", location_type: "branch" as LocationType,
          location_id: finalBranchId,
          item_id: l.item_id, size_value: l.size_value, qty_change: l.accepted_qty,
          reference_type: "transfer", reference_id: passthroughTransferId!,
        })));
        // Tag the GRN with the branch + transfer for downstream views
        await supabase.from("inv_goods_receipts" as never).update({
          branch_id: finalBranchId, transfer_id: passthroughTransferId,
        } as never).eq("id", grnId);
      }



      // Update PO status
      const { data: allLines } = await supabase.from("inv_po_lines" as never).select("ordered_qty,received_qty").eq("po_id", po.id);
      const rows = (allLines as unknown as { ordered_qty: number; received_qty: number }[]) ?? [];
      const allReceived = rows.every((r) => Number(r.received_qty) >= Number(r.ordered_qty));
      const anyReceived = rows.some((r) => Number(r.received_qty) > 0);
      const newStatus = allReceived ? "received" : anyReceived ? "partially_received" : "open";
      await supabase.from("inv_purchase_orders" as never).update({ status: newStatus } as never).eq("id", po.id);

      void logActivity({ module: "Inventory Delivery Challans", action: "create", entityType: "inv_goods_receipts", entityId: grnId, entityLabel: grn_number });
      toast.success(passthroughTransferId
        ? `GRN ${grn_number} posted — warehouse credited, then passed through to branch`
        : `GRN ${grn_number} posted — stock updated`);
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
        <DialogHeader><DialogTitle>New Delivery Challan</DialogTitle><DialogDescription>Receive items against a Purchase Order.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2"><Label>Purchase Order</Label>
            <Select value={poId} onValueChange={loadPo}>
              <SelectTrigger><SelectValue placeholder="Pick an open PO" /></SelectTrigger>
              <SelectContent>{pos.map((p) => {
                const vName = vendors.find((v) => v.id === p.vendor_id)?.name ?? "Vendor";
                const dest = p.destination_branch_id
                  ? (branches.find((b) => b.id === p.destination_branch_id)?.name ?? "Branch")
                  : (warehouses.find((w) => w.id === p.destination_warehouse_id)?.name ?? "Warehouse");
                const summary = poSummary.get(p.id);
                return (
                  <SelectItem key={p.id} value={p.id}>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs">{p.po_number} · {vName} → {dest}{p.status === "partially_received" ? " · partial" : ""}</span>
                      {summary && <span className="text-[11px] text-muted-foreground">{summary}</span>}
                    </div>
                  </SelectItem>
                );
              })}</SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Receipt Date</Label><Input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} /></div>
            <div className="grid gap-2"><Label>Vendor Invoice #</Label><Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} /></div>
          </div>
          <div className="grid gap-2">
            <Label>Vendor Invoice File</Label>
            <Input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
              className="h-10 file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-secondary/80"
            />
            {invoiceFile && <p className="text-xs text-muted-foreground">{invoiceFile.name} ({Math.round(invoiceFile.size / 1024)} KB)</p>}
          </div>



          {lines.length > 0 && (
            <div className="overflow-x-clip rounded-xl border border-border">
              <table className="ios-table w-full text-sm">
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

          {po && (
            <div className="rounded-xl border border-border bg-secondary/40 px-3 py-2 text-xs">
              <div className="font-semibold text-foreground/80 mb-1">Books will record</div>
              <div className="text-muted-foreground">
                IN at <span className="text-foreground">{warehouses.find((w) => w.id === po.destination_warehouse_id)?.name ?? "warehouse"}</span>
                {po.destination_branch_id ? (
                  <> → OUT from <span className="text-foreground">{warehouses.find((w) => w.id === po.destination_warehouse_id)?.name ?? "warehouse"}</span> → IN at <span className="text-foreground">{branches.find((b) => b.id === po.destination_branch_id)?.name ?? "branch"}</span> (auto passthrough)</>
                ) : (
                  <> · stays at warehouse</>
                )}
              </div>
            </div>
          )}
          <div className="grid gap-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <CancelBtn saving={saving} onClose={() => onOpenChange(false)} />
          <Button onClick={save} disabled={saving || !poId}>{saving ? "Posting…" : "Post Challan"}</Button>
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
        <DialogHeader><DialogTitle>Delivery Challan {grn?.grn_number}</DialogTitle><DialogDescription>Posted on {grn?.receipt_date}</DialogDescription></DialogHeader>
        {grn?.vendor_invoice_url && (
          <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Vendor invoice attached</span>
            <Button size="sm" variant="outline" onClick={async () => {
              const invoiceWindow = window.open("about:blank", "_blank");
              if (invoiceWindow) invoiceWindow.opener = null;
              const filePath = grn.vendor_invoice_url!.replace(/^\/+/, "").replace(/^vendor-invoices\//, "");
              const { data, error } = await supabase.storage.from("vendor-invoices").createSignedUrl(filePath, 300);
              if (error || !data?.signedUrl) { invoiceWindow?.close(); toast.error("Could not open invoice"); return; }
              if (invoiceWindow) invoiceWindow.location.href = data.signedUrl;
              else window.location.href = data.signedUrl;
            }}><FileText className="h-4 w-4" />View Invoice</Button>
          </div>
        )}
        <div className="overflow-x-clip rounded-xl border border-border">
          <table className="ios-table w-full text-sm">
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
        <DialogFooter><CloseDialogButton onClose={() => onOpenChange(false)} /></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useResetOnOpen(open: boolean, reset: () => void) {
  const [last, setLast] = useState(false);
  if (open !== last) { setLast(open); if (open) reset(); }
}

function CancelBtn({ saving, onClose }: { saving: boolean; onClose: () => void }) {
  const { markPristine } = useDialogDirty();
  return (
    <Button variant="outline" disabled={saving} onClick={() => { markPristine(); onClose(); }}>Cancel</Button>
  );
}

function CloseDialogButton({ onClose }: { onClose: () => void }) {
  const { markPristine } = useDialogDirty();
  return <Button variant="outline" onClick={() => { markPristine(); onClose(); }}>Close</Button>;
}

function BranchGRNFormDialog({ open, onOpenChange, branchId, transfers, incomingPOs, vendors, items, warehouses, branches, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; branchId: string;
  transfers: Transfer[];
  incomingPOs: PO[];
  vendors: Vendor[];
  items: Item[];
  warehouses: { id: string; name: string }[]; branches: { id: string; name: string }[];
  onSaved: () => void;
}) {
  // sourceKey encodes which incoming record to receive: "t:<transferId>" or "p:<poId>"
  const [sourceKey, setSourceKey] = useState<string>("");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const wMap = useMemo(() => new Map(warehouses.map((w) => [w.id, w.name])), [warehouses]);
  const bMap = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);
  const vMap = useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors]);
  const locLabel = (type: string, id: string): string => {
    if (!id) return "—";
    if (type === "warehouse") return wMap.get(id) ?? "Warehouse";
    if (type === "branch") return bMap.get(id) ?? "Branch";
    return type;
  };

  useResetOnOpen(open, async () => {
    setSourceKey(""); setReceiptDate(new Date().toISOString().slice(0, 10));
    setNotes(""); setInvoiceNo(""); setInvoiceFile(null); setLines([]);
  });
  const { data: tSummary = new Map<string, string>() } = useDocItemSummaries("inv_transfer_lines", transfers.map((t) => t.id));
  const { data: pSummary = new Map<string, string>() } = useDocItemSummaries("inv_po_lines", incomingPOs.map((p) => p.id));


  const kind: "transfer" | "po" | "" = sourceKey.startsWith("t:") ? "transfer" : sourceKey.startsWith("p:") ? "po" : "";
  const selectedTransfer = kind === "transfer" ? transfers.find((t) => t.id === sourceKey.slice(2)) : undefined;
  const selectedPO = kind === "po" ? incomingPOs.find((p) => p.id === sourceKey.slice(2)) : undefined;

  async function loadSource(key: string) {
    setSourceKey(key);
    if (!key) { setLines([]); return; }
    if (key.startsWith("t:")) {
      const id = key.slice(2);
      const { data, error } = await supabase.from("inv_transfer_lines" as never).select("*").eq("transfer_id", id).order("sort_order");
      if (error) { toast.error("Could not load transfer lines"); return; }
      const rows = (data as unknown as TransferLine[]) ?? [];
      setLines(rows.map((r) => ({
        po_line_id: null, transfer_line_id: r.id,
        item_id: r.item_id, size_value: r.size_value ?? "",
        ordered_qty: Number(r.dispatched_qty ?? 0), received_qty: 0,
        accepted_qty: Number(r.dispatched_qty ?? 0), rejected_qty: 0, rejection_reason: "",
      })));
    } else if (key.startsWith("p:")) {
      const id = key.slice(2);
      const { data, error } = await supabase.from("inv_po_lines" as never).select("*").eq("po_id", id).order("sort_order");
      if (error) { toast.error("Could not load PO lines"); return; }
      const rows = (data as unknown as POLine[]) ?? [];
      setLines(rows.map((l) => {
        const remaining = Math.max(0, Number(l.ordered_qty) - Number(l.received_qty ?? 0));
        return {
          po_line_id: l.id, transfer_line_id: null,
          item_id: l.item_id, size_value: l.size_value ?? "",
          ordered_qty: remaining, received_qty: 0,
          accepted_qty: remaining, rejected_qty: 0, rejection_reason: "",
        };
      }));
    }
  }

  async function save() {
    if (!selectedTransfer && !selectedPO) { toast.error("Pick an incoming delivery"); return; }
    if (!branchId) { toast.error("No branch assigned to your account"); return; }
    if (!lines.some((l) => l.accepted_qty > 0 || l.rejected_qty > 0)) { toast.error("Enter received quantities"); return; }
    if (lines.some((l) => (l.accepted_qty + l.rejected_qty) > l.ordered_qty)) { toast.error("Accepted + rejected cannot exceed dispatched"); return; }
    if (lines.some((l) => l.rejected_qty > 0 && !l.rejection_reason.trim())) { toast.error("Provide a reason for rejected items"); return; }
    setSaving(true);
    try {
      const n = await nextSeq("inv_grn_number_seq");
      const grn_number = fmtNumber("GRN", n);
      const { data: { user } } = await supabase.auth.getUser();

      const grnInsert: Record<string, unknown> = selectedTransfer ? {
        grn_number, po_id: null, vendor_id: null, warehouse_id: null,
        transfer_id: selectedTransfer.id, demand_id: selectedTransfer.demand_id,
        branch_id: branchId, kind: "transfer",
        receipt_date: receiptDate, vendor_invoice_number: "", vendor_challan_number: "",
        vehicle_number: "", notes, status: "received",
        received_by: user?.id ?? null, received_at: new Date().toISOString(),
      } : {
        grn_number, po_id: selectedPO!.id, vendor_id: selectedPO!.vendor_id, warehouse_id: null,
        transfer_id: null, demand_id: null,
        branch_id: branchId, kind: "po",
        receipt_date: receiptDate, vendor_invoice_number: invoiceNo, vendor_challan_number: "",
        vehicle_number: "", notes, status: "received",
        received_by: user?.id ?? null, received_at: new Date().toISOString(),
      };

      const { data: ins, error } = await supabase.from("inv_goods_receipts" as never).insert(grnInsert as never).select("id").single();
      if (error) throw error;
      const grnId = (ins as unknown as { id: string }).id;

      // Upload vendor invoice file if provided (PO receipts only)
      if (selectedPO && invoiceFile) {
        const ext = invoiceFile.name.split(".").pop() || "pdf";
        const path = `${grnId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("vendor-invoices").upload(path, invoiceFile, { upsert: true, contentType: invoiceFile.type });
        if (upErr) throw upErr;
        await supabase.from("inv_goods_receipts" as never).update({ vendor_invoice_url: path } as never).eq("id", grnId);
      }

      const linesPayload = lines.map((l, idx) => ({
        grn_id: grnId, po_line_id: l.po_line_id, item_id: l.item_id, size_value: l.size_value,
        ordered_qty: l.ordered_qty, received_qty: l.accepted_qty + l.rejected_qty,
        accepted_qty: l.accepted_qty, rejected_qty: l.rejected_qty,
        rejection_reason: l.rejection_reason, sort_order: idx,
      }));
      const { error: lineErr } = await supabase.from("inv_goods_receipt_lines" as never).insert(linesPayload as never);
      if (lineErr) throw lineErr;

      // Stock IN at branch for accepted quantity
      await postMovements(lines.filter((l) => l.accepted_qty > 0).map((l) => ({
        movement_type: "GRN_IN", location_type: "branch", location_id: branchId,
        item_id: l.item_id, size_value: l.size_value, qty_change: l.accepted_qty,
        reference_type: "grn", reference_id: grnId,
      })));
      // Rejected qty goes to scrap
      const rejects = lines.filter((l) => l.rejected_qty > 0).map((l) => ({
        movement_type: "BRANCH_REJECT" as const,
        location_type: "scrap" as LocationType,
        location_id: selectedTransfer?.id ?? selectedPO!.id,
        item_id: l.item_id, size_value: l.size_value, qty_change: l.rejected_qty,
        reference_type: "grn", reference_id: grnId,
        notes: l.rejection_reason,
      }));
      if (rejects.length) await postMovements(rejects);

      if (selectedTransfer) {
        await supabase.from("inv_transfers" as never).update({
          status: "completed",
          received_by: user?.id ?? null, received_at: new Date().toISOString(),
        } as never).eq("id", selectedTransfer.id);
        for (const l of lines) {
          if (l.transfer_line_id) {
            await supabase.from("inv_transfer_lines" as never).update({
              received_qty: l.accepted_qty + l.rejected_qty,
              variance_reason: l.rejected_qty > 0 ? l.rejection_reason : "",
            } as never).eq("id", l.transfer_line_id);
          }
        }

        if (selectedTransfer.demand_id) {
          const { data: demandLines } = await supabase.from("inv_demand_lines" as never).select("id,item_id,size_value,requested_qty,fulfilled_qty").eq("demand_id", selectedTransfer.demand_id);
          const dls = (demandLines as unknown as { id: string; item_id: string; size_value: string; requested_qty: number; fulfilled_qty: number }[]) ?? [];
          for (const dl of dls) {
            const matched = lines.find((l) => l.item_id === dl.item_id && (l.size_value ?? "") === (dl.size_value ?? ""));
            if (matched) {
              await supabase.from("inv_demand_lines" as never).update({
                fulfilled_qty: Number(dl.fulfilled_qty ?? 0) + matched.accepted_qty,
              } as never).eq("id", dl.id);
            }
          }
          const { error: dErr } = await supabase.from("inv_demands" as never).update({
            status: "fulfilled", fulfilled_at: new Date().toISOString(),
          } as never).eq("id", selectedTransfer.demand_id);
          if (dErr) toast.error(`Demand status update failed: ${dErr.message}`);
        }
      } else if (selectedPO) {
        // Update PO line received/accepted qty
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
        // Recompute PO status
        const { data: allLines } = await supabase.from("inv_po_lines" as never).select("ordered_qty,received_qty").eq("po_id", selectedPO.id);
        const rows = (allLines as unknown as { ordered_qty: number; received_qty: number }[]) ?? [];
        const allReceived = rows.every((r) => Number(r.received_qty) >= Number(r.ordered_qty));
        const anyReceived = rows.some((r) => Number(r.received_qty) > 0);
        const newStatus = allReceived ? "received" : anyReceived ? "partially_received" : "open";
        await supabase.from("inv_purchase_orders" as never).update({ status: newStatus } as never).eq("id", selectedPO.id);
      }

      void logActivity({ module: "Inventory Delivery Challans", action: "create", entityType: "inv_goods_receipts", entityId: grnId, entityLabel: grn_number });
      toast.success(`Challan ${grn_number} posted — branch stock updated`);
      onSaved(); onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  const hasAny = transfers.length + incomingPOs.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>New Delivery Challan</DialogTitle>
          <DialogDescription>Receive items dispatched to your branch — from a warehouse transfer or a vendor PO raised for this branch.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2"><Label>Incoming Delivery</Label>
            <Select value={sourceKey} onValueChange={loadSource}>
              <SelectTrigger><SelectValue placeholder={hasAny ? "Pick an incoming transfer or PO" : "No incoming transfers or POs"} /></SelectTrigger>
              <SelectContent>
                {transfers.length > 0 && (
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Warehouse transfers</div>
                )}
                {transfers.map((t) => {
                  const s = tSummary.get(t.id);
                  return (
                    <SelectItem key={`t:${t.id}`} value={`t:${t.id}`}>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-xs">{t.transfer_number} · {locLabel(t.source_type, t.source_id)} → {locLabel(t.destination_type, t.destination_id)}{t.demand_id ? " · against demand" : ""}</span>
                        {s && <span className="text-[11px] text-muted-foreground">{s}</span>}
                      </div>
                    </SelectItem>
                  );
                })}
                {incomingPOs.length > 0 && (
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Vendor purchase orders</div>
                )}
                {incomingPOs.map((p) => {
                  const s = pSummary.get(p.id);
                  return (
                    <SelectItem key={`p:${p.id}`} value={`p:${p.id}`}>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-xs">{p.po_number} · {vMap.get(p.vendor_id ?? "") ?? "Vendor"} → {bMap.get(p.destination_branch_id ?? "") ?? "Branch"}{p.status === "partially_received" ? " · partial" : ""}</span>
                        {s && <span className="text-[11px] text-muted-foreground">{s}</span>}
                      </div>
                    </SelectItem>
                  );
                })}

              </SelectContent>
            </Select>
          </div>
          {selectedTransfer && (
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-secondary/40 p-3 text-sm">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">From</div>
                <div className="font-medium">{locLabel(selectedTransfer.source_type, selectedTransfer.source_id)}</div>
                <div className="text-[11px] text-muted-foreground capitalize">{selectedTransfer.source_type}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">To</div>
                <div className="font-medium">{locLabel(selectedTransfer.destination_type, selectedTransfer.destination_id)}</div>
                <div className="text-[11px] text-muted-foreground capitalize">{selectedTransfer.destination_type}</div>
              </div>
            </div>
          )}
          {selectedPO && (
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-secondary/40 p-3 text-sm">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Vendor</div>
                <div className="font-medium">{vMap.get(selectedPO.vendor_id ?? "") ?? "—"}</div>
                <div className="text-[11px] text-muted-foreground">PO {selectedPO.po_number}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Deliver to</div>
                <div className="font-medium">{bMap.get(selectedPO.destination_branch_id ?? "") ?? "Branch"}</div>
                <div className="text-[11px] text-muted-foreground capitalize">branch</div>
              </div>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Receipt Date</Label>
              <Input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
            </div>
            {selectedPO && (
              <div className="grid gap-2">
                <Label>Vendor Invoice No.</Label>
                <Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="Optional" />
              </div>
            )}
          </div>
          {selectedPO && (
            <div className="grid gap-2">
              <Label>Vendor Invoice File</Label>
              <Input
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
                className="h-10 file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-secondary/80"
              />
              {invoiceFile && <p className="text-xs text-muted-foreground">{invoiceFile.name} ({Math.round(invoiceFile.size / 1024)} KB)</p>}
            </div>
          )}


          {lines.length > 0 && (
            <div className="overflow-x-clip rounded-xl border border-border">
              <table className="ios-table w-full text-sm">
                <thead className="bg-secondary/60 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 w-16">Size</th>
                    <th className="px-3 py-2 w-20 text-right">{selectedPO ? "Pending" : "Ordered"}</th>
                    <th className="px-3 py-2 w-24 text-right">Accepted</th>
                    <th className="px-3 py-2 w-24 text-right">Rejected</th>
                    <th className="px-3 py-2">Reject Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((l, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2 font-medium">{itemMap.get(l.item_id)?.name ?? "—"}</td>
                      <td className="px-3 py-2 text-xs">{l.size_value || "—"}</td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">{l.ordered_qty}</td>
                      <td className="px-2 py-1.5"><Input type="number" min={0} max={l.ordered_qty} className="h-9 text-right" value={l.accepted_qty} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, accepted_qty: Number(e.target.value) || 0 } : x))} /></td>
                      <td className="px-2 py-1.5"><Input type="number" min={0} max={l.ordered_qty} className="h-9 text-right" value={l.rejected_qty} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, rejected_qty: Number(e.target.value) || 0 } : x))} /></td>
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
          <CancelBtn saving={saving} onClose={() => onOpenChange(false)} />
          <Button onClick={save} disabled={saving || !sourceKey}>{saving ? "Posting…" : "Post Challan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type FOIssuance = { id: string; issuance_number: string; issuance_date: string; issuance_type: string; source_type: string; source_id: string; destination_type: string; destination_id: string; demand_id: string | null; status: string; notes: string };
type FOLine = { issuance_line_id: string; item_id: string; size_value: string; issued_qty: number; accepted_qty: number; rejected_qty: number; rejection_reason: string };

function FieldOfficerGRNFormDialog({ open, onOpenChange, candidateId, userId, pendingIssuances, items, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; candidateId: string; userId: string;
  pendingIssuances: FOIssuance[]; items: Item[]; onSaved: () => void;
}) {
  const [issuanceId, setIssuanceId] = useState<string>("");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<FOLine[]>([]);
  const [saving, setSaving] = useState(false);
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  useResetOnOpen(open, async () => {
    setIssuanceId(""); setReceiptDate(new Date().toISOString().slice(0, 10));
    setNotes(""); setLines([]);
  });
  const { data: iSummary = new Map<string, string>() } = useDocItemSummaries("inv_issuance_lines", pendingIssuances.map((i) => i.id));



  async function loadIssuance(id: string) {
    setIssuanceId(id);
    if (!id) { setLines([]); return; }
    const { data, error } = await supabase.from("inv_issuance_lines" as never)
      .select("id,item_id,size_value,qty").eq("issuance_id", id).order("sort_order");
    if (error) { toast.error("Could not load issuance lines"); return; }
    const rows = (data as unknown as { id: string; item_id: string; size_value: string; qty: number }[]) ?? [];
    setLines(rows.map((r) => ({
      issuance_line_id: r.id,
      item_id: r.item_id,
      size_value: r.size_value ?? "",
      issued_qty: Number(r.qty ?? 0),
      accepted_qty: Number(r.qty ?? 0),
      rejected_qty: 0,
      rejection_reason: "",
    })));
  }

  const selected = pendingIssuances.find((i) => i.id === issuanceId);

  async function save() {
    if (!selected) { toast.error("Pick a pending issuance"); return; }
    if (!candidateId) { toast.error("No employee profile linked to your account"); return; }
    if (!lines.some((l) => l.accepted_qty > 0 || l.rejected_qty > 0)) { toast.error("Enter received quantities"); return; }
    if (lines.some((l) => (l.accepted_qty + l.rejected_qty) > l.issued_qty)) { toast.error("Accepted + rejected cannot exceed issued"); return; }
    if (lines.some((l) => l.rejected_qty > 0 && !l.rejection_reason.trim())) { toast.error("Provide a reason for rejected items"); return; }
    setSaving(true);
    try {
      const n = await nextSeq("inv_grn_number_seq");
      const grn_number = fmtNumber("GRN", n);
      const { data: ins, error } = await supabase.from("inv_goods_receipts" as never).insert({
        grn_number, po_id: null, vendor_id: null, warehouse_id: null,
        transfer_id: null, demand_id: selected.demand_id,
        branch_id: selected.source_type === "branch" ? selected.source_id : null,
        kind: "issuance",
        receipt_date: receiptDate, vendor_invoice_number: "", vendor_challan_number: "",
        vehicle_number: "", notes: notes || `Receipt against issuance ${selected.issuance_number}`,
        status: "received", received_by: userId || null, received_at: new Date().toISOString(),
      } as never).select("id").single();
      if (error) throw error;
      const grnId = (ins as unknown as { id: string }).id;

      const linesPayload = lines.map((l, idx) => ({
        grn_id: grnId, po_line_id: null, item_id: l.item_id, size_value: l.size_value,
        ordered_qty: l.issued_qty, received_qty: l.accepted_qty + l.rejected_qty,
        accepted_qty: l.accepted_qty, rejected_qty: l.rejected_qty,
        rejection_reason: l.rejection_reason, sort_order: idx,
      }));
      const { error: lineErr } = await supabase.from("inv_goods_receipt_lines" as never).insert(linesPayload as never);
      if (lineErr) throw lineErr;

      // Post IN movements at field-officer's own location for accepted qty
      await postMovements(lines.filter((l) => l.accepted_qty > 0).map((l) => ({
        movement_type: "ISSUE_FIELD_OFFICER_IN",
        location_type: "field_officer", location_id: candidateId,
        item_id: l.item_id, size_value: l.size_value, qty_change: l.accepted_qty,
        reference_type: "issuance", reference_id: selected.id,
      })));
      // Rejected qty → scrap (source already debited at issue time)
      const rejects = lines.filter((l) => l.rejected_qty > 0).map((l) => ({
        movement_type: "FO_REJECT" as const,
        location_type: "scrap" as LocationType,
        location_id: selected.id,
        item_id: l.item_id, size_value: l.size_value, qty_change: l.rejected_qty,
        reference_type: "issuance", reference_id: selected.id,
        notes: l.rejection_reason,
      }));
      if (rejects.length) await postMovements(rejects);

      // Mark issuance acknowledged
      await supabase.from("inv_issuances" as never).update({
        status: "completed", acknowledged_at: new Date().toISOString(),
        received_at: new Date().toISOString(), received_by: candidateId,
      } as never).eq("id", selected.id);

      void logActivity({ module: "Inventory Delivery Challans", action: "create", entityType: "inv_goods_receipts", entityId: grnId, entityLabel: grn_number });
      toast.success(`Challan ${grn_number} posted — added to your inventory`);
      onSaved(); onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : JSON.stringify(e));
      console.error("FO challan post failed", e);
      toast.error(msg || "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>New Delivery Challan</DialogTitle>
          <DialogDescription>Confirm receipt of items issued to you. Posting adds them to your inventory.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2"><Label>Incoming Issuance</Label>
            <Select value={issuanceId} onValueChange={loadIssuance}>
              <SelectTrigger><SelectValue placeholder={pendingIssuances.length ? "Pick a pending issuance" : "No pending issuances"} /></SelectTrigger>
              <SelectContent>
                {pendingIssuances.map((i) => {
                  const s = iSummary.get(i.id);
                  return (
                    <SelectItem key={i.id} value={i.id}>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-xs">{i.issuance_number} · {i.issuance_date}{i.demand_id ? " · against demand" : ""}</span>
                        {s && <span className="text-[11px] text-muted-foreground">{s}</span>}
                      </div>
                    </SelectItem>
                  );
                })}

              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Receipt Date</Label>
            <Input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
          </div>

          {lines.length > 0 && (
            <div className="overflow-x-clip rounded-xl border border-border">
              <table className="ios-table w-full text-sm">
                <thead className="bg-secondary/60 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 w-16">Size</th>
                    <th className="px-3 py-2 w-20 text-right">Issued</th>
                    <th className="px-3 py-2 w-24 text-right">Accepted</th>
                    <th className="px-3 py-2 w-24 text-right">Rejected</th>
                    <th className="px-3 py-2">Reject Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((l, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2 font-medium">{itemMap.get(l.item_id)?.name ?? "—"}</td>
                      <td className="px-3 py-2 text-xs">{l.size_value || "—"}</td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">{l.issued_qty}</td>
                      <td className="px-2 py-1.5"><Input type="number" min={0} max={l.issued_qty} className="h-9 text-right" value={l.accepted_qty} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, accepted_qty: Number(e.target.value) || 0 } : x))} /></td>
                      <td className="px-2 py-1.5"><Input type="number" min={0} max={l.issued_qty} className="h-9 text-right" value={l.rejected_qty} onChange={(e) => setLines((ls) => ls.map((x, i) => i === idx ? { ...x, rejected_qty: Number(e.target.value) || 0 } : x))} /></td>
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
          <CancelBtn saving={saving} onClose={() => onOpenChange(false)} />
          <Button onClick={save} disabled={saving || !issuanceId}>{saving ? "Posting…" : "Post Challan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
