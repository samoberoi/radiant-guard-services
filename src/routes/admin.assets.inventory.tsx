import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Home, Download, Edit2, Plus, Search, Trash2 } from "lucide-react";
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
import { fmtDate } from "@/lib/vehicle-helpers";

export const Route = createFileRoute("/admin/assets/inventory")({
  component: AssetInventoryPage,
});

type Property = {
  id: string;
  house_number: string;
  name: string;
  owner: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  pincode: string;
  configuration: string;
  carpet_area_sqft: number | null;
  purchase_date: string | null;
  purchase_value: number | null;
  current_value: number | null;
  property_tax_id: string;
  notes: string;
  enabled: boolean;
};

const QK = ["admin", "properties"] as const;
const MODULE = "Asset Inventory";
const ENTITY = "properties";
const CONFIGS = ["1BHK", "2BHK", "3BHK", "4BHK", "Studio", "Other"];

const empty: Omit<Property, "id"> = {
  house_number: "",
  name: "",
  owner: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  pincode: "",
  configuration: "2BHK",
  carpet_area_sqft: null,
  purchase_date: null,
  purchase_value: null,
  current_value: null,
  property_tax_id: "",
  notes: "",
  enabled: true,
};

function rowToItem(r: Record<string, unknown>): Property {
  return {
    id: String(r.id),
    house_number: String(r.house_number ?? ""),
    name: String(r.name ?? ""),
    owner: String(r.owner ?? ""),
    address1: String(r.address1 ?? ""),
    address2: String(r.address2 ?? ""),
    city: String(r.city ?? ""),
    state: String(r.state ?? ""),
    pincode: String(r.pincode ?? ""),
    configuration: String(r.configuration ?? ""),
    carpet_area_sqft: r.carpet_area_sqft == null ? null : Number(r.carpet_area_sqft),
    purchase_date: (r.purchase_date as string) ?? null,
    purchase_value: r.purchase_value == null ? null : Number(r.purchase_value),
    current_value: r.current_value == null ? null : Number(r.current_value),
    property_tax_id: String(r.property_tax_id ?? ""),
    notes: String(r.notes ?? ""),
    enabled: Boolean(r.enabled ?? true),
  };
}

function useProperties() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<Property[]> => {
      const { data, error } = await supabase
        .from("properties" as never)
        .select("*")
        .order("house_number", { ascending: true });
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[]).map(rowToItem);
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });
  type Payload = Omit<Property, "id">;
  const toRow = (p: Payload) => ({
    ...p,
    house_number: p.house_number.trim(),
    owner: p.owner.trim(),
    city: p.city.trim(),
    state: p.state.trim(),
  });

  const addMut = useMutation({
    mutationFn: async (p: Payload) => {
      if (!p.house_number.trim()) throw new Error("House number is required");
      const { error } = await supabase.from("properties" as never).insert(toRow(p) as never);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "create", entityType: ENTITY, entityLabel: p.house_number });
    },
    onSuccess: invalidate,
  });

  const editMut = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: Payload }) => {
      const { error } = await supabase.from("properties" as never).update(toRow(p) as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "update", entityType: ENTITY, entityId: id, entityLabel: p.house_number });
    },
    onSuccess: invalidate,
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled, label }: { id: string; enabled: boolean; label: string }) => {
      const { error } = await supabase.from("properties" as never).update({ enabled } as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: enabled ? "enable" : "disable", entityType: ENTITY, entityId: id, entityLabel: label });
    },
    onSuccess: invalidate,
  });

  const delMut = useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string }) => {
      const { error } = await supabase.from("properties" as never).delete().eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "delete", entityType: ENTITY, entityId: id, entityLabel: label });
    },
    onSuccess: invalidate,
  });

  return { items, addMut, editMut, toggleMut, delMut };
}

function AssetInventoryPage() {
  const { items, addMut, editMut, toggleMut, delMut } = useProperties();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);
  const [form, setForm] = useState<Omit<Property, "id">>(empty);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) =>
      [it.house_number, it.name, it.owner, it.city, it.state, it.address1, it.configuration]
        .join(" ").toLowerCase().includes(s),
    );
  }, [items, q]);

  function openAdd() {
    setEditing(null); setForm(empty); setOpen(true);
  }
  function openEdit(it: Property) {
    setEditing(it);
    const { id: _id, ...rest } = it; void _id;
    setForm(rest); setOpen(true);
  }
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editing) await editMut.mutateAsync({ id: editing.id, p: form });
      else await addMut.mutateAsync(form);
      toast.success(editing ? "Property updated" : "Property added");
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function onDelete(it: Property) {
    const ok = await confirmAction({
      title: "Delete property?",
      description: `This permanently removes "${it.house_number}" along with its loans and expenses.`,
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await delMut.mutateAsync({ id: it.id, label: it.house_number });
      toast.success("Property deleted");
    } catch (err) { toast.error((err as Error).message); }
  }

  function exportCsv() {
    downloadCsv("properties.csv", filtered.map((it) => ({
      "House #": it.house_number,
      Name: it.name,
      Owner: it.owner,
      Configuration: it.configuration,
      "Area (sqft)": it.carpet_area_sqft ?? "",
      City: it.city,
      State: it.state,
      Pincode: it.pincode,
      "Purchase Date": it.purchase_date ?? "",
      "Purchase Value": it.purchase_value ?? "",
      "Current Value": it.current_value ?? "",
      Enabled: it.enabled ? "Yes" : "No",
    })));
  }

  return (
    <div>
      <PageHeader
        title="Asset Inventory"
        description="Houses and immovable assets owned by the company."
        crumbs={[{ label: "Assets", to: "/admin/assets" }, { label: "Asset Inventory" }]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>
            <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4" /> Add Property</Button>
          </div>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by house #, owner, city…" className="pl-9" />
        </div>
        <div className="text-xs text-muted-foreground">{filtered.length} of {items.length}</div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {["House #", "Name", "Owner", "Config", "Area", "City", "State", "Pincode", "Purchase Date", "Purchase Value", "Status", ""].map((h) => (
                  <th key={h} className="px-5 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 && (
                <tr><td colSpan={12} className="px-5 py-12 text-center text-muted-foreground">
                  <Home className="mx-auto mb-2 h-6 w-6 opacity-40" />
                  No properties yet. Add the first one to get started.
                </td></tr>
              )}
              {filtered.map((it) => (
                <tr key={it.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3 font-semibold">{it.house_number}</td>
                  <td className="px-5 py-3">{it.name || "—"}</td>
                  <td className="px-5 py-3">{it.owner || "—"}</td>
                  <td className="px-5 py-3">{it.configuration || "—"}</td>
                  <td className="px-5 py-3 tabular-nums">{it.carpet_area_sqft ? `${it.carpet_area_sqft} sqft` : "—"}</td>
                  <td className="px-5 py-3">{it.city || "—"}</td>
                  <td className="px-5 py-3">{it.state || "—"}</td>
                  <td className="px-5 py-3">{it.pincode || "—"}</td>
                  <td className="px-5 py-3">{fmtDate(it.purchase_date)}</td>
                  <td className="px-5 py-3 tabular-nums">{it.purchase_value ? `₹${Math.round(it.purchase_value).toLocaleString("en-IN")}` : "—"}</td>
                  <td className="px-5 py-3">
                    <Switch checked={it.enabled} onCheckedChange={(v) => toggleMut.mutate({ id: it.id, enabled: v, label: it.house_number })} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(it)} aria-label="Edit"><Edit2 className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => onDelete(it)} aria-label="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Property" : "Add Property"}</DialogTitle>
            <DialogDescription>Capture the immovable asset details.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
            <Field label="House Number *"><Input value={form.house_number} onChange={(e) => setForm({ ...form, house_number: e.target.value })} required /></Field>
            <Field label="Name / Nickname"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Riverside Villa" /></Field>
            <Field label="Owner"><Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="Owning entity" /></Field>
            <Field label="Configuration">
              <Select value={form.configuration} onValueChange={(v) => setForm({ ...form, configuration: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CONFIGS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Carpet Area (sqft)"><Input type="number" value={form.carpet_area_sqft ?? ""} onChange={(e) => setForm({ ...form, carpet_area_sqft: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="Property Tax ID"><Input value={form.property_tax_id} onChange={(e) => setForm({ ...form, property_tax_id: e.target.value })} /></Field>

            <Field label="Address line 1" className="sm:col-span-2"><Input value={form.address1} onChange={(e) => setForm({ ...form, address1: e.target.value })} /></Field>
            <Field label="Address line 2" className="sm:col-span-2"><Input value={form.address2} onChange={(e) => setForm({ ...form, address2: e.target.value })} /></Field>
            <Field label="City"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="State"><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></Field>
            <Field label="Pincode"><Input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} /></Field>

            <Field label="Purchase Date"><Input type="date" value={form.purchase_date ?? ""} onChange={(e) => setForm({ ...form, purchase_date: e.target.value || null })} /></Field>
            <Field label="Purchase Value (₹)"><Input type="number" value={form.purchase_value ?? ""} onChange={(e) => setForm({ ...form, purchase_value: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="Current Value (₹)"><Input type="number" value={form.current_value ?? ""} onChange={(e) => setForm({ ...form, current_value: e.target.value ? Number(e.target.value) : null })} /></Field>

            <Field label="Notes" className="sm:col-span-2"><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>

            <div className="flex items-center gap-3 sm:col-span-2">
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
              <Label className="text-sm">Enabled</Label>
            </div>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addMut.isPending || editMut.isPending}>{editing ? "Save changes" : "Add property"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
