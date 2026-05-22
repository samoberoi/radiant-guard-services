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
import { toast } from "@/hooks/use-toast";
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

  const saveMut = useMutation({
    mutationFn: async (rc: Partial<RateCard>) => {
      if (rc.id) {
        const { error } = await supabase.from("inv_vendor_rate_cards" as never).update(rc as never).eq("id", rc.id);
        if (error) throw error;
        return { id: rc.id, mode: "update" as const };
      } else {
        const { data, error } = await supabase.from("inv_vendor_rate_cards" as never).insert(rc as never).select("id").single();
        if (error) throw error;
        return { id: (data as { id: string }).id, mode: "create" as const };
      }
    },
    onSuccess: (res, vars) => {
      const v = vendorMap.get(vars.vendor_id!)?.name ?? "";
      const i = itemMap.get(vars.item_id!)?.name ?? "";
      logInv("Vendor Rate Cards", res.mode, "inv_vendor_rate_cards", res.id, `${v} → ${i}`, { unit_price: vars.unit_price });
      qc.invalidateQueries({ queryKey: ["rc"] });
      setOpen(false);
      setEditing(null);
      toast({ title: "Rate card saved" });
    },
    onError: (e) => toast({ title: "Save failed", description: String(e), variant: "destructive" }),
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
      toast({ title: "Rate card deleted" });
    },
  });

  return (
    <div>
      <PageHeader
        title="Vendor Rate Cards"
        description="Per-item unit prices, tax, min order qty, and lead time per vendor."
        crumbs={[{ label: "Inventory", to: "/admin/inventory" }, { label: "Rate Cards" }]}
        actions={<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-1 h-4 w-4" />New Rate Card</Button>}
      />

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
