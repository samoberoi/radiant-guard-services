import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Edit2,
  Plus,
  Search,
  Trash2,
  HandCoins,
  MapPin,
  CalendarDays,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv } from "@/lib/csv-export";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/lwf-manager")({
  component: LwfManagerPage,
});

type Frequency = "monthly" | "quarterly" | "half-yearly" | "yearly";

type Lwf = {
  id: string;
  state: string;
  deductionMonths: number[];
  frequency: Frequency;
  employeeContribution: number;
  employerContribution: number;
  enabled: boolean;
  notes: string;
};

const QK = ["admin", "labour-welfare-funds"] as const;

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const FREQ_LABEL: Record<Frequency, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  "half-yearly": "Half-Yearly",
  yearly: "Yearly",
};

function rowToLwf(r: Record<string, unknown>): Lwf {
  const months = Array.isArray(r.deduction_months)
    ? (r.deduction_months as unknown[]).map((m) => Number(m)).filter((n) => n >= 1 && n <= 12)
    : [];
  return {
    id: String(r.id),
    state: String(r.state ?? ""),
    deductionMonths: months,
    frequency: ((r.frequency as Frequency) ?? "yearly"),
    employeeContribution: Number(r.employee_contribution ?? 0),
    employerContribution: Number(r.employer_contribution ?? 0),
    enabled: Boolean(r.enabled ?? true),
    notes: String(r.notes ?? ""),
  };
}

function useLwfs() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<Lwf[]> => {
      const { data, error } = await supabase
        .from("labour_welfare_funds" as never)
        .select("id,state,deduction_months,frequency,employee_contribution,employer_contribution,enabled,notes")
        .order("state", { ascending: true });
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[]).map(rowToLwf);
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  type Payload = Omit<Lwf, "id">;
  const toRow = (p: Payload) => ({
    state: p.state.trim(),
    deduction_months: p.deductionMonths,
    frequency: p.frequency,
    employee_contribution: Number(p.employeeContribution) || 0,
    employer_contribution: Number(p.employerContribution) || 0,
    enabled: p.enabled,
    notes: p.notes,
  });

  const addMut = useMutation({
    mutationFn: async (p: Payload) => {
      if (!p.state.trim()) throw new Error("State is required");
      const { error } = await supabase
        .from("labour_welfare_funds" as never)
        .insert(toRow(p) as never);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: Payload }) => {
      const { error } = await supabase
        .from("labour_welfare_funds" as never)
        .update(toRow(p) as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("labour_welfare_funds" as never)
        .update({ enabled } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("labour_welfare_funds" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { items, addMut, updateMut, toggleMut, deleteMut };
}

function monthsLabel(months: number[]): string {
  if (!months.length) return "—";
  return months
    .slice()
    .sort((a, b) => a - b)
    .map((m) => MONTH_NAMES[m - 1])
    .join(", ");
}

function LwfManagerPage() {
  const { items, addMut, updateMut, toggleMut, deleteMut } = useLwfs();
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [freqFilter, setFreqFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Lwf | null>(null);
  const [deleting, setDeleting] = useState<Lwf | null>(null);

  const states = useMemo(
    () => Array.from(new Set(items.map((i) => i.state))).sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (stateFilter !== "all" && i.state !== stateFilter) return false;
      if (freqFilter !== "all" && i.frequency !== freqFilter) return false;
      if (!q) return true;
      return (
        i.state.toLowerCase().includes(q) ||
        FREQ_LABEL[i.frequency].toLowerCase().includes(q)
      );
    });
  }, [items, query, stateFilter, freqFilter]);

  return (
    <div>
      <PageHeader
        title="Labour Welfare Fund"
        description="State-wise LWF contributions with deduction months and frequency. Source of truth for payroll LWF computation."
        crumbs={[{ label: "Labour Welfare Fund" }]}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <StatCard label="Total entries" value={items.length} icon={HandCoins} />
        <StatCard label="States covered" value={states.length} icon={MapPin} />
        <StatCard
          label="Active"
          value={items.filter((i) => i.enabled).length}
          icon={CalendarDays}
        />
        <StatCard
          label="Disabled"
          value={items.filter((i) => !i.enabled).length}
          icon={Plus}
          accent
        />
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search state, frequency…"
              className="h-10 rounded-lg pl-9"
            />
          </div>
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="h-10 w-full rounded-lg sm:w-48">
              <SelectValue placeholder="All states" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              {states.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={freqFilter} onValueChange={setFreqFilter}>
            <SelectTrigger className="h-10 w-full rounded-lg sm:w-44">
              <SelectValue placeholder="All frequencies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All frequencies</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="half-yearly">Half-Yearly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={filtered.length === 0}
            onClick={() =>
              downloadCsv(
                "labour-welfare-funds",
                filtered.map((i) => ({
                  state: i.state,
                  months: monthsLabel(i.deductionMonths),
                  frequency: FREQ_LABEL[i.frequency],
                  employee: i.employeeContribution,
                  employer: i.employerContribution,
                  total: i.employeeContribution + i.employerContribution,
                  enabled: i.enabled ? "Yes" : "No",
                })),
                [
                  { key: "state", header: "State" },
                  { key: "months", header: "Deduction months" },
                  { key: "frequency", header: "Frequency" },
                  { key: "employee", header: "Employee contribution (₹)" },
                  { key: "employer", header: "Employer contribution (₹)" },
                  { key: "total", header: "Total (₹)" },
                  { key: "enabled", header: "Enabled" },
                ],
              )
            }
            className="h-10 rounded-lg"
          >
            <Download className="mr-1.5 h-4 w-4" />
            Export
          </Button>
          <Button
            onClick={() => setAddOpen(true)}
            className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            New LWF entry
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">State</th>
                <th className="px-5 py-3">Months</th>
                <th className="px-5 py-3">Frequency</th>
                <th className="px-5 py-3 text-right">Employee (₹)</th>
                <th className="px-5 py-3 text-right">Employer (₹)</th>
                <th className="px-5 py-3 text-right">Total (₹)</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((i) => {
                const total = i.employeeContribution + i.employerContribution;
                return (
                  <tr key={i.id} className="hover:bg-secondary/30">
                    <td className="px-5 py-3 font-medium text-foreground">{i.state}</td>
                    <td className="px-5 py-3 text-foreground/90">{monthsLabel(i.deductionMonths)}</td>
                    <td className="px-5 py-3">
                      <Badge variant="outline" className="rounded-full border-border font-semibold text-muted-foreground">
                        {FREQ_LABEL[i.frequency]}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-foreground/90">
                      {i.employeeContribution > 0 ? `₹${i.employeeContribution.toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-foreground/90">
                      {i.employerContribution > 0 ? `₹${i.employerContribution.toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-semibold text-foreground">
                      {total > 0 ? `₹${total.toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <Switch
                        checked={i.enabled}
                        onCheckedChange={(v) =>
                          toggleMut.mutate(
                            { id: i.id, enabled: v },
                            {
                              onSuccess: () => toast.success(v ? "Enabled" : "Disabled"),
                              onError: (e) =>
                                toast.error(e instanceof Error ? e.message : "Update failed"),
                            },
                          )
                        }
                      />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => setEditing(i)}
                          aria-label="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleting(i)}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    No LWF entries found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <LwfFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="New LWF entry"
        knownStates={states}
        onSubmit={async (p) => {
          try {
            await addMut.mutateAsync(p);
            toast.success("LWF entry added");
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not add entry";
          }
        }}
      />

      <LwfFormDialog
        open={!!editing}
        initial={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Edit LWF entry"
        knownStates={states}
        onSubmit={async (p) => {
          if (!editing) return null;
          try {
            await updateMut.mutateAsync({ id: editing.id, p });
            toast.success("LWF entry updated");
            setEditing(null);
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not update entry";
          }
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this LWF entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && (
                <>
                  <span className="font-semibold text-foreground">{deleting.state}</span> •{" "}
                  {monthsLabel(deleting.deductionMonths)} • {FREQ_LABEL[deleting.frequency]}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await deleteMut.mutateAsync(deleting.id);
                  toast.success("LWF entry deleted");
                  setDeleting(null);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Delete failed");
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </span>
        <span
          className={
            accent
              ? "flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground"
              : "flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-foreground"
          }
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 font-display text-3xl font-bold text-foreground">{value}</div>
    </div>
  );
}

type FormState = {
  state: string;
  deductionMonths: number[];
  frequency: Frequency;
  employeeContribution: string;
  employerContribution: string;
  enabled: boolean;
  notes: string;
};

function LwfFormDialog({
  open,
  onOpenChange,
  title,
  initial,
  knownStates,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  initial?: Lwf | null;
  knownStates: string[];
  onSubmit: (p: Omit<Lwf, "id">) => Promise<string | null>;
}) {
  const blank: FormState = {
    state: "",
    deductionMonths: [],
    frequency: "yearly",
    employeeContribution: "0",
    employerContribution: "0",
    enabled: true,
    notes: "",
  };
  const [form, setForm] = useState<FormState>(blank);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        state: initial.state,
        deductionMonths: initial.deductionMonths,
        frequency: initial.frequency,
        employeeContribution: String(initial.employeeContribution),
        employerContribution: String(initial.employerContribution),
        enabled: initial.enabled,
        notes: initial.notes,
      });
    } else {
      setForm(blank);
    }
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleMonth = (m: number) => {
    setForm((f) => ({
      ...f,
      deductionMonths: f.deductionMonths.includes(m)
        ? f.deductionMonths.filter((x) => x !== m)
        : [...f.deductionMonths, m].sort((a, b) => a - b),
    }));
  };

  const total =
    (Number(form.employeeContribution) || 0) + (Number(form.employerContribution) || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Configure deduction months and contribution amounts. Total is computed automatically.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!form.state.trim()) {
              setError("State is required");
              return;
            }
            if (form.deductionMonths.length === 0) {
              setError("Pick at least one deduction month");
              return;
            }
            setSubmitting(true);
            const err = await onSubmit({
              state: form.state.trim(),
              deductionMonths: form.deductionMonths,
              frequency: form.frequency,
              employeeContribution: Number(form.employeeContribution) || 0,
              employerContribution: Number(form.employerContribution) || 0,
              enabled: form.enabled,
              notes: form.notes,
            });
            setSubmitting(false);
            if (err) setError(err);
            else if (!initial) onOpenChange(false);
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lwf-state">State</Label>
              <Input
                id="lwf-state"
                list="lwf-states-list"
                value={form.state}
                onChange={(e) => set("state", e.target.value)}
                placeholder="e.g. Karnataka"
                autoFocus
              />
              <datalist id="lwf-states-list">
                {knownStates.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select
                value={form.frequency}
                onValueChange={(v) => set("frequency", v as Frequency)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="half-yearly">Half-Yearly (twice a year)</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Deduction months</Label>
            <div className="grid grid-cols-6 gap-2">
              {MONTH_NAMES.map((name, idx) => {
                const m = idx + 1;
                const active = form.deductionMonths.includes(m);
                return (
                  <button
                    type="button"
                    key={m}
                    onClick={() => toggleMonth(m)}
                    className={
                      active
                        ? "rounded-lg border border-primary bg-primary px-2 py-2 text-xs font-semibold text-primary-foreground"
                        : "rounded-lg border border-border bg-card px-2 py-2 text-xs font-semibold text-muted-foreground hover:border-primary/50"
                    }
                  >
                    {name}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Pick the calendar month(s) when LWF gets deducted. e.g. Maharashtra deducts in June and December.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="lwf-emp">Employee contribution (₹)</Label>
              <Input
                id="lwf-emp"
                type="number"
                inputMode="numeric"
                value={form.employeeContribution}
                onChange={(e) => set("employeeContribution", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lwf-emr">Employer contribution (₹)</Label>
              <Input
                id="lwf-emr"
                type="number"
                inputMode="numeric"
                value={form.employerContribution}
                onChange={(e) => set("employerContribution", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Total (₹)</Label>
              <div className="flex h-10 items-center rounded-md border border-border bg-secondary/30 px-3 font-mono font-semibold text-foreground">
                ₹{total.toLocaleString("en-IN")}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Enabled</div>
              <div className="text-xs text-muted-foreground">
                Disable to exclude this state from LWF computation without deleting the row.
              </div>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => set("enabled", v)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lwf-notes">Notes</Label>
            <Input
              id="lwf-notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Optional notes / reference"
            />
          </div>

          {error && <p className="text-xs font-medium text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
