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
  standard_issue_price: number;
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
    standard_issue_price: Number(r.standard_issue_price ?? 0),
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
    standard_cost: p.standard_cost,
    standard_issue_price: p.standard_issue_price,
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
      <PageHeader title="Products" description="SKUs you stock — uniforms, accessories, equipment, consumables." crumbs={[{ label: "Inventory", to: "/admin/inventory" }, { label: "Products" }]} />

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
        <div className="overflow-x-clip">
          <table className="ios-table w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Code</th>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Unit</th>
                <th className="px-5 py-3 text-right">Purchase Cost</th>
                <th className="px-5 py-3 text-right">Std Issue Price</th>
                <th className="px-5 py-3 text-right">Last Buy</th>
                <th className="px-5 py-3 text-right">Reorder</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right" data-col="actions">Actions</th>
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
                  <td className="px-5 py-3 text-right tabular-nums">{i.standard_issue_price > 0 ? `₹${i.standard_issue_price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—"}</td>
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

type SizeRow = { id?: string; size_value: string; reorder_level: number; enabled: boolean };

function ItemFormDialog({ open, onOpenChange, title, initial, categories, onSubmit }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; initial?: Item | null; categories: Category[]; onSubmit: (p: Payload) => Promise<string | null> }) {
  const qc = useQueryClient();
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
  const [sizes, setSizes] = useState<SizeRow[]>([]);
  const [origSizes, setOrigSizes] = useState<SizeRow[]>([]);

  useResetOnOpen(open, async () => {
    setName(initial?.name ?? "");
    setCategoryId(initial?.category_id ?? categories[0]?.id ?? "");
    setUnit(initial?.unit ?? "pcs");
    setIsSized(initial?.is_sized ?? false);
    setHsn(initial?.hsn_code ?? "");
    setReorder(initial?.default_reorder_level ?? 0);
    setDescription(initial?.description ?? "");
    setEnabled(initial?.enabled ?? true);
    setStdCost(initial?.standard_cost ?? 0);
    setSizes([]); setOrigSizes([]);
    if (initial?.id) {
      const { data } = await supabase.from("inv_item_sizes" as never).select("id,size_value,reorder_level,enabled,sort_order").eq("item_id", initial.id).order("sort_order");
      const rows = ((data as unknown) as { id: string; size_value: string; reorder_level: number; enabled: boolean }[] | null) ?? [];
      const mapped: SizeRow[] = rows.map((r) => ({ id: r.id, size_value: r.size_value, reorder_level: Number(r.reorder_level ?? 0), enabled: Boolean(r.enabled) }));
      setSizes(mapped);
      setOrigSizes(mapped);
    }
  });

  const addSize = () => setSizes((s) => [...s, { size_value: "", reorder_level: 0, enabled: true }]);
  const updateSize = (i: number, patch: Partial<SizeRow>) => setSizes((s) => s.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const removeSize = (i: number) => setSizes((s) => s.filter((_, idx) => idx !== i));

  async function persistSizes(itemId: string) {
    const origById = new Map(origSizes.filter((s) => s.id).map((s) => [s.id!, s]));
    const seenIds = new Set<string>();
    for (let i = 0; i < sizes.length; i++) {
      const row = sizes[i];
      const sv = (row.size_value ?? "").trim();
      if (!sv) continue;
      if (row.id) {
        seenIds.add(row.id);
        const orig = origById.get(row.id);
        if (!orig || orig.size_value !== sv || orig.reorder_level !== row.reorder_level || orig.enabled !== row.enabled) {
          const { error } = await supabase.from("inv_item_sizes" as never).update({ size_value: sv, reorder_level: row.reorder_level, enabled: row.enabled, sort_order: i } as never).eq("id", row.id);
          if (error) throw error;
        }
      } else {
        const { error } = await supabase.from("inv_item_sizes" as never).insert({ item_id: itemId, size_value: sv, reorder_level: row.reorder_level, enabled: row.enabled, sort_order: i } as never);
        if (error) throw error;
      }
    }
    for (const orig of origSizes) {
      if (orig.id && !seenIds.has(orig.id)) {
        const { error } = await supabase.from("inv_item_sizes" as never).delete().eq("id", orig.id);
        if (error) throw error;
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
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
            <div className="grid gap-2"><Label>Reorder Level</Label><Input type="number" min={0} inputMode="numeric" value={reorder === 0 ? "" : reorder} onChange={(e) => setReorder(Number(e.target.value.replace(/^0+(?=\d)/, "")) || 0)} placeholder="0" /></div>
            <div className="grid gap-2"><Label>Standard Cost ₹</Label><Input type="number" min={0} step="0.01" inputMode="decimal" value={stdCost === 0 ? "" : stdCost} onChange={(e) => setStdCost(Number(e.target.value.replace(/^0+(?=\d)/, "")) || 0)} placeholder="0.00" /><div className="text-[10px] text-muted-foreground">Auto-updated on GRN as weighted avg.</div></div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2"><div><div className="text-sm font-medium">Sized item</div><div className="text-xs text-muted-foreground">Has size variants (S/M/L, shoe numbers, etc.)</div></div><Switch checked={isSized} onCheckedChange={setIsSized} /></div>
          {isSized && (
            <div className="rounded-lg border border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium">Sizes</div>
                <Button size="sm" variant="outline" onClick={addSize}><Plus className="mr-1 h-3 w-3" />Add size</Button>
              </div>
              {sizes.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">No sizes yet. Click "Add size" to define S, M, L, 40, 42 etc.</div>
              ) : (
                <table className="ios-table w-full text-sm">
                  <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1 text-left font-medium">Size</th>
                      <th className="px-2 py-1 text-right font-medium">Reorder Level</th>
                      <th className="px-2 py-1 text-center font-medium">Active</th>
                      <th className="px-2 py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {sizes.map((s, i) => (
                      <tr key={i} className="border-t border-border/60">
                        <td className="px-2 py-1.5"><Input className="h-9" value={s.size_value} onChange={(e) => updateSize(i, { size_value: e.target.value })} placeholder="e.g. M, L, 40" /></td>
                        <td className="px-2 py-1.5"><Input className="h-9 text-right" type="number" min={0} value={s.reorder_level} onChange={(e) => updateSize(i, { reorder_level: Number(e.target.value) || 0 })} /></td>
                        <td className="px-2 py-1.5 text-center"><Switch checked={s.enabled} onCheckedChange={(v) => updateSize(i, { enabled: v })} /></td>
                        <td className="px-2 py-1.5 text-right"><Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:text-destructive" onClick={() => removeSize(i)}><Trash2 className="h-4 w-4" /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          <div className="grid gap-2"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2"><div><div className="text-sm font-medium">Enabled</div><div className="text-xs text-muted-foreground">Visible in dropdowns</div></div><Switch checked={enabled} onCheckedChange={setEnabled} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button disabled={saving} onClick={async () => {
            setSaving(true);
            const err = await onSubmit({ name, category_id: categoryId || null, unit, is_sized: isSized, hsn_code: hsn, default_reorder_level: reorder, description, enabled, standard_cost: stdCost });
            if (err) { setSaving(false); toast.error(err); return; }
            try {
              let targetId = initial?.id;
              if (!targetId) {
                const { data } = await supabase.from("inv_items" as never).select("id").eq("name", name).order("created_at", { ascending: false }).limit(1).maybeSingle();
                targetId = (data as { id?: string } | null)?.id;
              }
              if (targetId && isSized) await persistSizes(targetId);
              if (targetId && !isSized && origSizes.length) {
                // turned off sizing — clean up any existing sizes
                await supabase.from("inv_item_sizes" as never).delete().eq("item_id", targetId);
              }
              qc.invalidateQueries({ queryKey: ["rc"] });
            } catch (e) {
              setSaving(false);
              toast.error("Item saved but sizes failed: " + (e instanceof Error ? e.message : "Unknown"));
              return;
            }
            setSaving(false);
            onOpenChange(false);
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

type HistoryRow = { po_number: string; po_date: string; vendor_name: string; size_value: string; ordered_qty: number; received_qty: number; unit_price: number; tax_percent: number };

function PriceHistoryDialog({ item, open, onOpenChange }: { item: Item | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["inv", "item-history", item?.id],
    enabled: !!item,
    queryFn: async (): Promise<HistoryRow[]> => {
      if (!item) return [];
      const { data: lines } = await supabase.from("inv_po_lines" as never).select("po_id,size_value,ordered_qty,received_qty,unit_price,tax_percent").eq("item_id", item.id);
      const list = (lines as unknown as Record<string, unknown>[]) ?? [];
      if (!list.length) return [];
      const poIds = Array.from(new Set(list.map((l) => String(l.po_id))));
      const { data: pos } = await supabase.from("inv_purchase_orders" as never).select("id,po_number,po_date,vendor_id").in("id", poIds);
      const poMap = new Map(((pos as unknown as Record<string, unknown>[]) ?? []).map((p) => [String(p.id), p]));
      const vendorIds = Array.from(new Set(((pos as unknown as Record<string, unknown>[]) ?? []).map((p) => String(p.vendor_id)).filter(Boolean)));
      const { data: vens } = vendorIds.length ? await supabase.from("inv_vendors" as never).select("id,name").in("id", vendorIds) : { data: [] };
      const venMap = new Map(((vens as unknown as Record<string, unknown>[]) ?? []).map((v) => [String(v.id), String(v.name)]));
      return list.map((l) => {
        const po = poMap.get(String(l.po_id));
        return {
          po_number: po ? String(po.po_number) : "—",
          po_date: po ? String(po.po_date) : "",
          vendor_name: po && po.vendor_id ? venMap.get(String(po.vendor_id)) ?? "—" : "—",
          size_value: String(l.size_value ?? ""),
          ordered_qty: Number(l.ordered_qty ?? 0),
          received_qty: Number(l.received_qty ?? 0),
          unit_price: Number(l.unit_price ?? 0),
          tax_percent: Number(l.tax_percent ?? 0),
        };
      }).sort((a, b) => (b.po_date || "").localeCompare(a.po_date || ""));
    },
  });

  const stats = useMemo(() => {
    if (!rows.length) return null;
    const prices = rows.map((r) => r.unit_price).filter((p) => p > 0);
    if (!prices.length) return null;
    return {
      min: Math.min(...prices),
      max: Math.max(...prices),
      avg: prices.reduce((s, p) => s + p, 0) / prices.length,
      count: prices.length,
    };
  }, [rows]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Price History — {item?.name}</DialogTitle>
          <DialogDescription>All purchase order lines across all vendors for this item.</DialogDescription>
        </DialogHeader>
        {stats && (
          <div className="mb-3 grid grid-cols-4 gap-3 rounded-xl border border-border bg-secondary/30 p-3 text-center text-xs">
            <div><div className="text-muted-foreground">Min</div><div className="text-base font-semibold tabular-nums">₹{stats.min.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div></div>
            <div><div className="text-muted-foreground">Avg</div><div className="text-base font-semibold tabular-nums">₹{stats.avg.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div></div>
            <div><div className="text-muted-foreground">Max</div><div className="text-base font-semibold tabular-nums">₹{stats.max.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</div></div>
            <div><div className="text-muted-foreground">PO Lines</div><div className="text-base font-semibold tabular-nums">{stats.count}</div></div>
          </div>
        )}
        <div className="overflow-x-clip rounded-xl border border-border">
          <table className="ios-table w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">PO #</th>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2">Size</th>
                <th className="px-3 py-2 text-right">Ordered</th>
                <th className="px-3 py-2 text-right">Received</th>
                <th className="px-3 py-2 text-right">Unit ₹</th>
                <th className="px-3 py-2 text-right">Tax %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">No purchase history yet.</td></tr>
              ) : rows.map((r, idx) => {
                const isCheapest = stats && r.unit_price === stats.min;
                const isExpensive = stats && r.unit_price === stats.max && stats.min !== stats.max;
                return (
                  <tr key={idx}>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.po_date}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.po_number}</td>
                    <td className="px-3 py-2 font-medium">{r.vendor_name}</td>
                    <td className="px-3 py-2 text-xs">{r.size_value || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.ordered_qty}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.received_qty}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${isCheapest ? "text-emerald-600" : isExpensive ? "text-rose-600" : ""}`}>₹{r.unit_price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">{r.tax_percent}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
