import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Trash2, Save, X } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { logInv } from "@/lib/inv-helpers";

export const Route = createFileRoute("/admin/inventory/rate-cards")({
  component: RateCardsPage,
});

type Vendor = { id: string; name: string; vendor_code: string };
type Item = { id: string; item_code: string; name: string };
type RateCard = {
  id: string;
  vendor_id: string;
  item_id: string;
  size_value: string;
  unit_price: number;
  tax_percent: number;
  min_order_qty: number;
  lead_time_days: number;
  enabled: boolean;
};

function RateCardsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RateCard | null>(null);
  const [vendorFilter, setVendorFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("");
  const [view, setView] = useState<"matrix" | "list" | "compare">("matrix");

  const vendorsQ = useQuery({
    queryKey: ["rc", "vendors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_vendors" as never).select("id,name,vendor_code").eq("enabled", true).order("name");
      if (error) throw error;
      return (data as unknown as Vendor[]) ?? [];
    },
  });
  const itemsQ = useQuery({
    queryKey: ["rc", "items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_items" as never).select("id,item_code,name").eq("enabled", true).order("name");
      if (error) throw error;
      return (data as unknown as Item[]) ?? [];
    },
  });
  const cardsQ = useQuery({
    queryKey: ["rc", "cards"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_vendor_rate_cards" as never).select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as RateCard[]) ?? [];
    },
  });

  const vendorMap = useMemo(() => new Map((vendorsQ.data ?? []).map((v) => [v.id, v])), [vendorsQ.data]);
  const itemMap = useMemo(() => new Map((itemsQ.data ?? []).map((i) => [i.id, i])), [itemsQ.data]);

  const rows = (cardsQ.data ?? []).filter((c) => {
    if (vendorFilter && c.vendor_id !== vendorFilter) return false;
    if (itemFilter && c.item_id !== itemFilter) return false;
    return true;
  });

  const saveBulkMut = useMutation({
    mutationFn: async ({ vendor_id, item_id, rows: formRows, existing }: { vendor_id: string; item_id: string; rows: Partial<RateCard>[]; existing: RateCard[] }) => {
      const existingBySize = new Map(existing.map((r) => [r.size_value || "", r]));
      const seenSizes = new Set<string>();
      const ops: Promise<unknown>[] = [];
      let inserts = 0, updates = 0, deletes = 0;
      for (const f of formRows) {
        const sv = f.size_value || "";
        seenSizes.add(sv);
        const ex = existingBySize.get(sv);
        const hasPrice = Number(f.unit_price ?? 0) > 0;
        if (ex && !hasPrice) {
          ops.push(supabase.from("inv_vendor_rate_cards" as never).delete().eq("id", ex.id).then(({ error }) => { if (error) throw error; }));
          deletes++;
        } else if (ex) {
          const payload = { unit_price: Number(f.unit_price ?? 0), tax_percent: Number(f.tax_percent ?? 0), min_order_qty: Number(f.min_order_qty ?? 0), lead_time_days: Number(f.lead_time_days ?? 0), enabled: f.enabled ?? true };
          ops.push(supabase.from("inv_vendor_rate_cards" as never).update(payload as never).eq("id", ex.id).then(({ error }) => { if (error) throw error; }));
          updates++;
        } else if (hasPrice) {
          const payload = { vendor_id, item_id, size_value: sv, unit_price: Number(f.unit_price), tax_percent: Number(f.tax_percent ?? 0), min_order_qty: Number(f.min_order_qty ?? 0), lead_time_days: Number(f.lead_time_days ?? 0), enabled: f.enabled ?? true };
          ops.push(supabase.from("inv_vendor_rate_cards" as never).insert(payload as never).then(({ error }) => { if (error) throw error; }));
          inserts++;
        }
      }
      for (const [sv, ex] of existingBySize) {
        if (!seenSizes.has(sv)) {
          ops.push(supabase.from("inv_vendor_rate_cards" as never).delete().eq("id", ex.id).then(({ error }) => { if (error) throw error; }));
          deletes++;
        }
      }
      await Promise.all(ops);
      return { vendor_id, item_id, inserts, updates, deletes };
    },
    onSuccess: (res) => {
      const v = vendorMap.get(res.vendor_id)?.name ?? "";
      const i = itemMap.get(res.item_id)?.name ?? "";
      logInv("Vendor Rate Cards", "update", "inv_vendor_rate_cards", res.item_id, `${v} → ${i}`, { inserts: res.inserts, updates: res.updates, deletes: res.deletes });
      qc.invalidateQueries({ queryKey: ["rc"] });
      setOpen(false);
      setEditing(null);
      toast.success(`Saved (${res.inserts} added, ${res.updates} updated, ${res.deletes} removed)`);
    },
    onError: (e) => toast.error("Save failed: " + String(e)),
  });

  const delMut = useMutation({
    mutationFn: async (rc: RateCard) => {
      const { error } = await supabase.from("inv_vendor_rate_cards" as never).delete().eq("id", rc.id);
      if (error) throw error;
      return rc;
    },
    onSuccess: (rc) => {
      const v = vendorMap.get(rc.vendor_id)?.name ?? "";
      const i = itemMap.get(rc.item_id)?.name ?? "";
      logInv("Vendor Rate Cards", "delete", "inv_vendor_rate_cards", rc.id, `${v} → ${i}`);
      qc.invalidateQueries({ queryKey: ["rc"] });
      toast.success("Rate card deleted");
    },
  });

  return (
    <div>
      <PageHeader
        title="Vendor Rate Cards"
        description="Capability matrix: who can supply what, at what price, with what lead time."
        crumbs={[{ label: "Inventory", to: "/admin/inventory" }, { label: "Rate Cards" }]}
      />
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-xs">
          <button onClick={() => setView("matrix")} className={`rounded-md px-3 py-1.5 font-medium ${view === "matrix" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Capability Matrix</button>
          <button onClick={() => setView("list")} className={`rounded-md px-3 py-1.5 font-medium ${view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>List</button>
          <button onClick={() => setView("compare")} className={`rounded-md px-3 py-1.5 font-medium ${view === "compare" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Compare by Item</button>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-1 h-4 w-4" />New Rate Card</Button>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">Vendor</Label>
          <Select value={vendorFilter || "all"} onValueChange={(v) => setVendorFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-64"><SelectValue placeholder="All vendors" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vendors</SelectItem>
              {(vendorsQ.data ?? []).map((v) => <SelectItem key={v.id} value={v.id}>{v.vendor_code} — {v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Item</Label>
          <Select value={itemFilter || "all"} onValueChange={(v) => setItemFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-64"><SelectValue placeholder="All items" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All items</SelectItem>
              {(itemsQ.data ?? []).map((i) => <SelectItem key={i.id} value={i.id}>{i.item_code} — {i.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {view === "matrix" ? (
        <MatrixView
          rows={cardsQ.data ?? []}
          vendors={(vendorsQ.data ?? []).filter((v) => !vendorFilter || v.id === vendorFilter)}
          items={(itemsQ.data ?? []).filter((i) => !itemFilter || i.id === itemFilter)}
          onCellClick={(vendor_id, item_id, existing) => {
            setEditing(existing ?? ({ vendor_id, item_id, size_value: "", unit_price: 0, tax_percent: 0, min_order_qty: 0, lead_time_days: 0, enabled: true } as RateCard));
            setOpen(true);
          }}
        />
      ) : view === "list" ? (
      <div className="overflow-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-3 text-left font-medium">Vendor</th>
              <th className="p-3 text-left font-medium">Item</th>
              <th className="p-3 text-left font-medium">Size</th>
              <th className="p-3 text-right font-medium">Unit Price</th>
              <th className="p-3 text-right font-medium">Tax %</th>
              <th className="p-3 text-right font-medium">MOQ</th>
              <th className="p-3 text-right font-medium">Lead (days)</th>
              <th className="p-3 text-center font-medium">Active</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No rate cards yet.</td></tr>
            ) : rows.map((r) => {
              const v = vendorMap.get(r.vendor_id);
              const i = itemMap.get(r.item_id);
              return (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="p-3">{v ? `${v.vendor_code} — ${v.name}` : "—"}</td>
                  <td className="p-3">{i ? `${i.item_code} — ${i.name}` : "—"}</td>
                  <td className="p-3 text-muted-foreground">{r.size_value || "—"}</td>
                  <td className="p-3 text-right tabular-nums font-semibold">₹{Number(r.unit_price).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                  <td className="p-3 text-right tabular-nums">{r.tax_percent}%</td>
                  <td className="p-3 text-right tabular-nums">{r.min_order_qty}</td>
                  <td className="p-3 text-right tabular-nums">{r.lead_time_days}</td>
                  <td className="p-3 text-center">{r.enabled ? "✓" : "—"}</td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => { if (confirm("Delete this rate card?")) delMut.mutate(r); }}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      ) : (
        <CompareView rows={rows.filter((r) => r.enabled)} vendorMap={vendorMap} itemMap={itemMap} />
      )}

      <RateCardDialog
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}
        editing={editing}
        vendors={vendorsQ.data ?? []}
        items={itemsQ.data ?? []}
        onSave={(rc) => saveMut.mutate(rc)}
        saving={saveMut.isPending}
      />
    </div>
  );
}

function RateCardDialog({
  open, onOpenChange, editing, vendors, items, onSave, saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: RateCard | null;
  vendors: Vendor[];
  items: Item[];
  onSave: (rc: Partial<RateCard>) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Partial<RateCard>>({});
  useMemo(() => {
    setForm(editing ?? { enabled: true, size_value: "", unit_price: 0, tax_percent: 0, min_order_qty: 0, lead_time_days: 0 });
  }, [editing, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} Rate Card</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Vendor</Label>
            <Select value={form.vendor_id ?? ""} onValueChange={(v) => setForm({ ...form, vendor_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
              <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.vendor_code} — {v.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Item</Label>
            <Select value={form.item_id ?? ""} onValueChange={(v) => setForm({ ...form, item_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
              <SelectContent>{items.map((i) => <SelectItem key={i.id} value={i.id}>{i.item_code} — {i.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Size (optional)</Label><Input value={form.size_value ?? ""} onChange={(e) => setForm({ ...form, size_value: e.target.value })} placeholder="e.g. M, L, 40" /></div>
            <div><Label>Unit Price (₹)</Label><Input type="number" step="0.01" value={form.unit_price ?? 0} onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) })} /></div>
            <div><Label>Tax %</Label><Input type="number" step="0.01" value={form.tax_percent ?? 0} onChange={(e) => setForm({ ...form, tax_percent: Number(e.target.value) })} /></div>
            <div><Label>Min Order Qty</Label><Input type="number" value={form.min_order_qty ?? 0} onChange={(e) => setForm({ ...form, min_order_qty: Number(e.target.value) })} /></div>
            <div><Label>Lead Time (days)</Label><Input type="number" value={form.lead_time_days ?? 0} onChange={(e) => setForm({ ...form, lead_time_days: Number(e.target.value) })} /></div>
            <div className="flex items-end gap-2"><Switch checked={form.enabled ?? true} onCheckedChange={(v) => setForm({ ...form, enabled: v })} /><Label>Active</Label></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}><X className="mr-1 h-4 w-4" />Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={saving || !form.vendor_id || !form.item_id}><Save className="mr-1 h-4 w-4" />Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompareView({ rows, vendorMap, itemMap }: { rows: RateCard[]; vendorMap: Map<string, Vendor>; itemMap: Map<string, Item> }) {
  const grouped = new Map<string, RateCard[]>();
  for (const r of rows) {
    const key = `${r.item_id}__${r.size_value}`;
    const arr = grouped.get(key) ?? [];
    arr.push(r);
    grouped.set(key, arr);
  }
  const groups = Array.from(grouped.entries())
    .map(([key, list]) => ({ key, list: [...list].sort((a, b) => a.unit_price - b.unit_price) }))
    .sort((a, b) => {
      const ia = itemMap.get(a.list[0].item_id)?.name ?? "";
      const ib = itemMap.get(b.list[0].item_id)?.name ?? "";
      return ia.localeCompare(ib);
    });

  if (!groups.length) {
    return <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">No active rate cards to compare.</div>;
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const first = g.list[0];
        const item = itemMap.get(first.item_id);
        const min = g.list[0].unit_price;
        const max = g.list[g.list.length - 1].unit_price;
        return (
          <div key={g.key} className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-2.5">
              <div>
                <div className="text-sm font-semibold">{item ? `${item.item_code} — ${item.name}` : "—"}{first.size_value && <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider">Size {first.size_value}</span>}</div>
                <div className="text-xs text-muted-foreground">{g.list.length} vendor{g.list.length === 1 ? "" : "s"} · spread ₹{min.toFixed(2)} – ₹{max.toFixed(2)}{min !== max && <> · {(((max - min) / min) * 100).toFixed(0)}% gap</>}</div>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-secondary/10 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Vendor</th>
                  <th className="px-4 py-2 text-right font-medium">Unit Price</th>
                  <th className="px-4 py-2 text-right font-medium">Tax %</th>
                  <th className="px-4 py-2 text-right font-medium">MOQ</th>
                  <th className="px-4 py-2 text-right font-medium">Lead (days)</th>
                  <th className="px-4 py-2 text-right font-medium">vs Cheapest</th>
                </tr>
              </thead>
              <tbody>
                {g.list.map((r, idx) => {
                  const v = vendorMap.get(r.vendor_id);
                  const diff = idx === 0 ? 0 : ((r.unit_price - min) / min) * 100;
                  return (
                    <tr key={r.id} className="border-t border-border/60">
                      <td className="px-4 py-2">{idx === 0 && <span className="mr-2 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">Cheapest</span>}{v ? `${v.vendor_code} — ${v.name}` : "—"}</td>
                      <td className={`px-4 py-2 text-right tabular-nums font-semibold ${idx === 0 ? "text-emerald-600" : ""}`}>₹{r.unit_price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.tax_percent}%</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.min_order_qty}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.lead_time_days}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-xs text-muted-foreground">{idx === 0 ? "—" : `+${diff.toFixed(1)}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function MatrixView({
  rows, vendors, items, onCellClick,
}: {
  rows: RateCard[];
  vendors: Vendor[];
  items: Item[];
  onCellClick: (vendor_id: string, item_id: string, existing: RateCard | null) => void;
}) {
  // index by item -> vendor -> cheapest active rate card (any size)
  const idx = new Map<string, Map<string, RateCard>>();
  for (const r of rows) {
    if (!r.enabled) continue;
    let m = idx.get(r.item_id);
    if (!m) { m = new Map(); idx.set(r.item_id, m); }
    const cur = m.get(r.vendor_id);
    if (!cur || r.unit_price < cur.unit_price) m.set(r.vendor_id, r);
  }
  if (!vendors.length || !items.length) {
    return <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">Add vendors and items first.</div>;
  }
  return (
    <div className="overflow-auto rounded-2xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-secondary/30 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="sticky left-0 z-10 bg-secondary/30 p-3 text-left font-medium">Item ↓ &nbsp;/&nbsp; Vendor →</th>
            {vendors.map((v) => (
              <th key={v.id} className="p-3 text-center font-medium" title={v.name}>
                <div className="font-semibold text-foreground">{v.vendor_code}</div>
                <div className="truncate text-[10px] font-normal normal-case text-muted-foreground" style={{ maxWidth: 110 }}>{v.name}</div>
              </th>
            ))}
            <th className="p-3 text-center font-medium">Vendors</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const row = idx.get(it.id);
            const prices = row ? Array.from(row.values()).map((r) => r.unit_price) : [];
            const min = prices.length ? Math.min(...prices) : 0;
            return (
              <tr key={it.id} className="border-t border-border/60">
                <td className="sticky left-0 z-10 bg-card p-3 font-medium">
                  <div>{it.name}</div>
                  <div className="text-[10px] font-normal text-muted-foreground">{it.item_code}</div>
                </td>
                {vendors.map((v) => {
                  const rc = row?.get(v.id) ?? null;
                  const cheapest = rc && rc.unit_price === min && prices.length > 1;
                  return (
                    <td key={v.id} className="p-1 text-center">
                      <button
                        onClick={() => onCellClick(v.id, it.id, rc)}
                        className={`w-full rounded-md px-2 py-2 text-xs font-semibold tabular-nums transition-colors ${
                          rc
                            ? cheapest
                              ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25"
                              : "bg-secondary/60 hover:bg-secondary"
                            : "text-muted-foreground/40 hover:bg-secondary/30"
                        }`}
                        title={rc ? `₹${rc.unit_price} · MOQ ${rc.min_order_qty} · ${rc.lead_time_days}d lead` : "Not supplied — click to add capability"}
                      >
                        {rc ? `₹${rc.unit_price.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—"}
                      </button>
                    </td>
                  );
                })}
                <td className="p-3 text-center text-xs font-semibold tabular-nums">{row?.size ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t border-border bg-secondary/20 px-4 py-2 text-[11px] text-muted-foreground">
        <span className="mr-3"><span className="inline-block h-2 w-2 rounded-sm bg-emerald-500/40" /> Cheapest vendor for that item</span>
        <span>Click any cell to add or edit a vendor's capability for that item.</span>
      </div>
    </div>
  );
}
