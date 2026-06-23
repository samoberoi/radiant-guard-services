import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Edit2, Plus, Search, Trash2, ShoppingBag, Package } from "lucide-react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NET_DAY_OPTIONS = ["0", "7", "15", "30", "45", "60", "75", "90", "120"];
function parsePaymentTerms(s: string): { mode: "single" | "window"; from: string; to: string } {
  const t = (s ?? "").trim();
  if (!t) return { mode: "single", from: "30", to: "45" };
  const win = t.match(/^Net\s+(\d+)\s*[-–to]+\s*(\d+)$/i);
  if (win) return { mode: "window", from: win[1], to: win[2] };
  const single = t.match(/^Net\s+(\d+)$/i);
  if (single) return { mode: "single", from: single[1], to: single[1] };
  if (/due\s*on\s*receipt/i.test(t)) return { mode: "single", from: "0", to: "0" };
  return { mode: "single", from: "30", to: "45" };
}
function formatPaymentTerms(mode: "single" | "window", from: string, to: string): string {
  if (mode === "single") return from === "0" ? "Due on receipt" : `Net ${from}`;
  return `Net ${from}-${to}`;
}
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

export const Route = createFileRoute("/admin/inventory/vendors")({ component: VendorsPage });

type Vendor = {
  id: string;
  vendor_code: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  gstin: string;
  pan: string;
  address1: string;
  city: string;
  state: string;
  pincode: string;
  payment_terms: string;
  notes: string;
  enabled: boolean;
};
type Payload = Omit<Vendor, "id" | "vendor_code">;

const MODULE = "Inventory Vendors";
const ENTITY = "inv_vendors";
const QK = ["inv", "vendors"] as const;

function rowToVendor(r: Record<string, unknown>): Vendor {
  return {
    id: String(r.id), vendor_code: String(r.vendor_code ?? ""), name: String(r.name ?? ""),
    contact_person: String(r.contact_person ?? ""), phone: String(r.phone ?? ""), email: String(r.email ?? ""),
    gstin: String(r.gstin ?? ""), pan: String(r.pan ?? ""), address1: String(r.address1 ?? ""),
    city: String(r.city ?? ""), state: String(r.state ?? ""), pincode: String(r.pincode ?? ""),
    payment_terms: String(r.payment_terms ?? ""), notes: String(r.notes ?? ""), enabled: Boolean(r.enabled ?? true),
  };
}

function VendorsPage() {
  const qc = useQueryClient();
  const { data: vendors = [] } = useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_vendors" as never).select("*").order("name");
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[]).map(rowToVendor);
    },
  });
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [deleting, setDeleting] = useState<Vendor | null>(null);
  const [capVendor, setCapVendor] = useState<Vendor | null>(null);

  const capsQ = useQuery({
    queryKey: ["inv", "vendor-capabilities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inv_vendor_rate_cards" as never)
        .select("vendor_id,item_id,size_value,unit_price,lead_time_days,min_order_qty,enabled")
        .eq("enabled", true);
      if (error) throw error;
      return (data as unknown as Array<{ vendor_id: string; item_id: string; size_value: string; unit_price: number; lead_time_days: number; min_order_qty: number; enabled: boolean }>) ?? [];
    },
  });
  const itemsQ = useQuery({
    queryKey: ["inv", "items-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_items" as never).select("id,item_code,name").order("name");
      if (error) throw error;
      return (data as unknown as Array<{ id: string; item_code: string; name: string }>) ?? [];
    },
  });
  const itemMap = useMemo(() => new Map((itemsQ.data ?? []).map((i) => [i.id, i])), [itemsQ.data]);
  const capsByVendor = useMemo(() => {
    const m = new Map<string, typeof capsQ.data>();
    for (const c of capsQ.data ?? []) {
      const arr = m.get(c.vendor_id) ?? [];
      arr.push(c);
      m.set(c.vendor_id, arr);
    }
    return m;
  }, [capsQ.data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) => v.name.toLowerCase().includes(q) || v.vendor_code.toLowerCase().includes(q) || v.gstin.toLowerCase().includes(q) || v.phone.includes(q));
  }, [vendors, query]);

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });
  const validate = (p: Payload) => {
    if (!p.name.trim()) return "Name is required";
    const g = p.gstin.trim().toUpperCase();
    const pn = p.pan.trim().toUpperCase();
    if (!g) return "GSTIN is required";
    if (!GSTIN_RE.test(g)) return "GSTIN is invalid (15 chars, e.g. 27ABCDE1234F1Z5)";
    if (!pn) return "PAN is required";
    if (!PAN_RE.test(pn)) return "PAN is invalid (10 chars, e.g. ABCDE1234F)";
    return null;
  };
  const toRow = (p: Payload) => ({ ...p, name: p.name.trim(), gstin: p.gstin.trim().toUpperCase(), pan: p.pan.trim().toUpperCase() });

  const addMut = useMutation({
    mutationFn: async (p: Payload) => {
      const v = validate(p); if (v) throw new Error(v);
      const { data: seq } = await supabase.rpc("nextval" as never, { sequence_name: "inv_vendor_code_seq" } as never);
      const code = `VEN-${String(Number(seq ?? 0) || vendors.length + 1).padStart(3, "0")}`;
      const { error } = await supabase.from("inv_vendors" as never).insert({ ...toRow(p), vendor_code: code } as never);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "create", entityType: ENTITY, entityLabel: p.name });
    },
    onSuccess: invalidate,
  });
  const updateMut = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: Payload }) => {
      const { error } = await supabase.from("inv_vendors" as never).update(toRow(p) as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "update", entityType: ENTITY, entityId: id, entityLabel: p.name });
    },
    onSuccess: invalidate,
  });
  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("inv_vendors" as never).update({ enabled } as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: enabled ? "enable" : "disable", entityType: ENTITY, entityId: id });
    },
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inv_vendors" as never).delete().eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "delete", entityType: ENTITY, entityId: id });
    },
    onSuccess: invalidate,
  });

  return (
    <div>
      <PageHeader title="Vendors" description="Vendors that fulfil warehouse purchase orders." crumbs={[{ label: "Inventory", to: "/admin/inventory" }, { label: "Vendors" }]} />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search vendors…" className="h-10 rounded-lg pl-9" />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAddOpen(true)} className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90"><Plus className="mr-1.5 h-4 w-4" />Add Vendor</Button>
          <Button variant="outline" disabled={!filtered.length} onClick={() => downloadCsv("inventory-vendors", filtered.map((v) => ({ code: v.vendor_code, name: v.name, contact: v.contact_person, phone: v.phone, email: v.email, gstin: v.gstin, city: v.city, state: v.state, enabled: v.enabled ? "Yes" : "No" })))} className="h-10 rounded-lg"><Download className="mr-1.5 h-4 w-4" />Export</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-accent/10 px-5 py-2.5 text-xs"><span className="inline-flex items-center gap-2"><span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">{filtered.length}</span><span className="uppercase tracking-[0.14em] text-muted-foreground">Total rows</span></span></div>
        <div className="overflow-x-clip">
          <table className="ios-table w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr><th className="px-5 py-3">Code</th><th className="px-5 py-3">Name</th><th className="px-5 py-3">Products</th><th className="px-5 py-3">Contact</th><th className="px-5 py-3">Phone</th><th className="px-5 py-3">GSTIN</th><th className="px-5 py-3">City</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right" data-col="actions">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((v) => {
                const caps = capsByVendor.get(v.id) ?? [];
                const distinctItems = new Set(caps.map((c) => c.item_id)).size;
                return (
                <tr key={v.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{v.vendor_code}</td>
                  <td className="px-5 py-3 font-medium"><span className="inline-flex items-center gap-2"><ShoppingBag className="h-4 w-4 text-muted-foreground" />{v.name}</span></td>
                  <td className="px-5 py-3">
                    <button onClick={() => setCapVendor(v)} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${distinctItems ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25" : "bg-secondary text-muted-foreground hover:bg-secondary/80"}`}>
                      <Package className="h-3 w-3" />{distinctItems} item{distinctItems === 1 ? "" : "s"}
                    </button>
                  </td>
                  <td className="px-5 py-3">{v.contact_person || "—"}</td>
                  <td className="px-5 py-3 font-mono text-xs">{v.phone || "—"}</td>
                  <td className="px-5 py-3 font-mono text-xs">{v.gstin || "—"}</td>
                  <td className="px-5 py-3">{v.city || "—"}</td>
                  <td className="px-5 py-3"><Switch checked={v.enabled} onCheckedChange={(val) => toggleMut.mutate({ id: v.id, enabled: val }, { onSuccess: () => toast.success(val ? "Enabled" : "Disabled") })} /></td>
                  <td className="px-5 py-3 text-right"><div className="inline-flex gap-1"><Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditing(v)}><Edit2 className="h-4 w-4" /></Button><Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:text-destructive" onClick={() => setDeleting(v)}><Trash2 className="h-4 w-4" /></Button></div></td>
                </tr>
                );
              })}
              {!filtered.length && <tr><td colSpan={9} className="px-5 py-12 text-center text-sm text-muted-foreground">No vendors yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <VendorFormDialog open={addOpen} onOpenChange={setAddOpen} title="Add Vendor" onSubmit={async (p) => { try { await addMut.mutateAsync(p); toast.success("Vendor added"); return null; } catch (e) { return e instanceof Error ? e.message : "Failed"; } }} />
      <VendorFormDialog open={!!editing} initial={editing} onOpenChange={(o) => !o && setEditing(null)} title="Edit Vendor" onSubmit={async (p) => { if (!editing) return null; try { await updateMut.mutateAsync({ id: editing.id, p }); toast.success("Updated"); setEditing(null); return null; } catch (e) { return e instanceof Error ? e.message : "Failed"; } }} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this vendor?</AlertDialogTitle><AlertDialogDescription>{deleting && <span className="font-semibold">{deleting.name}</span>}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => { if (!deleting) return; try { await deleteMut.mutateAsync(deleting.id); toast.success("Deleted"); setDeleting(null); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } }}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!capVendor} onOpenChange={(o) => !o && setCapVendor(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Products supplied by {capVendor?.name}</DialogTitle>
            <DialogDescription>Active rate cards define what this vendor can sell. Add or edit them in Rate Cards.</DialogDescription>
          </DialogHeader>
          {(() => {
            const caps = capVendor ? (capsByVendor.get(capVendor.id) ?? []) : [];
            if (!caps.length) {
              return (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No products mapped yet. Open <Link to="/admin/inventory/rate-cards" className="font-semibold text-primary underline">Rate Cards</Link> to declare what this vendor can supply.
                </div>
              );
            }
            const byItem = new Map<string, typeof caps>();
            for (const c of caps) {
              const arr = byItem.get(c.item_id) ?? [];
              arr.push(c);
              byItem.set(c.item_id, arr);
            }
            return (
              <div className="max-h-[60vh] overflow-auto rounded-xl border border-border">
                <table className="ios-table w-full text-sm">
                  <thead className="bg-secondary/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr><th className="p-3 text-left">Item</th><th className="p-3 text-left">Sizes</th><th className="p-3 text-right">Price range</th><th className="p-3 text-right">Lead</th></tr>
                  </thead>
                  <tbody>
                    {Array.from(byItem.entries()).map(([itemId, list]) => {
                      const item = itemMap.get(itemId);
                      const prices = list.map((c) => c.unit_price);
                      const min = Math.min(...prices), max = Math.max(...prices);
                      const sizes = Array.from(new Set(list.map((c) => c.size_value).filter(Boolean)));
                      const lead = Math.max(...list.map((c) => c.lead_time_days));
                      return (
                        <tr key={itemId} className="border-t border-border/60">
                          <td className="p-3 font-medium">{item ? `${item.name}` : itemId}<div className="text-[10px] text-muted-foreground">{item?.item_code}</div></td>
                          <td className="p-3 text-xs">{sizes.length ? sizes.join(", ") : "—"}</td>
                          <td className="p-3 text-right tabular-nums font-semibold">{min === max ? `₹${min}` : `₹${min} – ₹${max}`}</td>
                          <td className="p-3 text-right tabular-nums text-xs">{lead}d</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
          <DialogFooter>
            <Link to="/admin/inventory/rate-cards"><Button variant="outline">Manage in Rate Cards</Button></Link>
            <Button onClick={() => setCapVendor(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VendorFormDialog({ open, onOpenChange, title, initial, onSubmit }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; initial?: Vendor | null; onSubmit: (p: Payload) => Promise<string | null> }) {
  const [p, setP] = useState<Payload>({ name: "", contact_person: "", phone: "", email: "", gstin: "", pan: "", address1: "", city: "", state: "", pincode: "", payment_terms: "", notes: "", enabled: true });
  const [saving, setSaving] = useState(false);
  const [last, setLast] = useState(false);
  if (open !== last) { setLast(open); if (open) setP({ name: initial?.name ?? "", contact_person: initial?.contact_person ?? "", phone: initial?.phone ?? "", email: initial?.email ?? "", gstin: initial?.gstin ?? "", pan: initial?.pan ?? "", address1: initial?.address1 ?? "", city: initial?.city ?? "", state: initial?.state ?? "", pincode: initial?.pincode ?? "", payment_terms: initial?.payment_terms ?? "", notes: initial?.notes ?? "", enabled: initial?.enabled ?? true }); }
  const set = <K extends keyof Payload>(k: K, v: Payload[K]) => setP((s) => ({ ...s, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>Vendor profile.</DialogDescription></DialogHeader>
        <div className="grid max-h-[60vh] gap-3 overflow-y-auto py-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2"><Label>Name *</Label><Input value={p.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div className="grid gap-2"><Label>Contact Person</Label><Input value={p.contact_person} onChange={(e) => set("contact_person", e.target.value)} /></div>
            <div className="grid gap-2"><Label>Phone</Label><Input format="mobile" value={p.phone} onChange={(e) => set("phone", e.target.value)} /></div>
            <div className="grid gap-2"><Label>Email</Label><Input value={p.email} onChange={(e) => set("email", e.target.value)} /></div>
            <div className="grid gap-2"><Label>GSTIN</Label><Input format="gstin" value={p.gstin} onChange={(e) => set("gstin", e.target.value)} /></div>
            <div className="grid gap-2"><Label>PAN</Label><Input format="pan" value={p.pan} onChange={(e) => set("pan", e.target.value)} /></div>
          </div>
          <div className="grid gap-2"><Label>Address</Label><Input value={p.address1} onChange={(e) => set("address1", e.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-2"><Label>City</Label><Input value={p.city} onChange={(e) => set("city", e.target.value)} /></div>
            <div className="grid gap-2"><Label>State</Label><Input value={p.state} onChange={(e) => set("state", e.target.value)} /></div>
            <div className="grid gap-2"><Label>Pincode</Label><Input format="pincode" value={p.pincode} onChange={(e) => set("pincode", e.target.value)} /></div>
          </div>
          <div className="grid gap-2"><Label>Payment Terms</Label><Input value={p.payment_terms} onChange={(e) => set("payment_terms", e.target.value)} placeholder="e.g. Net 30" /></div>
          <div className="grid gap-2"><Label>Notes</Label><Textarea rows={2} value={p.notes} onChange={(e) => set("notes", e.target.value)} /></div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2"><div className="text-sm font-medium">Enabled</div><Switch checked={p.enabled} onCheckedChange={(v) => set("enabled", v)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button disabled={saving} onClick={async () => {
            setSaving(true);
            const err = await onSubmit(p);
            setSaving(false);
            if (err) toast.error(err); else onOpenChange(false);
          }}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
