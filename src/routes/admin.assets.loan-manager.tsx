import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Banknote, Download, Edit2, Plus, Search, Trash2 } from "lucide-react";
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

export const Route = createFileRoute("/admin/assets/loan-manager")({
  component: LoanManagerPage,
});

type Loan = {
  id: string;
  property_id: string;
  lender_name: string;
  loan_account_number: string;
  sanctioned_amount: number | null;
  outstanding_amount: number | null;
  emi_amount: number | null;
  interest_rate: number | null;
  tenure_months: number | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  notes: string;
  enabled: boolean;
};

const QK = ["admin", "property_loans"] as const;
const MODULE = "Loan Manager";
const ENTITY = "property_loans";
const STATUSES = ["active", "closed", "default"];

const empty: Omit<Loan, "id"> = {
  property_id: "",
  lender_name: "",
  loan_account_number: "",
  sanctioned_amount: null,
  outstanding_amount: null,
  emi_amount: null,
  interest_rate: null,
  tenure_months: null,
  start_date: null,
  end_date: null,
  status: "active",
  notes: "",
  enabled: true,
};

function rowToItem(r: Record<string, unknown>): Loan {
  return {
    id: String(r.id),
    property_id: String(r.property_id ?? ""),
    lender_name: String(r.lender_name ?? ""),
    loan_account_number: String(r.loan_account_number ?? ""),
    sanctioned_amount: r.sanctioned_amount == null ? null : Number(r.sanctioned_amount),
    outstanding_amount: r.outstanding_amount == null ? null : Number(r.outstanding_amount),
    emi_amount: r.emi_amount == null ? null : Number(r.emi_amount),
    interest_rate: r.interest_rate == null ? null : Number(r.interest_rate),
    tenure_months: r.tenure_months == null ? null : Number(r.tenure_months),
    start_date: (r.start_date as string) ?? null,
    end_date: (r.end_date as string) ?? null,
    status: String(r.status ?? "active"),
    notes: String(r.notes ?? ""),
    enabled: Boolean(r.enabled ?? true),
  };
}

function useProperties() {
  return useQuery({
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
}

function LoanManagerPage() {
  const qc = useQueryClient();
  const { data: propertiesData = [] } = useProperties();
  const propMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of propertiesData) m.set(p.id, p.house_number);
    return m;
  }, [propertiesData]);

  const { data: items = [] } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<Loan[]> => {
      const { data, error } = await supabase.from("property_loans" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[]).map(rowToItem);
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });
  type Payload = Omit<Loan, "id">;
  const addMut = useMutation({
    mutationFn: async (p: Payload) => {
      if (!p.property_id) throw new Error("Property is required");
      if (!p.lender_name.trim()) throw new Error("Lender name is required");
      const { error } = await supabase.from("property_loans" as never).insert(p as never);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "create", entityType: ENTITY, entityLabel: `${propMap.get(p.property_id) ?? ""} — ${p.lender_name}` });
    },
    onSuccess: invalidate,
  });
  const editMut = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: Payload }) => {
      const { error } = await supabase.from("property_loans" as never).update(p as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "update", entityType: ENTITY, entityId: id, entityLabel: p.lender_name });
    },
    onSuccess: invalidate,
  });
  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled, label }: { id: string; enabled: boolean; label: string }) => {
      const { error } = await supabase.from("property_loans" as never).update({ enabled } as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: enabled ? "enable" : "disable", entityType: ENTITY, entityId: id, entityLabel: label });
    },
    onSuccess: invalidate,
  });
  const delMut = useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string }) => {
      const { error } = await supabase.from("property_loans" as never).delete().eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "delete", entityType: ENTITY, entityId: id, entityLabel: label });
    },
    onSuccess: invalidate,
  });

  const [q, setQ] = useState("");
  const [propFilter, setPropFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Loan | null>(null);
  const [form, setForm] = useState<Omit<Loan, "id">>(empty);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((it) => {
      if (propFilter !== "all" && it.property_id !== propFilter) return false;
      if (!s) return true;
      const hay = [propMap.get(it.property_id) ?? "", it.lender_name, it.loan_account_number, it.status].join(" ").toLowerCase();
      return hay.includes(s);
    });
  }, [items, q, propFilter, propMap]);

  function openAdd() { setEditing(null); setForm(empty); setOpen(true); }
  function openEdit(it: Loan) {
    setEditing(it);
    const { id: _id, ...rest } = it; void _id;
    setForm(rest); setOpen(true);
  }
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editing) await editMut.mutateAsync({ id: editing.id, p: form });
      else await addMut.mutateAsync(form);
      toast.success(editing ? "Loan updated" : "Loan added");
      setOpen(false);
    } catch (err) { toast.error((err as Error).message); }
  }
  async function onDelete(it: Loan) {
    const ok = await confirmAction({
      title: "Delete loan?",
      description: `Remove loan "${it.lender_name}" against ${propMap.get(it.property_id) ?? ""}.`,
      destructive: true, confirmText: "Delete",
    });
    if (!ok) return;
    try { await delMut.mutateAsync({ id: it.id, label: it.lender_name }); toast.success("Loan deleted"); }
    catch (err) { toast.error((err as Error).message); }
  }
  function exportCsv() {
    downloadCsv("property-loans.csv", filtered.map((it) => ({
      Property: propMap.get(it.property_id) ?? "",
      Lender: it.lender_name,
      "Account #": it.loan_account_number,
      Sanctioned: it.sanctioned_amount ?? "",
      Outstanding: it.outstanding_amount ?? "",
      EMI: it.emi_amount ?? "",
      "Interest %": it.interest_rate ?? "",
      "Tenure (mo)": it.tenure_months ?? "",
      Start: it.start_date ?? "",
      End: it.end_date ?? "",
      Status: it.status,
      Enabled: it.enabled ? "Yes" : "No",
    })));
  }

  return (
    <div>
      <PageHeader
        title="Loan Manager"
        description="Ongoing loans against company-owned properties."
        crumbs={[{ label: "Assets", to: "/admin/assets" }, { label: "Loan Manager" }]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>
            <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4" /> Add Loan</Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by lender, account, property…" className="pl-9" />
        </div>
        <Select value={propFilter} onValueChange={setPropFilter}>
          <SelectTrigger className="w-56"><SelectValue placeholder="All properties" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All properties</SelectItem>
            {propertiesData.map((p) => <SelectItem key={p.id} value={p.id}>{p.house_number}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground">{filtered.length} of {items.length}</div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>{["Property", "Lender", "Account #", "Sanctioned", "Outstanding", "EMI", "Interest", "Tenure", "Start", "End", "Status", "Enabled", ""].map((h) => <th key={h} className="px-5 py-3 whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 && (
                <tr><td colSpan={13} className="px-5 py-12 text-center text-muted-foreground">
                  <Banknote className="mx-auto mb-2 h-6 w-6 opacity-40" /> No loans recorded yet.
                </td></tr>
              )}
              {filtered.map((it) => (
                <tr key={it.id} className="hover:bg-muted/30">
                  <td className="px-5 py-3 font-semibold">{propMap.get(it.property_id) ?? "—"}</td>
                  <td className="px-5 py-3">{it.lender_name}</td>
                  <td className="px-5 py-3">{it.loan_account_number || "—"}</td>
                  <td className="px-5 py-3 tabular-nums">{it.sanctioned_amount ? `₹${Math.round(it.sanctioned_amount).toLocaleString("en-IN")}` : "—"}</td>
                  <td className="px-5 py-3 tabular-nums">{it.outstanding_amount ? `₹${Math.round(it.outstanding_amount).toLocaleString("en-IN")}` : "—"}</td>
                  <td className="px-5 py-3 tabular-nums">{it.emi_amount ? `₹${Math.round(it.emi_amount).toLocaleString("en-IN")}` : "—"}</td>
                  <td className="px-5 py-3 tabular-nums">{it.interest_rate ? `${it.interest_rate}%` : "—"}</td>
                  <td className="px-5 py-3 tabular-nums">{it.tenure_months ? `${it.tenure_months} mo` : "—"}</td>
                  <td className="px-5 py-3">{fmtDate(it.start_date)}</td>
                  <td className="px-5 py-3">{fmtDate(it.end_date)}</td>
                  <td className="px-5 py-3"><span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">{it.status}</span></td>
                  <td className="px-5 py-3"><Switch checked={it.enabled} onCheckedChange={(v) => toggleMut.mutate({ id: it.id, enabled: v, label: it.lender_name })} /></td>
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
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Loan" : "Add Loan"}</DialogTitle>
            <DialogDescription>Capture loan information for the selected property.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
            <Field label="Property *">
              <Select value={form.property_id} onValueChange={(v) => setForm({ ...form, property_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
                <SelectContent>{propertiesData.map((p) => <SelectItem key={p.id} value={p.id}>{p.house_number}{p.city ? ` — ${p.city}` : ""}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Lender Name *"><Input value={form.lender_name} onChange={(e) => setForm({ ...form, lender_name: e.target.value })} required /></Field>
            <Field label="Loan Account Number"><Input value={form.loan_account_number} onChange={(e) => setForm({ ...form, loan_account_number: e.target.value })} /></Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Sanctioned Amount (₹)"><Input type="number" value={form.sanctioned_amount ?? ""} onChange={(e) => setForm({ ...form, sanctioned_amount: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="Outstanding Amount (₹)"><Input type="number" value={form.outstanding_amount ?? ""} onChange={(e) => setForm({ ...form, outstanding_amount: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="EMI (₹)"><Input type="number" value={form.emi_amount ?? ""} onChange={(e) => setForm({ ...form, emi_amount: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="Interest Rate (%)"><Input type="number" step="0.01" value={form.interest_rate ?? ""} onChange={(e) => setForm({ ...form, interest_rate: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="Tenure (months)"><Input type="number" value={form.tenure_months ?? ""} onChange={(e) => setForm({ ...form, tenure_months: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="Start Date"><Input type="date" value={form.start_date ?? ""} onChange={(e) => setForm({ ...form, start_date: e.target.value || null })} /></Field>
            <Field label="End Date"><Input type="date" value={form.end_date ?? ""} onChange={(e) => setForm({ ...form, end_date: e.target.value || null })} /></Field>
            <Field label="Notes" className="sm:col-span-2"><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
              <Label className="text-sm">Enabled</Label>
            </div>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={addMut.isPending || editMut.isPending}>{editing ? "Save changes" : "Add loan"}</Button>
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
