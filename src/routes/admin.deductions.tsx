import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Coins, Download, Edit2, Plus, Search, Trash2, ChevronLeft, ChevronsUpDown } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { downloadCsv } from "@/lib/csv-export";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { z } from "zod";

const searchSchema = z.object({
  mode: z.enum(["list", "create", "edit"]).default("list"),
  id: z.string().optional(),
});

export const Route = createFileRoute("/admin/deductions")({
  validateSearch: (s) => searchSchema.parse(s),
  component: DeductionsPage,
});

type CalcType = "lumpsum" | "per_duty_amount" | "total_amount";
type Status = "active" | "paused" | "completed" | "cancelled";

type Deduction = {
  id: string;
  candidate_id: string;
  deduction_type_id: string;
  deduction_date: string;
  deduction_name: string;
  calculation_type: CalcType;
  amount: number;
  installments: number;
  min_duty?: number;
  max_duty?: number;
  description: string;
  status: Status;
};

type DType = { id: string; name: string; code: string; is_active: boolean };
type Emp = { id: string; full_name: string; employee_code: string; mobile: string };

const QK_DED = ["admin", "deductions"] as const;

function fmtINR(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function DeductionsPage() {
  const search = Route.useSearch();
  if (search.mode === "create" || search.mode === "edit") return <DeductionForm />;
  return <DeductionList />;
}

function useDeductionTypes() {
  return useQuery({
    queryKey: ["admin", "deduction-types", "active"],
    queryFn: async (): Promise<DType[]> => {
      const { data, error } = await supabase
        .from("deduction_types" as never)
        .select("id,name,code,is_active")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data as unknown) as DType[];
    },
  });
}

function useEmployees() {
  return useQuery({
    queryKey: ["admin", "employees-lite"],
    queryFn: async (): Promise<Emp[]> => {
      const { data, error } = await supabase
        .from("candidates")
        .select("id,full_name,employee_code,mobile")
        .in("status", ["approved", "active"])
        .order("full_name");
      if (error) throw error;
      return (data ?? []).map((c) => ({
        id: c.id as string,
        full_name: (c.full_name as string) ?? "",
        employee_code: (c.employee_code as string) ?? "",
        mobile: (c.mobile as string) ?? "",
      }));
    },
  });
}

function DeductionList() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const types = useDeductionTypes();
  const emps = useEmployees();

  const { data: items = [] } = useQuery({
    queryKey: QK_DED,
    queryFn: async (): Promise<Deduction[]> => {
      const { data, error } = await supabase
        .from("deductions" as never)
        .select("id,candidate_id,deduction_type_id,deduction_date,deduction_name,calculation_type,amount,installments,description,status,min_duty,max_duty")
        .order("deduction_date", { ascending: false });
      if (error) throw error;
      return (data as unknown) as Deduction[];
    },
  });

  const typeMap = useMemo(() => new Map((types.data ?? []).map((t) => [t.id, t])), [types.data]);
  const empMap = useMemo(() => new Map((emps.data ?? []).map((e) => [e.id, e])), [emps.data]);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("active");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (!s) return true;
      const emp = empMap.get(i.candidate_id);
      const type = typeMap.get(i.deduction_type_id);
      return (
        i.deduction_name.toLowerCase().includes(s) ||
        emp?.full_name.toLowerCase().includes(s) ||
        emp?.employee_code.toLowerCase().includes(s) ||
        type?.name.toLowerCase().includes(s)
      );
    });
  }, [items, q, statusFilter, empMap, typeMap]);

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("deductions" as never).delete().eq("id", id);
      if (error) throw error;
      void logActivity({ module: "Deductions", action: "delete", entityType: "deductions", entityId: id });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_DED }),
  });

  const [deleting, setDeleting] = useState<Deduction | null>(null);

  return (
    <div>
      <PageHeader
        title="Deductions"
        description="Record and track employee deductions applied to payroll."
        crumbs={[{ label: "Employees", to: "/admin/employees" }, { label: "Deductions" }]}
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employee, type, name…" className="h-10 rounded-lg pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="h-10 w-40 rounded-lg"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate({ to: "/admin/deductions", search: { mode: "create" } })} className="h-10 rounded-lg">
            <Plus className="mr-1.5 h-4 w-4" /> Add Deduction
          </Button>
          <Button variant="outline" disabled={filtered.length === 0} className="h-10 rounded-lg"
            onClick={() => downloadCsv(
              "deductions",
              filtered.map((i) => ({
                employee: empMap.get(i.candidate_id)?.full_name ?? "",
                employee_code: empMap.get(i.candidate_id)?.employee_code ?? "",
                type: typeMap.get(i.deduction_type_id)?.name ?? "",
                date: i.deduction_date,
                name: i.deduction_name,
                calc: i.calculation_type,
                amount: i.amount,
                installments: i.installments,
                status: i.status,
              })),
              [
                { key: "employee", header: "Employee" },
                { key: "employee_code", header: "Emp Code" },
                { key: "type", header: "Type" },
                { key: "date", header: "Date" },
                { key: "name", header: "Deduction Name" },
                { key: "calc", header: "Calc Type" },
                { key: "amount", header: "Amount" },
                { key: "installments", header: "Installments" },
                { key: "status", header: "Status" },
              ],
            )}
          ><Download className="mr-1.5 h-4 w-4" /> Export</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border bg-accent/10 px-5 py-2.5 text-xs">
          <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">{filtered.length}</span>
          <span className="ml-2 uppercase tracking-[0.14em] text-muted-foreground">Total {filtered.length === 1 ? "row" : "rows"}</span>
        </div>
        <div className="overflow-x-clip">
          <table className="ios-table w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Employee</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Deduction Name</th>
                <th className="px-5 py-3 text-right">Amount</th>
                <th className="px-5 py-3 text-right">Inst.</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right" data-col="actions">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((i) => {
                const emp = empMap.get(i.candidate_id);
                const type = typeMap.get(i.deduction_type_id);
                return (
                  <tr key={i.id} className="hover:bg-secondary/30">
                    <td className="px-5 py-3">
                      <div className="font-medium">{emp?.full_name ?? "—"}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{emp?.employee_code}</div>
                    </td>
                    <td className="px-5 py-3"><span className="inline-flex items-center gap-1.5"><Coins className="h-3.5 w-3.5 text-muted-foreground" />{type?.name ?? "—"}</span></td>
                    <td className="px-5 py-3 text-muted-foreground">{i.deduction_date}</td>
                    <td className="px-5 py-3">{i.deduction_name}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{fmtINR(Number(i.amount))}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{i.installments}</td>
                    <td className="px-5 py-3">
                      <span className={
                        i.status === "active" ? "rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
                        : i.status === "paused" ? "rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                        : i.status === "completed" ? "rounded-md bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800"
                        : "rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
                      }>{i.status}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <Link to="/admin/deductions" search={{ mode: "edit", id: i.id }}>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0"><Edit2 className="h-4 w-4" /></Button>
                        </Link>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:text-destructive" onClick={() => setDeleting(i)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-muted-foreground">No deductions found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this deduction?</AlertDialogTitle>
            <AlertDialogDescription>{deleting?.deduction_name}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try { await deleteMut.mutateAsync(deleting.id); toast.success("Deleted"); setDeleting(null); }
                catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
              }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DeductionForm() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const qc = useQueryClient();
  const isEdit = search.mode === "edit" && !!search.id;

  const types = useDeductionTypes();
  const emps = useEmployees();

  const existing = useQuery({
    queryKey: ["admin", "deduction", search.id],
    enabled: isEdit,
    queryFn: async (): Promise<Deduction | null> => {
      const { data, error } = await supabase
        .from("deductions" as never)
        .select("id,candidate_id,deduction_type_id,deduction_date,deduction_name,calculation_type,amount,installments,description,status,min_duty,max_duty")
        .eq("id", search.id!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown) as Deduction | null;
    },
  });

  const [candidateId, setCandidateId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [calc, setCalc] = useState<CalcType>("lumpsum");
  const [amount, setAmount] = useState<string>("");
  const [installments, setInstallments] = useState<string>("1");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("active");
  const [minDuty, setMinDuty] = useState<string>("0");
  const [maxDuty, setMaxDuty] = useState<string>("0");
  const [step, setStep] = useState<"info" | "constraints">("info");
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  if (isEdit && existing.data && !hydrated) {
    const d = existing.data;
    setCandidateId(d.candidate_id);
    setTypeId(d.deduction_type_id);
    setDate(d.deduction_date);
    setCalc(d.calculation_type);
    setAmount(String(d.amount));
    setInstallments(String(d.installments));
    setDescription(d.description ?? "");
    setStatus(d.status);
    setMinDuty(String(d.min_duty ?? 0));
    setMaxDuty(String(d.max_duty ?? 0));
    setHydrated(true);
  }

  const emp = useMemo(() => (emps.data ?? []).find((e) => e.id === candidateId), [emps.data, candidateId]);
  const type = useMemo(() => (types.data ?? []).find((t) => t.id === typeId), [types.data, typeId]);

  // Auto-generated deduction name: "{emp_code} - {type} - {date}"
  const autoName = useMemo(() => {
    const codePart = emp?.employee_code || emp?.full_name || "EMP";
    const typePart = type?.name || "Deduction";
    return `${codePart} - ${typePart} - ${date}`;
  }, [emp, type, date]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!candidateId) throw new Error("Select an employee");
      if (!typeId) throw new Error("Select a deduction type");
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt < 0) throw new Error("Enter a valid amount");
      const inst = Math.max(1, parseInt(installments, 10) || 1);
      const payload = {
        candidate_id: candidateId,
        deduction_type_id: typeId,
        deduction_date: date,
        deduction_name: autoName,
        calculation_type: calc,
        amount: amt,
        installments: inst,
        description: description.trim(),
        status,
        min_duty: Math.max(0, Number(minDuty) || 0),
        max_duty: Math.max(0, Number(maxDuty) || 0),
      };
      if (isEdit && search.id) {
        const { error } = await supabase.from("deductions" as never).update(payload as never).eq("id", search.id);
        if (error) throw error;
        void logActivity({ module: "Deductions", action: "update", entityType: "deductions", entityId: search.id, entityLabel: autoName });
      } else {
        const { error } = await supabase.from("deductions" as never).insert(payload as never);
        if (error) throw error;
        void logActivity({ module: "Deductions", action: "create", entityType: "deductions", entityLabel: autoName });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK_DED });
      toast.success(isEdit ? "Deduction updated" : "Deduction created");
      navigate({ to: "/admin/deductions", search: { mode: "list" } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div>
      <PageHeader
        title={isEdit ? "Edit Deduction" : "Create Deduction"}
        description="Auto-generated deduction name follows: {Employee Code} - {Type} - {Date}."
        crumbs={[{ label: "Employees", to: "/admin/employees" }, { label: "Deductions", to: "/admin/deductions" }, { label: isEdit ? "Edit" : "Create" }]}
      />
      <div className="mb-3">
        <Link to="/admin/deductions" search={{ mode: "list" }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Back
        </Link>
      </div>

      {/* Tabs */}
      <div className="mb-3 flex gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setStep("info")}
          className={`px-3 py-2 text-sm font-medium ${step === "info" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}
        >
          Deduction Information
        </button>
        <button
          type="button"
          onClick={() => { if (candidateId && typeId && amount) setStep("constraints"); }}
          className={`px-3 py-2 text-sm font-medium ${step === "constraints" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}
        >
          Deduction Constraints
        </button>
      </div>

      {step === "info" && (
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Deduction Information</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <Label>* Employee</Label>
            <Select value={candidateId} onValueChange={setCandidateId}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {(emps.data ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.employee_code ? `${e.employee_code} - ` : ""}{e.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>* Deduction Type</Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {(types.data ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>* Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>* Deduction Name</Label>
            <Input value={autoName} readOnly className="bg-muted/40" />
          </div>

          <div className="grid gap-1.5">
            <Label>* Deduction Calculation Type</Label>
            <Select value={calc} onValueChange={(v) => setCalc(v as CalcType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lumpsum">Lumpsum Amount</SelectItem>
                <SelectItem value="per_duty_amount">Based On Duty And Per Day Amount</SelectItem>
                <SelectItem value="total_amount">Based On Duty And Total Amount</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>* Deduction Amount</Label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>* Deduction Installments</Label>
            <Input type="number" min="1" step="1" value={installments} onChange={(e) => setInstallments(e.target.value)} disabled={calc !== "lumpsum"} />
          </div>
          <div className="grid gap-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5 md:col-span-2 lg:col-span-4">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={3} />
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
          <div><strong>Lumpsum Amount:</strong> Amount = Deduction Amount / Installments</div>
          <div><strong>Based On Duty And Per Day Amount:</strong> Amount = Deduction Amount × Duties</div>
          <div><strong>Based On Duty And Total Amount:</strong> Amount = (Deduction Amount / Working Days) × Duties</div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/admin/deductions", search: { mode: "list" } })} disabled={saving}>Cancel</Button>
          <Button type="button" disabled={!candidateId || !typeId || !amount} onClick={() => setStep("constraints")}>Next step</Button>
        </div>
      </div>
      )}

      {step === "constraints" && (
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Deduction Constraints</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Duty Information — if the employee's payroll duty count in a month is less than <strong>Min Duty</strong>, this
          deduction will be skipped and automatically carried forward to the next month. Set <strong>Max Duty</strong> to 0 for no upper cap.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>* Min Duty</Label>
            <Input type="number" min="0" step="0.01" value={minDuty} onChange={(e) => setMinDuty(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>* Max Duty</Label>
            <Input type="number" min="0" step="0.01" value={maxDuty} onChange={(e) => setMaxDuty(e.target.value)} />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setStep("info")} disabled={saving}>Previous step</Button>
          <Button type="button" disabled={saving} onClick={async () => {
            setSaving(true);
            try { await saveMut.mutateAsync(); } finally { setSaving(false); }
          }}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>
      )}
    </div>
  );
}
