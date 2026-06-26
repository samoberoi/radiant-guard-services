import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Boxes, Plus, Search, Edit2, Trash2, Download, Package, Layers } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { confirmAction } from "@/components/ConfirmProvider";
import { downloadCsv } from "@/lib/csv-export";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/admin/office-assets/inventory")({
  component: InventoryPage,
});

const MODULE = "Office Assets";

type Cat = { id: string; name: string };
type Asset = { id: string; name: string; category_id: string | null; brand: string; model: string; unit_cost: number; depreciation_months: number; description: string; enabled: boolean };
type Unit = { id: string; asset_id: string; tag: string; serial_number: string; branch_id: string | null; status: string; purchase_date: string | null; purchase_cost: number | null; current_value: number | null; notes: string };
type Branch = { id: string; name: string };

const emptyAsset: Omit<Asset, "id"> = { name: "", category_id: null, brand: "", model: "", unit_cost: 0, depreciation_months: 36, description: "", enabled: true };
const emptyUnit: Omit<Unit, "id"> = { asset_id: "", tag: "", serial_number: "", branch_id: null, status: "in_stock", purchase_date: null, purchase_cost: 0, current_value: 0, notes: "" };

function InventoryPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"catalog" | "units">("catalog");
  const [view, setView] = useState<"count" | "value">("count");

  const { data: cats = [] } = useQuery({ queryKey: ["oa-cats"], queryFn: async () => {
    const { data, error } = await supabase.from("office_asset_categories" as never).select("id,name").eq("enabled", true).order("name");
    if (error) throw error; return data as unknown as Cat[];
  }});
  const { data: assets = [] } = useQuery({ queryKey: ["oa-assets"], queryFn: async () => {
    const { data, error } = await supabase.from("office_assets" as never).select("*").order("name");
    if (error) throw error; return data as unknown as Asset[];
  }});
  const { data: units = [] } = useQuery({ queryKey: ["oa-units"], queryFn: async () => {
    const { data, error } = await supabase.from("office_asset_units" as never).select("*").order("created_at", { ascending: false });
    if (error) throw error; return data as unknown as Unit[];
  }});
  const { data: branches = [] } = useQuery({ queryKey: ["branches-lite"], queryFn: async () => {
    const { data, error } = await supabase.from("branches" as never).select("id,name").order("name");
    if (error) throw error; return data as unknown as Branch[];
  }});

  const catName = (id: string | null) => cats.find((c) => c.id === id)?.name ?? "—";
  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? "—";
  const assetName = (id: string) => assets.find((a) => a.id === id)?.name ?? "—";
  const assetCost = (id: string) => Number(assets.find((a) => a.id === id)?.unit_cost ?? 0);

  // ─── ASSET DIALOG ───
  const [assetOpen, setAssetOpen] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [assetForm, setAssetForm] = useState(emptyAsset);

  const saveAsset = useMutation({
    mutationFn: async () => {
      if (!assetForm.name.trim()) throw new Error("Name required");
      if (editAsset) {
        const { error } = await supabase.from("office_assets" as never).update(assetForm as never).eq("id", editAsset.id);
        if (error) throw error;
        void logActivity({ module: MODULE, action: "update", entityType: "asset", entityId: editAsset.id, entityLabel: assetForm.name });
      } else {
        const { error } = await supabase.from("office_assets" as never).insert(assetForm as never);
        if (error) throw error;
        void logActivity({ module: MODULE, action: "create", entityType: "asset", entityLabel: assetForm.name });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["oa-assets"] }); toast.success("Saved"); setAssetOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delAsset = useMutation({
    mutationFn: async (a: Asset) => {
      const { error } = await supabase.from("office_assets" as never).delete().eq("id", a.id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "delete", entityType: "asset", entityId: a.id, entityLabel: a.name });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["oa-assets"] }); toast.success("Deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ─── UNIT DIALOG ───
  const [unitOpen, setUnitOpen] = useState(false);
  const [editUnit, setEditUnit] = useState<Unit | null>(null);
  const [unitForm, setUnitForm] = useState(emptyUnit);

  const saveUnit = useMutation({
    mutationFn: async () => {
      if (!unitForm.asset_id) throw new Error("Pick an asset");
      if (!unitForm.tag.trim()) throw new Error("Tag required");
      const payload = { ...unitForm, current_value: unitForm.current_value || unitForm.purchase_cost || assetCost(unitForm.asset_id) };
      if (editUnit) {
        const { error } = await supabase.from("office_asset_units" as never).update(payload as never).eq("id", editUnit.id);
        if (error) throw error;
        void logActivity({ module: MODULE, action: "update", entityType: "unit", entityId: editUnit.id, entityLabel: unitForm.tag });
      } else {
        const { error } = await supabase.from("office_asset_units" as never).insert(payload as never);
        if (error) throw error;
        void logActivity({ module: MODULE, action: "create", entityType: "unit", entityLabel: unitForm.tag });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["oa-units"] }); toast.success("Saved"); setUnitOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delUnit = useMutation({
    mutationFn: async (u: Unit) => {
      const { error } = await supabase.from("office_asset_units" as never).delete().eq("id", u.id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "delete", entityType: "unit", entityId: u.id, entityLabel: u.tag });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["oa-units"] }); toast.success("Deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ─── search ───
  const [q, setQ] = useState("");
  const filteredAssets = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return assets;
    return assets.filter((a) => [a.name, a.brand, a.model, catName(a.category_id)].join(" ").toLowerCase().includes(s));
  }, [assets, q, cats]);
  const filteredUnits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return units;
    return units.filter((u) => [u.tag, u.serial_number, assetName(u.asset_id), branchName(u.branch_id), u.status].join(" ").toLowerCase().includes(s));
  }, [units, q, assets, branches]);

  // ─── per-branch rollup ───
  const branchRollup = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>();
    units.forEach((u) => {
      const k = u.branch_id ?? "_un";
      const row = map.get(k) ?? { count: 0, value: 0 };
      row.count += 1;
      row.value += Number(u.current_value ?? u.purchase_cost ?? assetCost(u.asset_id));
      map.set(k, row);
    });
    return Array.from(map.entries()).map(([id, r]) => ({ id, name: id === "_un" ? "Unassigned" : branchName(id), ...r })).sort((a, b) => b.value - a.value);
  }, [units, branches, assets]);

  function exportUnits() {
    downloadCsv("office-assets-units.csv", filteredUnits.map((u) => ({
      Tag: u.tag, Serial: u.serial_number, Asset: assetName(u.asset_id), Branch: branchName(u.branch_id),
      Status: u.status, "Purchase Date": u.purchase_date ?? "", "Purchase Cost": u.purchase_cost ?? "", "Current Value": u.current_value ?? "",
    })));
  }

  return (
    <div>
      <PageHeader
        title="Office Asset Inventory"
        description="Master catalog of asset types and individual physical units mapped to branches."
        crumbs={[{ label: "Office Assets", to: "/admin/office-assets" }, { label: "Inventory" }]}
        icon={Boxes}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportUnits}><Download className="h-4 w-4" /> Export</Button>
            {tab === "catalog" ? (
              <Button size="sm" onClick={() => { setEditAsset(null); setAssetForm(emptyAsset); setAssetOpen(true); }}><Plus className="h-4 w-4" /> Add Asset</Button>
            ) : (
              <Button size="sm" onClick={() => { setEditUnit(null); setUnitForm(emptyUnit); setUnitOpen(true); }}><Plus className="h-4 w-4" /> Add Unit</Button>
            )}
          </div>
        }
      />

      {/* Branch rollup strip */}
      <div className="mb-5 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <div className="text-sm font-semibold">Branch Holdings</div>
            <div className="text-xs text-muted-foreground">How much each branch is currently holding</div>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
            <button onClick={() => setView("count")} className={`rounded-md px-3 py-1 text-xs font-medium ${view === "count" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>By Count</button>
            <button onClick={() => setView("value")} className={`rounded-md px-3 py-1 text-xs font-medium ${view === "value" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>By Value</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-5">
          {branchRollup.length === 0 && <div className="col-span-full bg-card px-5 py-6 text-center text-sm text-muted-foreground">No stock yet.</div>}
          {branchRollup.map((b) => (
            <div key={b.id} className="bg-card px-4 py-3">
              <div className="truncate text-xs font-medium text-muted-foreground">{b.name}</div>
              <div className="mt-0.5 text-lg font-bold tabular-nums">
                {view === "count" ? b.count : `₹${Math.round(b.value).toLocaleString("en-IN")}`}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, tag, branch, brand…" className="pl-9" />
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="catalog"><Layers className="mr-1 h-4 w-4" /> Catalog ({filteredAssets.length})</TabsTrigger>
          <TabsTrigger value="units"><Package className="mr-1 h-4 w-4" /> Units ({filteredUnits.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3">Name</th><th className="px-5 py-3">Category</th><th className="px-5 py-3">Brand / Model</th>
                    <th className="px-5 py-3 text-right">Unit Cost</th><th className="px-5 py-3">Status</th><th></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredAssets.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">No assets yet.</td></tr>}
                  {filteredAssets.map((a) => (
                    <tr key={a.id} className="hover:bg-muted/30">
                      <td className="px-5 py-3 font-semibold">{a.name}</td>
                      <td className="px-5 py-3">{catName(a.category_id)}</td>
                      <td className="px-5 py-3 text-muted-foreground">{[a.brand, a.model].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="px-5 py-3 text-right tabular-nums">₹{Math.round(Number(a.unit_cost)).toLocaleString("en-IN")}</td>
                      <td className="px-5 py-3">{a.enabled ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700">Active</span> : <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Disabled</span>}</td>
                      <td className="px-5 py-3 text-right">
                        <Button variant="ghost" size="icon" onClick={() => { setEditAsset(a); setAssetForm({ name: a.name, category_id: a.category_id, brand: a.brand, model: a.model, unit_cost: Number(a.unit_cost), depreciation_months: a.depreciation_months, description: a.description, enabled: a.enabled }); setAssetOpen(true); }}><Edit2 className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={async () => { if (await confirmAction({ title: "Delete asset?", description: `"${a.name}" — units must be removed first.`, destructive: true, confirmText: "Delete" })) delAsset.mutate(a); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="units">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3">Tag</th><th className="px-5 py-3">Asset</th><th className="px-5 py-3">Serial</th>
                    <th className="px-5 py-3">Branch</th><th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Value</th><th></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUnits.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">No units yet — add one.</td></tr>}
                  {filteredUnits.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/30">
                      <td className="px-5 py-3 font-mono font-semibold">{u.tag}</td>
                      <td className="px-5 py-3">{assetName(u.asset_id)}</td>
                      <td className="px-5 py-3 text-muted-foreground">{u.serial_number || "—"}</td>
                      <td className="px-5 py-3">{branchName(u.branch_id)}</td>
                      <td className="px-5 py-3"><StatusPill status={u.status} /></td>
                      <td className="px-5 py-3 text-right tabular-nums">₹{Math.round(Number(u.current_value ?? u.purchase_cost ?? assetCost(u.asset_id))).toLocaleString("en-IN")}</td>
                      <td className="px-5 py-3 text-right">
                        <Button variant="ghost" size="icon" onClick={() => { setEditUnit(u); setUnitForm({ asset_id: u.asset_id, tag: u.tag, serial_number: u.serial_number, branch_id: u.branch_id, status: u.status, purchase_date: u.purchase_date, purchase_cost: Number(u.purchase_cost ?? 0), current_value: Number(u.current_value ?? 0), notes: u.notes }); setUnitOpen(true); }}><Edit2 className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={async () => { if (await confirmAction({ title: "Delete unit?", description: `Tag "${u.tag}" will be removed along with its allocation history.`, destructive: true, confirmText: "Delete" })) delUnit.mutate(u); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Asset dialog */}
      <Dialog open={assetOpen} onOpenChange={setAssetOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editAsset ? "Edit Asset" : "Add Asset"}</DialogTitle><DialogDescription>Catalog entry — describes the asset type.</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Fld label="Name *"><Input value={assetForm.name} onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })} /></Fld>
            <Fld label="Category">
              <Select value={assetForm.category_id ?? ""} onValueChange={(v) => setAssetForm({ ...assetForm, category_id: v || null })}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </Fld>
            <Fld label="Brand"><Input value={assetForm.brand} onChange={(e) => setAssetForm({ ...assetForm, brand: e.target.value })} /></Fld>
            <Fld label="Model"><Input value={assetForm.model} onChange={(e) => setAssetForm({ ...assetForm, model: e.target.value })} /></Fld>
            <Fld label="Unit Cost (₹)"><Input type="number" value={assetForm.unit_cost} onChange={(e) => setAssetForm({ ...assetForm, unit_cost: Number(e.target.value) })} /></Fld>
            <Fld label="Depreciation (months)"><Input type="number" value={assetForm.depreciation_months} onChange={(e) => setAssetForm({ ...assetForm, depreciation_months: Number(e.target.value) })} /></Fld>
            <Fld label="Description" className="sm:col-span-2"><Textarea rows={2} value={assetForm.description} onChange={(e) => setAssetForm({ ...assetForm, description: e.target.value })} /></Fld>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssetOpen(false)}>Cancel</Button>
            <Button onClick={() => saveAsset.mutate()} disabled={saveAsset.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unit dialog */}
      <Dialog open={unitOpen} onOpenChange={setUnitOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editUnit ? "Edit Unit" : "Add Unit"}</DialogTitle><DialogDescription>An individual physical item with its own tag.</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Fld label="Asset *">
              <Select value={unitForm.asset_id} onValueChange={(v) => {
                const a = assets.find((x) => x.id === v);
                setUnitForm({ ...unitForm, asset_id: v, purchase_cost: unitForm.purchase_cost || (a ? Number(a.unit_cost) : 0), current_value: unitForm.current_value || (a ? Number(a.unit_cost) : 0) });
              }}>
                <SelectTrigger><SelectValue placeholder="Select asset" /></SelectTrigger>
                <SelectContent>{assets.filter((a) => a.enabled).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </Fld>
            <Fld label="Tag / Asset No. *"><Input value={unitForm.tag} onChange={(e) => setUnitForm({ ...unitForm, tag: e.target.value })} placeholder="OA-001" /></Fld>
            <Fld label="Serial Number"><Input value={unitForm.serial_number} onChange={(e) => setUnitForm({ ...unitForm, serial_number: e.target.value })} /></Fld>
            <Fld label="Branch">
              <Select value={unitForm.branch_id ?? ""} onValueChange={(v) => setUnitForm({ ...unitForm, branch_id: v || null })}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </Fld>
            <Fld label="Status">
              <Select value={unitForm.status} onValueChange={(v) => setUnitForm({ ...unitForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_stock">In Stock</SelectItem>
                  <SelectItem value="allocated">Allocated</SelectItem>
                  <SelectItem value="repair">Under Repair</SelectItem>
                  <SelectItem value="scrap">Scrap</SelectItem>
                </SelectContent>
              </Select>
            </Fld>
            <Fld label="Purchase Date"><Input type="date" value={unitForm.purchase_date ?? ""} onChange={(e) => setUnitForm({ ...unitForm, purchase_date: e.target.value || null })} /></Fld>
            <Fld label="Purchase Cost (₹)"><Input type="number" value={unitForm.purchase_cost ?? 0} onChange={(e) => setUnitForm({ ...unitForm, purchase_cost: Number(e.target.value) })} /></Fld>
            <Fld label="Current Value (₹)"><Input type="number" value={unitForm.current_value ?? 0} onChange={(e) => setUnitForm({ ...unitForm, current_value: Number(e.target.value) })} /></Fld>
            <Fld label="Notes" className="sm:col-span-2"><Textarea rows={2} value={unitForm.notes} onChange={(e) => setUnitForm({ ...unitForm, notes: e.target.value })} /></Fld>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnitOpen(false)}>Cancel</Button>
            <Button onClick={() => saveUnit.mutate()} disabled={saveUnit.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Fld({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</Label><div className="mt-1">{children}</div></div>;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    in_stock: "bg-sky-500/15 text-sky-700",
    allocated: "bg-emerald-500/15 text-emerald-700",
    repair: "bg-amber-500/15 text-amber-700",
    scrap: "bg-rose-500/15 text-rose-700",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${map[status] ?? "bg-muted"}`}>{status.replace("_", " ")}</span>;
}
