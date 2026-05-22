import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Edit2, Plus, Search, Trash2, PackageOpen, History } from "lucide-react";
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

export const Route = createFileRoute("/admin/inventory/items")({ component: ItemsPage });

type Category = { id: string; name: string };
type Item = {
  id: string;
  item_code: string;
  name: string;
  category_id: string | null;
  unit: string;
  is_sized: boolean;
  hsn_code: string;
  default_reorder_level: number;
  description: string;
  enabled: boolean;
  standard_cost: number;
  last_purchase_price: number | null;
  last_purchase_vendor_id: string | null;
  last_purchase_at: string | null;
};
type Payload = Omit<Item, "id" | "item_code" | "last_purchase_price" | "last_purchase_vendor_id" | "last_purchase_at">;

const MODULE = "Inventory Items";
const ENTITY = "inv_items";
const QK = ["inv", "items"] as const;
const CQK = ["inv", "categories"] as const;
const UNITS = ["pcs", "pair", "set", "meter", "kg"];

function rowToItem(r: Record<string, unknown>): Item {
  return {
    id: String(r.id),
    item_code: String(r.item_code ?? ""),
    name: String(r.name ?? ""),
    category_id: r.category_id ? String(r.category_id) : null,
    unit: String(r.unit ?? "pcs"),
    is_sized: Boolean(r.is_sized),
    hsn_code: String(r.hsn_code ?? ""),
    default_reorder_level: Number(r.default_reorder_level ?? 0),
    description: String(r.description ?? ""),
    enabled: Boolean(r.enabled ?? true),
    standard_cost: Number(r.standard_cost ?? 0),
    last_purchase_price: r.last_purchase_price == null ? null : Number(r.last_purchase_price),
    last_purchase_vendor_id: r.last_purchase_vendor_id ? String(r.last_purchase_vendor_id) : null,
    last_purchase_at: r.last_purchase_at ? String(r.last_purchase_at) : null,
  };
}

function ItemsPage() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_items" as never).select("*").order("name");
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[]).map(rowToItem);
    },
  });
  const { data: categories = [] } = useQuery({
    queryKey: CQK,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase.from("inv_item_categories" as never).select("id,name").eq("enabled", true).order("sort_order");
      if (error) throw error;
      return ((data as unknown) as Category[]) ?? [];
    },
  });
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState<Item | null>(null);
  const [historyFor, setHistoryFor] = useState<Item | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (catFilter !== "all" && i.category_id !== catFilter) return false;
      if (!q) return true;
      return i.name.toLowerCase().includes(q) || i.item_code.toLowerCase().includes(q) || i.hsn_code.toLowerCase().includes(q);
    });
  }, [items, query, catFilter]);

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });
  const toRow = (p: Payload) => ({
    name: p.name.trim(),
    category_id: p.category_id,
    unit: p.unit,
    is_sized: p.is_sized,
    hsn_code: p.hsn_code.trim(),
    default_reorder_level: p.default_reorder_level,
    description: p.description.trim(),
    enabled: p.enabled,
  });

  const addMut = useMutation({
    mutationFn: async (p: Payload) => {
      if (!p.name.trim()) throw new Error("Name is required");
      const { data: seq } = await supabase.rpc("nextval" as never, { sequence_name: "inv_item_code_seq" } as never);
      const n = Number(seq ?? 0);
      const code = `ITM-${String(n || items.length + 1).padStart(3, "0")}`;
      const { error } = await supabase.from("inv_items" as never).insert({ ...toRow(p), item_code: code } as never);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "create", entityType: ENTITY, entityLabel: p.name });
    },
    onSuccess: invalidate,
  });
  const updateMut = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: Payload }) => {
      const { error } = await supabase.from("inv_items" as never).update(toRow(p) as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "update", entityType: ENTITY, entityId: id, entityLabel: p.name });
    },
    onSuccess: invalidate,
  });
  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("inv_items" as never).update({ enabled } as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: enabled ? "enable" : "disable", entityType: ENTITY, entityId: id });
    },
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inv_items" as never).delete().eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "delete", entityType: ENTITY, entityId: id });
    },
    onSuccess: invalidate,
  });

  return (
    <div>
      <PageHeader title="Item Master" description="SKUs you stock — uniforms, accessories, equipment, consumables." crumbs={[{ label: "Inventory", to: "/admin/inventory" }, { label: "Item Master" }]} />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items…" className="h-10 rounded-lg pl-9" />
          </div>
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="h-10 w-full rounded-lg sm:w-56"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAddOpen(true)} className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90"><Plus className="mr-1.5 h-4 w-4" />Add Item</Button>
          <Button variant="outline" disabled={!filtered.length} onClick={() => downloadCsv("inventory-items", filtered.map((i) => ({ code: i.item_code, name: i.name, category: catMap.get(i.category_id ?? "") ?? "", unit: i.unit, sized: i.is_sized ? "Yes" : "No", hsn: i.hsn_code, reorder: i.default_reorder_level, enabled: i.enabled ? "Yes" : "No" })))} className="h-10 rounded-lg"><Download className="mr-1.5 h-4 w-4" />Export</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-accent/10 px-5 py-2.5 text-xs font-medium">
          <span className="inline-flex items-center gap-2"><span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">{filtered.length}</span><span className="uppercase tracking-[0.14em] text-muted-foreground">Total rows</span></span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Code</th>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Unit</th>
                <th className="px-5 py-3 text-right">Std Cost</th>
                <th className="px-5 py-3 text-right">Last Buy</th>
                <th className="px-5 py-3 text-right">Reorder</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((i) => (
                <tr key={i.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{i.item_code}</td>
                  <td className="px-5 py-3 font-medium"><span className="inline-flex items-center gap-2"><PackageOpen className="h-4 w-4 text-muted-foreground" />{i.name}</span>{i.hsn_code && <div className="text-[10px] text-muted-foreground">HSN {i.hsn_code}</div>}</td>
                  <td className="px-5 py-3"><span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{catMap.get(i.category_id ?? "") ?? "—"}</span></td>
                  <td className="px-5 py-3">{i.unit}{i.is_sized && <span className="ml-1 text-[10px] text-muted-foreground">·sized</span>}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{i.standard_cost > 0 ? `₹${i.standard_cost.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—"}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{i.last_purchase_price != null ? <><div>₹{i.last_purchase_price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div><div className="text-[10px] text-muted-foreground">{i.last_purchase_at ? new Date(i.last_purchase_at).toLocaleDateString() : ""}</div></> : "—"}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{i.default_reorder_level}</td>
                  <td className="px-5 py-3"><Switch checked={i.enabled} onCheckedChange={(v) => toggleMut.mutate({ id: i.id, enabled: v }, { onSuccess: () => toast.success(v ? "Enabled" : "Disabled") })} /></td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Price history" onClick={() => setHistoryFor(i)}><History className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditing(i)}><Edit2 className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:text-destructive" onClick={() => setDeleting(i)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={9} className="px-5 py-12 text-center text-sm text-muted-foreground">No items yet. Click "Add Item" to begin.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <ItemFormDialog open={addOpen} onOpenChange={setAddOpen} title="Add Item" categories={categories} onSubmit={async (p) => { try { await addMut.mutateAsync(p); toast.success("Item added"); return null; } catch (e) { return e instanceof Error ? e.message : "Failed"; } }} />
      <ItemFormDialog open={!!editing} initial={editing} onOpenChange={(o) => !o && setEditing(null)} title="Edit Item" categories={categories} onSubmit={async (p) => { if (!editing) return null; try { await updateMut.mutateAsync({ id: editing.id, p }); toast.success("Updated"); setEditing(null); return null; } catch (e) { return e instanceof Error ? e.message : "Failed"; } }} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this item?</AlertDialogTitle><AlertDialogDescription>{deleting && <span className="font-semibold">{deleting.name}</span>}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => { if (!deleting) return; try { await deleteMut.mutateAsync(deleting.id); toast.success("Deleted"); setDeleting(null); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } }}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PriceHistoryDialog item={historyFor} open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)} />
    </div>
  );
}

function ItemFormDialog({ open, onOpenChange, title, initial, categories, onSubmit }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; initial?: Item | null; categories: Category[]; onSubmit: (p: Payload) => Promise<string | null> }) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [unit, setUnit] = useState("pcs");
  const [isSized, setIsSized] = useState(false);
  const [hsn, setHsn] = useState("");
  const [reorder, setReorder] = useState(0);
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [stdCost, setStdCost] = useState(0);
  const [saving, setSaving] = useState(false);

  useResetOnOpen(open, () => {
    setName(initial?.name ?? "");
    setCategoryId(initial?.category_id ?? categories[0]?.id ?? "");
    setUnit(initial?.unit ?? "pcs");
    setIsSized(initial?.is_sized ?? false);
    setHsn(initial?.hsn_code ?? "");
    setReorder(initial?.default_reorder_level ?? 0);
    setDescription(initial?.description ?? "");
    setEnabled(initial?.enabled ?? true);
    setStdCost(initial?.standard_cost ?? 0);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>A stockable SKU.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Security Shirt — Half Sleeve" /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>Unit</Label>
              <Select value={unit} onValueChange={setUnit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2"><Label>HSN Code</Label><Input value={hsn} onChange={(e) => setHsn(e.target.value)} placeholder="optional" /></div>
            <div className="grid gap-2"><Label>Reorder Level</Label><Input type="number" min={0} value={reorder} onChange={(e) => setReorder(Number(e.target.value) || 0)} /></div>
            <div className="grid gap-2"><Label>Standard Cost ₹</Label><Input type="number" min={0} step="0.01" value={stdCost} onChange={(e) => setStdCost(Number(e.target.value) || 0)} /><div className="text-[10px] text-muted-foreground">Auto-updated on GRN as weighted avg.</div></div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2"><div><div className="text-sm font-medium">Sized item</div><div className="text-xs text-muted-foreground">Has size variants (S/M/L, shoe numbers, etc.)</div></div><Switch checked={isSized} onCheckedChange={setIsSized} /></div>
          <div className="grid gap-2"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2"><div><div className="text-sm font-medium">Enabled</div><div className="text-xs text-muted-foreground">Visible in dropdowns</div></div><Switch checked={enabled} onCheckedChange={setEnabled} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button disabled={saving} onClick={async () => {
            if (!(await confirmAction({ title: "Save?", description: "Save these changes?", confirmText: "Save" }))) return;
            setSaving(true);
            const err = await onSubmit({ name, category_id: categoryId || null, unit, is_sized: isSized, hsn_code: hsn, default_reorder_level: reorder, description, enabled, standard_cost: stdCost });
            setSaving(false);
            if (err) toast.error(err); else onOpenChange(false);
          }}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useResetOnOpen(open: boolean, reset: () => void) {
  const [last, setLast] = useState(false);
  if (open !== last) { setLast(open); if (open) reset(); }
}
