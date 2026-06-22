import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Receipt, Download, Edit2, Plus, Search, Trash2 } from "lucide-react";
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

export const Route = createFileRoute("/admin/assets/expense-manager")({
  component: AssetExpenseManagerPage,
});

type Expense = {
  id: string;
  property_id: string;
  expense_date: string;
  category: string;
  amount: number;
  payment_mode: string;
  vendor_name: string;
  notes: string;
  receipt_url: string;
  enabled: boolean;
};

const QK = ["admin", "property_expenses"] as const;
const MODULE = "Asset Expense Manager";
const ENTITY = "property_expenses";
const CATEGORIES = ["Maintenance", "Society", "Property Tax", "Repair", "Utilities", "Insurance", "Other"];
const PAY_MODES = ["Cash", "UPI", "Bank Transfer", "Card", "Cheque", "Other"];

const today = () => new Date().toISOString().slice(0, 10);

const empty: Omit<Expense, "id"> = {
  property_id: "",
  expense_date: today(),
  category: "Maintenance",
  amount: 0,
  payment_mode: "Bank Transfer",
  vendor_name: "",
  notes: "",
  receipt_url: "",
  enabled: true,
};

function rowToItem(r: Record<string, unknown>): Expense {
  return {
    id: String(r.id),
    property_id: String(r.property_id ?? ""),
    expense_date: String(r.expense_date ?? ""),
    category: String(r.category ?? ""),
    amount: Number(r.amount ?? 0),
    payment_mode: String(r.payment_mode ?? ""),
    vendor_name: String(r.vendor_name ?? ""),
    notes: String(r.notes ?? ""),
    receipt_url: String(r.receipt_url ?? ""),
    enabled: Boolean(r.enabled ?? true),
  };
}

function AssetExpenseManagerPage() {
  const qc = useQueryClient();
  const { data: propertiesData = [] } = useQuery({
    queryKey: ["admin", "properties", "options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties" as never)
        .select("id,house_number,city,enabled")
        .order("house_number", { ascending: true });
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[])
        .filter((r) => Boolean(r.enabled ?? true))
        .map((r) => ({ id: String(r.id), house_number: String(r.house_number ?? ""), city: String(r.city ?? "") }));
    },
  });
  const propMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of propertiesData) m.set(p.id, p.house_number);
    return m;
  }, [propertiesData]);

  const { data: items = [] } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<Expense[]> => {
      const { data, error } = await supabase.from("property_expenses" as never).select("*").order("expense_date", { ascending: false });
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[]).map(rowToItem);
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });
  type Payload = Omit<Expense, "id">;
  const addMut = useMutation({
    mutationFn: async (p: Payload) => {
      if (!p.property_id) throw new Error("Property is required");
      if (!p.expense_date) throw new Error("Date is required");
      const { error } = await supabase.from("property_expenses" as never).insert(p as never);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "create", entityType: ENTITY, entityLabel: `${propMap.get(p.property_id) ?? ""} — ${p.category} ₹${p.amount}` });
    },
    onSuccess: invalidate,
  });
  const editMut = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: Payload }) => {
      const { error } = await supabase.from("property_expenses" as never).update(p as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "update", entityType: ENTITY, entityId: id, entityLabel: `${propMap.get(p.property_id) ?? ""} — ${p.category}` });
    },
    onSuccess: invalidate,
  });
  const delMut = useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string }) => {
      const { error } = await supabase.from("property_expenses" as never).delete().eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "delete", entityType: ENTITY, entityId: id, entityLabel: label });
    },
    onSuccess: invalidate,
  });

  const [q, setQ] = useState("");
  const [propFilter, setPropFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState<Omit<Expense, "id">>(empty);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((it) => {
      if (propFilter !== "all" && it.property_id !== propFilter) return false;
      if (catFilter !== "all" && it.category !== catFilter) return false;
      if (!s) return true;
      const hay = [propMap.get(it.property_id) ?? "", it.category, it.vendor_name, it.payment_mode, it.notes].join(" ").toLowerCase();
      return hay.includes(s);
    });
  }, [items, q, propFilter, catFilter, propMap]);

  const totalShown = filtered.reduce((s, it) => s + it.amount, 0);

  function openAdd() { setEditing(null); setForm(empty); setOpen(true); }
  function openEdit(it: Expense) { setEditing(it); const { id: _id, ...rest } = it; void _id; setForm(rest); setOpen(true); }
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editing) await editMut.mutateAsync({ id: editing.id, p: form });
      else await addMut.mutateAsync(form);
      toast.success(editing ? "Expense updated" : "Expense added");
      setOpen(false);
    } catch (err) { toast.error((err as Error).message); }
  }
  async function onDelete(it: Expense) {
    const ok = await confirmAction({
      title: "Delete expense?",
      description: `Remove "${it.category}" expense of ₹${it.amount}.`,
      destructive: true, confirmText: "Delete",
    });
    if (!ok) return;
    try { await delMut.mutateAsync({ id: it.id, label: `${it.category} ₹${it.amount}` }); toast.success("Expense deleted"); }
    catch (err) { toast.error((err as Error).message); }
  }
  function exportCsv() {
    downloadCsv("property-expenses.csv", filtered.map((it) => ({
      Date: it.expense_date,
      Property: propMap.get(it.property_id) ?? "",
      Category: it.category,
      Amount: it.amount,
      "Payment Mode": it.payment_mode,
      Vendor: it.vendor_name,
      Notes: it.notes,
    })));
  }

  return (
    <div>
      <PageHeader
        title="Expense Manager"
        description="Track maintenance, society, repair, and utility expenses for company properties."
        crumbs={[{ label: "Assets", to: "/admin/assets" }, { label: "Expense Manager" }]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>
            <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4" /> Add Expense</Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vendor, notes…" className="pl-9" />
        </div>
        <Select value={propFilter} onValueChange={setPropFilter}>
          <SelectTrigger className="w-52"><SelectValue placeholder="All properties" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All properties</SelectItem>
            {propertiesData.map((p) => <SelectItem key={p.id} value={p.id}>{p.house_number}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm font-semibold tabular-nums">Total: ₹{Math.round(totalShown).toLocaleString("en-IN")}</div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>{["Date", "Property", "Category", "Amount", "Payment", "Vendor", "Notes", "Enabled", ""].map((h) => <th key={h} className="px-5 py-3 whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-12 text-center text-muted-foreground">
                  <Receipt className="mx-auto mb-2 h-6 w-6 opacity-40" /> No expenses recorded.
                </td></tr>
              )}
              {filtered.map((it) => (
                <tr key={it.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3">{fmtDate(it.expense_date)}</td>
                  <td className="px-5 py-3 font-semibold">{propMap.get(it.property_id) ?? "—"}</td>
                  <td className="px-5 py-3"><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{it.category}</span></td>
                  <td className="px-5 py-3 tabular-nums">₹{Math.round(it.amount).toLocaleString("en-IN")}</td>
                  <td className="px-5 py-3">{it.payment_mode || "—"}</td>
                  <td className="px-5 py-3">{it.vendor_name || "—"}</td>
                  <td className="px-5 py-3 max-w-xs truncate" title={it.notes}>{it.notes || "—"}</td>
                  <td className="px-5 py-3"><Switch checked={it.enabled} onCheckedChange={async (v) => {
                    const { error } = await supabase.from("property_expenses" as never).update({ enabled: v } as never).eq("id", it.id);
                    if (error) { toast.error(error.message); return; }
                    qc.invalidateQueries({ queryKey: QK });
                  }} /></td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(it)}><Edit2 className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => onDelete(it)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Expense" : "Add Expense"}</DialogTitle>
            <DialogDescription>Record an expense against a property.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
            <Field label="Property *">
              <Select value={form.property_id} onValueChange={(v) => setForm({ ...form, property_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
                <SelectContent>{propertiesData.map((p) => <SelectItem key={p.id} value={p.id}>{p.house_number}{p.city ? ` — ${p.city}` : ""}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Date *"><Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} required /></Field>
            <Field label="Category">
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Amount (₹) *"><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} required /></Field>
            <Field label="Payment Mode">
              <Select value={form.payment_mode} onValueChange={(v) => setForm({ ...form, payment_mode: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAY_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Vendor"><Input value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} /></Field>
            <Field label="Receipt URL" className="sm:col-span-2"><Input value={form.receipt_url} onChange={(e) => setForm({ ...form, receipt_url: e.target.value })} placeholder="https://…" /></Field>
            <Field label="Notes" className="sm:col-span-2"><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
              <Label className="text-sm">Enabled</Label>
            </div>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addMut.isPending || editMut.isPending}>{editing ? "Save changes" : "Add expense"}</Button>
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
