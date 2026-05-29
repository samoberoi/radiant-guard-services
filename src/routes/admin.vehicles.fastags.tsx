import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Edit2, Plus, Radio, Search, Trash2 } from "lucide-react";
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
import { useResetOnOpen, useVehicleOptions, fmtDate } from "@/lib/vehicle-helpers";
import { MiniStat } from "@/components/MiniStat";
import { SortHeader, sortRows, useSort } from "@/components/SortableHeader";


export const Route = createFileRoute("/admin/vehicles/fastags")({
  component: FastTagManagerPage,
});

type FastTag = {
  id: string;
  vehicle_id: string;
  fastag_number: string;
  bank_name: string;
  account_number: string;
  balance: number;
  issued_date: string | null;
  expiry_date: string | null;
  status: string;
  notes: string;
  enabled: boolean;
  login_type: string;
  login_id: string;
  login_password: string;
  registered_email: string;
};

const QK = ["admin", "vehicle_fastags"] as const;
const MODULE = "FastTag Manager";
const ENTITY = "vehicle_fastags";
const STATUS = ["active", "inactive", "blocked", "expired"];
const LOGIN_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "corporate", label: "Corporate" },
];
const BANKS = ["ICICI Bank", "HDFC Bank", "Axis Bank", "SBI", "Paytm Payments Bank", "IDFC FIRST Bank", "Kotak Mahindra Bank", "IndusInd Bank", "Bank of Baroda", "Federal Bank", "Other"];

function rowTo(r: Record<string, unknown>): FastTag {
  return {
    id: String(r.id),
    vehicle_id: String(r.vehicle_id ?? ""),
    fastag_number: String(r.fastag_number ?? ""),
    bank_name: String(r.bank_name ?? ""),
    account_number: String(r.account_number ?? ""),
    balance: Number(r.balance ?? 0),
    issued_date: (r.issued_date as string) ?? null,
    expiry_date: (r.expiry_date as string) ?? null,
    status: String(r.status ?? "active"),
    notes: String(r.notes ?? ""),
    enabled: Boolean(r.enabled ?? true),
    login_type: String(r.login_type ?? "individual"),
    login_id: String(r.login_id ?? ""),
    login_password: String(r.login_password ?? ""),
    registered_email: String(r.registered_email ?? ""),
  };
}


function FastTagManagerPage() {
  const qc = useQueryClient();
  const { data: vehicles = [] } = useVehicleOptions();
  const vMap = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);

  const { data: items = [] } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<FastTag[]> => {
      const { data, error } = await supabase
        .from("vehicle_fastags" as never)
        .select("id,vehicle_id,fastag_number,bank_name,account_number,balance,issued_date,expiry_date,status,notes,enabled,login_type,login_id,login_password,registered_email")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[]).map(rowTo);
    },
  });


  const invalidate = () => qc.invalidateQueries({ queryKey: QK });
  type Payload = Omit<FastTag, "id">;
  const toRow = (p: Payload) => {
    const v = vMap.get(p.vehicle_id);
    return {
      vehicle_id: p.vehicle_id,
      fastag_number: (v?.vehicle_number ?? p.fastag_number).trim(),
      bank_name: p.bank_name.trim(),
      account_number: p.account_number.trim(),
      balance: Number(p.balance) || 0,
      issued_date: p.issued_date || null,
      expiry_date: p.expiry_date || null,
      status: p.status,
      notes: p.notes.trim(),
      enabled: p.enabled,
      login_type: p.login_type,
      login_id: p.login_id.trim(),
      login_password: p.login_password,
      registered_email: p.registered_email.trim(),
    };
  };

  const addMut = useMutation({
    mutationFn: async (p: Payload) => {
      if (!p.vehicle_id) throw new Error("Vehicle is required");
      const row = toRow(p);
      const { error } = await supabase.from("vehicle_fastags" as never).insert(row as never);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "create", entityType: ENTITY, entityLabel: row.fastag_number || "FastTag", details: row as Record<string, unknown> });
    },
    onSuccess: invalidate,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: Payload }) => {
      const { error } = await supabase.from("vehicle_fastags" as never).update(toRow(p) as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "update", entityType: ENTITY, entityId: id, entityLabel: p.fastag_number, details: p as Record<string, unknown> });
    },
    onSuccess: invalidate,
  });
  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("vehicle_fastags" as never).update({ enabled } as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: enabled ? "enable" : "disable", entityType: ENTITY, entityId: id, details: { enabled } });
    },
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicle_fastags" as never).delete().eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "delete", entityType: ENTITY, entityId: id });
    },
    onSuccess: invalidate,
  });

  const [query, setQuery] = useState("");
  const [bankFilter, setBankFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<FastTag | null>(null);
  const [deleting, setDeleting] = useState<FastTag | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const stats = useMemo(() => {
    let active = 0, inactive = 0, expired = 0;
    for (const i of items) {
      const isExpired = !!i.expiry_date && i.expiry_date < today;
      if (isExpired) expired++;
      if (i.enabled && i.status === "active" && !isExpired) active++;
      else inactive++;
    }
    return { total: items.length, active, inactive, expired };
  }, [items, today]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (bankFilter !== "all" && i.bank_name !== bankFilter) return false;
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (!q) return true;
      const v = vMap.get(i.vehicle_id);
      return (
        i.fastag_number.toLowerCase().includes(q) ||
        i.bank_name.toLowerCase().includes(q) ||
        i.account_number.toLowerCase().includes(q) ||
        (v?.vehicle_number.toLowerCase().includes(q) ?? false)
      );
    });
  }, [items, query, vMap, bankFilter, statusFilter]);

  return (
    <div>
      <PageHeader
        title="FastTag Manager"
        description="Map vehicles to their FastTag accounts."
        crumbs={[{ label: "Vehicles", to: "/admin/vehicles" }, { label: "FastTag" }]}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Total FastTags" value={stats.total} />
        <MiniStat label="Active" value={stats.active} tone="accent" />
        <MiniStat label="Inactive" value={stats.inactive} tone="warning" />
        <MiniStat label="Expired" value={stats.expired} tone="destructive" />
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:max-w-2xl">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by vehicle, tag, account…" className="h-10 rounded-lg pl-9" />
          </div>
          <Select value={bankFilter} onValueChange={setBankFilter}>
            <SelectTrigger className="h-10 w-full rounded-lg sm:w-48"><SelectValue placeholder="All banks" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All banks</SelectItem>
              {BANKS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 w-full rounded-lg sm:w-40"><SelectValue placeholder="All status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              {STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAddOpen(true)} className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="mr-1.5 h-4 w-4" />Add FastTag
          </Button>
          <Button
            variant="outline"
            disabled={filtered.length === 0}
            onClick={() => downloadCsv("vehicle-fastags", filtered.map((i) => {
              const v = vMap.get(i.vehicle_id);
              return {
                vehicle: v?.vehicle_number ?? "",
                fastag_number: i.fastag_number,
                bank_name: i.bank_name,
                account_number: i.account_number,
                balance: i.balance,
                issued_date: i.issued_date ?? "",
                expiry_date: i.expiry_date ?? "",
                status: i.status,
                enabled: i.enabled ? "Yes" : "No",
              };
            }), [
              { key: "vehicle", header: "Vehicle" },
              { key: "fastag_number", header: "FastTag No." },
              { key: "bank_name", header: "Bank" },
              { key: "account_number", header: "Account" },
              { key: "balance", header: "Balance" },
              { key: "issued_date", header: "Issued" },
              { key: "expiry_date", header: "Expires" },
              { key: "status", header: "Status" },
              { key: "enabled", header: "Enabled" },
            ])}
            className="h-10 rounded-lg"
          ><Download className="mr-1.5 h-4 w-4" />Export</Button>
        </div>
      </div>




      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-accent/10 px-5 py-2.5 text-xs font-medium text-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">{filtered.length}</span>
            <span className="uppercase tracking-[0.14em] text-muted-foreground">Total {filtered.length === 1 ? "row" : "rows"}</span>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Vehicle</th>
                <th className="px-5 py-3">FastTag No.</th>
                <th className="px-5 py-3">Bank</th>
                <th className="px-5 py-3">Balance</th>
                <th className="px-5 py-3">Expires</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Enabled</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((i) => {
                const v = vMap.get(i.vehicle_id);
                return (
                  <tr key={i.id} className="hover:bg-secondary/30">
                    <td className="px-5 py-3 font-mono font-semibold text-foreground">{v?.vehicle_number || "—"}</td>
                    <td className="px-5 py-3 font-mono text-foreground/90">{i.fastag_number || "—"}</td>
                    <td className="px-5 py-3 text-foreground/90">{i.bank_name || "—"}</td>
                    <td className="px-5 py-3 text-foreground/90">₹ {i.balance.toLocaleString("en-IN")}</td>
                    <td className="px-5 py-3 text-foreground/90">{fmtDate(i.expiry_date)}</td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{i.status}</span>
                    </td>
                    <td className="px-5 py-3">
                      <Switch checked={i.enabled} onCheckedChange={(val) =>
                        toggleMut.mutate({ id: i.id, enabled: val }, {
                          onSuccess: () => toast.success(val ? "Enabled" : "Disabled"),
                          onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
                        })
                      } />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => setEditing(i)} aria-label="Edit"><Edit2 className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => setDeleting(i)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-muted-foreground">No FastTag records found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <FastTagFormDialog
        open={addOpen} onOpenChange={setAddOpen} vehicles={vehicles} title="Add FastTag"
        onSubmit={async (p) => { try { await addMut.mutateAsync(p); toast.success("FastTag added"); return null; } catch (e) { return e instanceof Error ? e.message : "Could not add"; } }}
      />
      <FastTagFormDialog
        open={!!editing} initial={editing} vehicles={vehicles} onOpenChange={(o) => !o && setEditing(null)} title="Edit FastTag"
        onSubmit={async (p) => { if (!editing) return null; try { await updateMut.mutateAsync({ id: editing.id, p }); toast.success("FastTag updated"); setEditing(null); return null; } catch (e) { return e instanceof Error ? e.message : "Could not update"; } }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this FastTag record?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && <span className="font-mono font-semibold text-foreground">{deleting.fastag_number || vMap.get(deleting.vehicle_id)?.vehicle_number}</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => { if (!deleting) return; try { await deleteMut.mutateAsync(deleting.id); toast.success("Deleted"); setDeleting(null); } catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); } }}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FastTagFormDialog({ open, onOpenChange, title, initial, vehicles, onSubmit }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string;
  initial?: FastTag | null; vehicles: { id: string; vehicle_number: string; name: string }[];
  onSubmit: (p: Omit<FastTag, "id">) => Promise<string | null>;
}) {
  const [vehicleId, setVehicleId] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [balance, setBalance] = useState("0");
  const [issuedDate, setIssuedDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [status, setStatus] = useState("active");
  const [notes, setNotes] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [loginType, setLoginType] = useState("individual");
  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useResetOnOpen(open, () => {
    setVehicleId(initial?.vehicle_id ?? "");
    setBankName(initial?.bank_name ?? "");
    setAccountNumber(initial?.account_number ?? "");
    setBalance(String(initial?.balance ?? 0));
    setIssuedDate(initial?.issued_date ?? "");
    setExpiryDate(initial?.expiry_date ?? "");
    setStatus(initial?.status || "active");
    setNotes(initial?.notes ?? "");
    setEnabled(initial?.enabled ?? true);
    setLoginType(initial?.login_type || "individual");
    setLoginId(initial?.login_id ?? "");
    setLoginPassword(initial?.login_password ?? "");
    setRegisteredEmail(initial?.registered_email ?? "");
  });

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle><span className="inline-flex items-center gap-2"><Radio className="h-4 w-4" />{title}</span></DialogTitle>
          <DialogDescription>FastTag account linked to a vehicle. The FastTag number is the vehicle's registration number.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label>Vehicle *</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
              <SelectContent>{vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.vehicle_number}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label>FastTag No. (auto = Vehicle Number)</Label>
            <Input value={selectedVehicle?.vehicle_number ?? ""} readOnly disabled placeholder="Select a vehicle first" className="font-mono" />
          </div>
          <div className="grid gap-2">
            <Label>Bank</Label>
            <Select value={bankName} onValueChange={setBankName}>
              <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
              <SelectContent>{BANKS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-2"><Label>Wallet / Account Number</Label><Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} /></div>
          <div className="grid gap-2"><Label>Balance (₹)</Label><Input type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} /></div>
          <div className="grid gap-2"><Label>Issued Date</Label><Input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} /></div>
          <div className="grid gap-2"><Label>Expiry Date</Label><Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></div>
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2 mt-2 border-t border-border pt-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">FastTag Portal Login</div>
          <div className="grid gap-2">
            <Label>Login Type</Label>
            <Select value={loginType} onValueChange={setLoginType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LOGIN_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-2"><Label>Registered Email</Label><Input type="email" value={registeredEmail} onChange={(e) => setRegisteredEmail(e.target.value)} placeholder="name@company.com" /></div>
          <div className="grid gap-2"><Label>Login ID</Label><Input value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="Username / Customer ID" /></div>
          <div className="grid gap-2"><Label>Password</Label><Input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} autoComplete="new-password" /></div>

          <div className="grid gap-2 sm:col-span-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 sm:col-span-2">
            <div><div className="text-sm font-medium">Enabled</div></div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button disabled={saving} onClick={async () => {
            if (!(await confirmAction({ title: "Save changes?", description: "Do you want to save these changes?", confirmText: "Save" }))) return;
            setSaving(true);
            const err = await onSubmit({
              vehicle_id: vehicleId,
              fastag_number: selectedVehicle?.vehicle_number ?? "",
              bank_name: bankName,
              account_number: accountNumber,
              balance: Number(balance) || 0,
              issued_date: issuedDate || null,
              expiry_date: expiryDate || null,
              status, notes, enabled,
              login_type: loginType,
              login_id: loginId,
              login_password: loginPassword,
              registered_email: registeredEmail,
            });
            setSaving(false);
            if (err) toast.error(err); else onOpenChange(false);
          }}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

