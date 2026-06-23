import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Calculator, Download, Edit2, Plus, Search, Trash2, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export const Route = createFileRoute("/admin/cost-component-manager")({
  component: CostComponentManagerPage,
});

type Operator = "+" | "-";
type BaseRef = { label: string; operator: Operator };

type CostComponent = {
  id: string;
  name: string;
  calc_type: "percentage" | "fixed";
  percentage: number;
  base_components: BaseRef[];
  cap_amount: number | null;
  cap_flat_amount: number | null;
  amount: number | null;
  state: string;
  notes: string;
  enabled: boolean;
  sort_order: number;
  deduction_calc_type: "earned_salary" | "fixed_amount";
};

type AllowanceRow = { id: string; name: string; display_name: string; short_name: string };
type StateRow = { id: string; name: string };

const QK = ["admin", "cost-components"] as const;
const ALLOW_QK = ["admin", "cost-components", "allowance-options"] as const;
const STATES_QK = ["admin", "cost-components", "states"] as const;
const STATUTORY_ESI_BASE: BaseRef[] = [
  { label: "Gross", operator: "+" },
  { label: "Washing Allowance", operator: "-" },
  { label: "Conveyance Allowance", operator: "-" },
];

function isEsiName(name: string) {
  return /\besi(c)?\b/i.test(name);
}

function rowToItem(r: Record<string, unknown>): CostComponent {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    calc_type: (String(r.calc_type ?? "percentage") as "percentage" | "fixed"),
    percentage: Number(r.percentage ?? 0),
    base_components: Array.isArray(r.base_components) ? (r.base_components as BaseRef[]) : [],
    cap_amount: r.cap_amount == null ? null : Number(r.cap_amount),
    cap_flat_amount: r.cap_flat_amount == null ? null : Number(r.cap_flat_amount),
    amount: r.amount == null ? null : Number(r.amount),
    state: String(r.state ?? "N/A"),
    notes: String(r.notes ?? ""),
    enabled: Boolean(r.enabled ?? true),
    sort_order: Number(r.sort_order ?? 0),
    deduction_calc_type:
      (String(r.deduction_calc_type ?? "earned_salary") as "earned_salary" | "fixed_amount"),
  };
}

function buildDescription(c: Pick<CostComponent, "calc_type" | "percentage" | "base_components" | "cap_amount" | "cap_flat_amount" | "amount"> & { name?: string }): string {
  if (c.calc_type === "fixed") {
    const isMgmt = /management\s*fee/i.test(c.name ?? "");
    if (isMgmt) {
      return c.amount != null && c.amount > 0
        ? `₹${c.amount.toLocaleString("en-IN")} · prorated by T Days in payroll`
        : "Prorated by T Days (manual entry)";
    }
    return c.amount != null && c.amount > 0 ? `Fixed ₹${c.amount.toLocaleString("en-IN")}` : "Fixed amount (manual entry)";
  }

  const name = (c.name ?? "").toLowerCase();
  void name;
  const parts = c.base_components.map((b, i) => (i === 0 ? b.label : `${b.operator === "-" ? "(-) " : "(+) "}${b.label}`));
  const base = parts.length ? parts.join(" ") : "—";
  if (c.cap_amount && c.cap_amount > 0) {
    if (c.cap_flat_amount == null) {
      const flat = Math.round(((c.percentage || 0) / 100) * c.cap_amount);
      return `${c.percentage}% of (${base}) if ≤ ₹${c.cap_amount.toLocaleString("en-IN")}, else flat ₹${flat.toLocaleString("en-IN")}`;
    }
    if (c.cap_flat_amount <= 0) {
      return `${c.percentage}% of (${base}) only if ≤ ₹${c.cap_amount.toLocaleString("en-IN")}, else ₹0`;
    }
    return `${c.percentage}% of (${base}) if ≤ ₹${c.cap_amount.toLocaleString("en-IN")}, else flat ₹${c.cap_flat_amount.toLocaleString("en-IN")}`;
  }
  return `${c.percentage}% of ${base}`;
}

function useCostComponents() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<CostComponent[]> => {
      const { data, error } = await supabase
        .from("cost_components" as never)
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[]).map(rowToItem);
    },
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  type Payload = Omit<CostComponent, "id">;
  const toRow = (p: Payload) => ({
    name: p.name.trim(),
    calc_type: p.calc_type,
    percentage: p.calc_type === "percentage" ? Number(p.percentage) || 0 : 0,
    base_components: p.calc_type === "percentage" ? p.base_components : [],
    cap_amount: p.calc_type === "percentage" ? p.cap_amount : null,
    cap_flat_amount: p.calc_type === "percentage" ? p.cap_flat_amount : null,
    amount: p.calc_type === "fixed" ? p.amount : null,
    state: p.state || "N/A",
    notes: p.notes,
    enabled: p.enabled,
    sort_order: p.sort_order,
    deduction_calc_type: p.deduction_calc_type,
  });

  const addMut = useMutation({
    mutationFn: async (p: Payload) => {
      if (!p.name.trim()) throw new Error("Name is required");
      const { error } = await supabase.from("cost_components" as never).insert(toRow(p) as never);
      if (error) throw error;
      void logActivity({ module: "Cost Component Manager", action: "create", entityType: "cost_components", entityLabel: p.name, details: p as Record<string, unknown> });
    },
    onSuccess: invalidate,
  });
  const updateMut = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: Payload }) => {
      const { error } = await supabase.from("cost_components" as never).update(toRow(p) as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: "Cost Component Manager", action: "update", entityType: "cost_components", entityId: id, entityLabel: p.name, details: p as Record<string, unknown> });
    },
    onSuccess: invalidate,
  });
  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("cost_components" as never).update({ enabled } as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: "Cost Component Manager", action: enabled ? "enable" : "disable", entityType: "cost_components", entityId: id, details: { enabled } });
    },
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cost_components" as never).delete().eq("id", id);
      if (error) throw error;
      void logActivity({ module: "Cost Component Manager", action: "delete", entityType: "cost_components", entityId: id });
    },
    onSuccess: invalidate,
  });

  return { items, addMut, updateMut, toggleMut, deleteMut };
}

function useAllowanceOptions() {
  const { data = [] } = useQuery({
    queryKey: ALLOW_QK,
    queryFn: async (): Promise<AllowanceRow[]> => {
      const { data, error } = await supabase
        .from("allowance_types" as never)
        .select("id,name,display_name,short_name")
        .eq("enabled", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data as unknown) as AllowanceRow[];
    },
  });
  return data;
}

function useStateOptions() {
  const { data = [] } = useQuery({
    queryKey: STATES_QK,
    queryFn: async (): Promise<StateRow[]> => {
      const { data, error } = await supabase.from("states" as never).select("id,name").order("name");
      if (error) throw error;
      return (data as unknown) as StateRow[];
    },
  });
  return data;
}

// Built-in base tokens that aren't in allowance master
const BUILTIN_BASES = ["Basic", "DA", "Gross", "CTC", "HRA"];

function CostComponentManagerPage() {
  const { items, addMut, updateMut, toggleMut, deleteMut } = useCostComponents();
  const allowances = useAllowanceOptions();
  const states = useStateOptions();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<CostComponent | null>(null);
  const [deleting, setDeleting] = useState<CostComponent | null>(null);

  const baseLabels = useMemo(() => {
    const set = new Set<string>(BUILTIN_BASES);
    for (const a of allowances) {
      if (a.display_name) set.add(a.display_name);
      else if (a.name) set.add(a.name);
    }
    return Array.from(set);
  }, [allowances]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => {
      const desc = buildDescription(i).toLowerCase();
      return (
        i.name.toLowerCase().includes(q) ||
        i.state.toLowerCase().includes(q) ||
        desc.includes(q)
      );
    });
  }, [items, query]);

  return (
    <div>
      <PageHeader
        title="Cost Component Manager"
        description="Configure CTC cost components like EPF, ESI, Bonus, Gratuity, LWF, Uniform charges, etc."
        crumbs={[{ label: "Control Center", to: "/admin/control-center" }, { label: "Cost Component Manager" }]}
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cost component…"
            className="h-10 rounded-lg pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAddOpen(true)} className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="mr-1.5 h-4 w-4" /> Add Cost Component
          </Button>
          <Button
            variant="outline"
            disabled={filtered.length === 0}
            onClick={() =>
              downloadCsv(
                "cost-components",
                filtered.map((i) => ({
                  name: i.name,
                  description: buildDescription(i),
                  calc_type: i.calc_type,
                  percentage: i.percentage,
                  state: i.state,
                  enabled: i.enabled ? "Yes" : "No",
                })),
                [
                  { key: "name", header: "Name" },
                  { key: "description", header: "Description" },
                  { key: "calc_type", header: "Type" },
                  { key: "percentage", header: "%" },
                  { key: "state", header: "State" },
                  { key: "enabled", header: "Active" },
                ],
              )
            }
            className="h-10 rounded-lg"
          >
            <Download className="mr-1.5 h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-accent/10 px-5 py-2.5 text-xs font-medium text-foreground">
          <span className="inline-flex items-center gap-2"><span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">{filtered.length}</span><span className="uppercase tracking-[0.14em] text-muted-foreground">Total {filtered.length === 1 ? "row" : "rows"}</span></span>
        </div>
        <div className="overflow-x-clip">
          <table className="ios-table w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Description</th>
                <th className="px-5 py-3">%</th>
                <th className="px-5 py-3">State</th>
                <th className="px-5 py-3">Active</th>
                <th className="px-5 py-3 text-right" data-col="actions">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((i) => (
                <tr key={i.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-medium text-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Calculator className="h-4 w-4 text-muted-foreground" />
                      {i.name}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-foreground/80">{buildDescription(i)}</td>
                  <td className="px-5 py-3 text-foreground/90">
                    {i.calc_type === "percentage" ? `${i.percentage}%` : "—"}
                  </td>
                  <td className="px-5 py-3 text-foreground/90">{i.state || "N/A"}</td>
                  <td className="px-5 py-3">
                    <Switch
                      checked={i.enabled}
                      onCheckedChange={(v) =>
                        toggleMut.mutate(
                          { id: i.id, enabled: v },
                          {
                            onSuccess: () => toast.success(v ? "Enabled" : "Disabled"),
                            onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
                          },
                        )
                      }
                    />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => setEditing(i)} aria-label="Edit">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => setDeleting(i)} aria-label="Delete">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    No cost components found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CostComponentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add Cost Component"
        baseLabels={baseLabels}
        states={states}
        onSubmit={async (p) => {
          try {
            await addMut.mutateAsync(p);
            toast.success("Cost component added");
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not add";
          }
        }}
      />

      <CostComponentDialog
        open={!!editing}
        initial={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Edit Cost Component"
        baseLabels={baseLabels}
        states={states}
        onSubmit={async (p) => {
          if (!editing) return null;
          try {
            await updateMut.mutateAsync({ id: editing.id, p });
            toast.success("Cost component updated");
            setEditing(null);
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not update";
          }
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this cost component?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && <span className="font-semibold text-foreground">{deleting.name}</span>}
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
                  toast.success("Deleted");
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

function CostComponentDialog({
  open,
  onOpenChange,
  title,
  initial,
  baseLabels,
  states,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  initial?: CostComponent | null;
  baseLabels: string[];
  states: StateRow[];
  onSubmit: (p: Omit<CostComponent, "id">) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [calcType, setCalcType] = useState<"percentage" | "fixed">("percentage");
  const [percentage, setPercentage] = useState<string>("0");
  const [baseRefs, setBaseRefs] = useState<BaseRef[]>([]);
  const [capAmount, setCapAmount] = useState<string>("");
  const [capFlatAmount, setCapFlatAmount] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [state, setState] = useState<string>("N/A");
  const [notes, setNotes] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [sortOrder, setSortOrder] = useState<string>("0");
  const [deductionCalcType, setDeductionCalcType] =
    useState<"earned_salary" | "fixed_amount">("earned_salary");
  const [saving, setSaving] = useState(false);

  useResetOnOpen(open, () => {
    setName(initial?.name ?? "");
    setCalcType(initial?.calc_type ?? "percentage");
    setPercentage(String(initial?.percentage ?? 0));
    const initialBase = initial?.base_components ?? [];
    // Migrate legacy "Earned Gross" label → "Gross" (no such component exists).
    setBaseRefs(
      initialBase.map((b) => (b.label === "Earned Gross" ? { ...b, label: "Gross" } : b)),
    );
    setCapAmount(initial?.cap_amount != null ? String(initial.cap_amount) : "");
    setCapFlatAmount(initial?.cap_flat_amount != null ? String(initial.cap_flat_amount) : "");
    setAmount(initial?.amount != null ? String(initial.amount) : "");
    setState(initial?.state ?? "N/A");
    setNotes(initial?.notes ?? "");
    setEnabled(initial?.enabled ?? true);
    setSortOrder(String(initial?.sort_order ?? 0));
    setDeductionCalcType(initial?.deduction_calc_type ?? "earned_salary");
  });

  const stateOptions = useMemo(() => ["N/A", ...states.map((s) => s.name)], [states]);

  const preview = buildDescription({
    calc_type: calcType,
    percentage: Number(percentage) || 0,
    base_components: baseRefs,
    cap_amount: capAmount ? Number(capAmount) : null,
    cap_flat_amount: capFlatAmount ? Number(capFlatAmount) : null,
    amount: amount ? Number(amount) : null,
    name,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Define how this cost is calculated.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. EPF Employer Contribution" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label>Calculation Type</Label>
              <Select value={calcType} onValueChange={(v) => setCalcType(v as "percentage" | "fixed")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage of base</SelectItem>
                  <SelectItem value="fixed">Fixed amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>State</Label>
              <Select value={state} onValueChange={setState}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stateOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Sort Order</Label>
              <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </div>
          </div>

          {calcType === "percentage" ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label>Percentage (%)</Label>
                  <Input type="number" step="0.01" value={percentage} onChange={(e) => setPercentage(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Wage Ceiling (optional, ₹)</Label>
                  <Input type="number" value={capAmount} onChange={(e) => setCapAmount(e.target.value)} placeholder="e.g. 15000 (EPF cap)" />
                </div>
                <div className="grid gap-2">
                  <Label>Flat Amount Above Ceiling (₹)</Label>
                  <Input
                    type="number"
                    value={capFlatAmount}
                    onChange={(e) => setCapFlatAmount(e.target.value)}
                    placeholder={
                      capAmount && Number(capAmount) > 0
                        ? `Auto: ${Math.round(((Number(percentage) || 0) / 100) * Number(capAmount))}`
                        : "Manual override"
                    }
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Base Components</Label>
                <div className="rounded-lg border border-border p-3">
                  {baseRefs.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No base added. Pick a component below.</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {baseRefs.map((b, idx) => (
                        <div key={`${b.label}-${idx}`} className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 pl-1 pr-1">
                          <Select
                            value={b.operator}
                            onValueChange={(v) => {
                              const next = [...baseRefs];
                              next[idx] = { ...b, operator: v as Operator };
                              setBaseRefs(next);
                            }}
                          >
                            <SelectTrigger className="h-7 w-12 border-0 bg-transparent px-1 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="+">+</SelectItem>
                              <SelectItem value="-">−</SelectItem>
                            </SelectContent>
                          </Select>
                          <span className="text-sm font-medium">{b.label}</span>
                          <button
                            type="button"
                            className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                            onClick={() => setBaseRefs(baseRefs.filter((_, i) => i !== idx))}
                            aria-label="Remove"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {(() => {
                    const used = new Set(baseRefs.map((b) => b.label));
                    const remaining = baseLabels.filter((l) => !used.has(l));
                    if (remaining.length === 0) return null;
                    return (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {remaining.map((lbl) => (
                          <button
                            key={lbl}
                            type="button"
                            className="rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-accent/10 hover:text-accent"
                            onClick={() => setBaseRefs([...baseRefs, { label: lbl, operator: "+" }])}
                          >
                            + {lbl}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </>
          ) : (
            <div className="grid gap-2">
              <Label>Fixed Amount (₹) — optional, can be entered later</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Manual entry" />
            </div>
          )}

          <div className="grid gap-2">
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal note" />
          </div>

          <div className="grid gap-2">
            <Label>Deduction Calculation Type</Label>
            <Select
              value={deductionCalcType}
              onValueChange={(v) => setDeductionCalcType(v as "earned_salary" | "fixed_amount")}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="earned_salary">Earned Salary Based — prorates with attendance</SelectItem>
                <SelectItem value="fixed_amount">Fixed Amount — deduct full amount regardless of attendance</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Applies only when this component is used as a deduction or employee/employer contribution.
            </p>
          </div>


          <div className="rounded-lg border border-dashed border-border bg-secondary/30 px-3 py-2 text-sm">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Preview · </span>
            <span className="font-medium text-foreground">{preview}</span>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <div className="text-sm font-medium">Active</div>
              <div className="text-xs text-muted-foreground">Available for selection</div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const err = await onSubmit({
                name,
                calc_type: calcType,
                percentage: Number(percentage) || 0,
                base_components: baseRefs,
                cap_amount: capAmount ? Number(capAmount) : null,
                cap_flat_amount: capFlatAmount ? Number(capFlatAmount) : null,
                amount: amount ? Number(amount) : null,
                state: state || "N/A",
                notes,
                enabled,
                sort_order: Number(sortOrder) || 0,
              });
              setSaving(false);
              if (err) toast.error(err);
              else onOpenChange(false);
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useResetOnOpen(open: boolean, reset: () => void) {
  const [last, setLast] = useState(false);
  if (open !== last) {
    setLast(open);
    if (open) reset();
  }
}
