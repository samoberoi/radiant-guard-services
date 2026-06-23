import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Coins, Download, Edit2, Plus, Search, Trash2, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { downloadCsv } from "@/lib/csv-export";
import { toast } from "sonner";
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

export const Route = createFileRoute("/admin/allowance-manager")({
  component: AllowanceManagerPage,
});

type Operator = "+" | "-";
type BaseRef = { label: string; operator: Operator };

type Allowance = {
  id: string;
  name: string;
  earning_type: string;
  display_name: string;
  short_name: string;
  is_default: boolean;
  enabled: boolean;
  calc_type: "fixed" | "percentage";
  percentage: number;
  base_components: BaseRef[];
  cap_amount: number | null;
  include_in_ot: boolean;
};

const QK = ["admin", "allowance-types"] as const;

// Built-in base tokens that always make sense as formula references.
const BUILTIN_BASES = ["Basic", "DA", "Gross", "CTC"];

function rowToItem(r: Record<string, unknown>): Allowance {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    earning_type: String(r.earning_type ?? ""),
    display_name: String(r.display_name ?? ""),
    short_name: String(r.short_name ?? ""),
    is_default: Boolean(r.is_default ?? false),
    enabled: Boolean(r.enabled ?? true),
    calc_type: (String(r.calc_type ?? "fixed") as "fixed" | "percentage"),
    percentage: Number(r.percentage ?? 0),
    base_components: Array.isArray(r.base_components) ? (r.base_components as BaseRef[]) : [],
    cap_amount: r.cap_amount == null ? null : Number(r.cap_amount),
    include_in_ot: r.include_in_ot == null ? true : Boolean(r.include_in_ot),
  };
}

function buildFormulaPreview(a: Pick<Allowance, "calc_type" | "percentage" | "base_components" | "cap_amount">): string {
  if (a.calc_type === "fixed") return "Manual amount entered per contract";
  const parts = a.base_components.map((b, i) => (i === 0 ? b.label : `${b.operator === "-" ? "− " : "+ "}${b.label}`));
  const base = parts.length ? parts.join(" ") : "—";
  const tail = a.cap_amount && a.cap_amount > 0 ? ` (capped at ₹${a.cap_amount.toLocaleString("en-IN")})` : "";
  return `${a.percentage || 0}% of ${base}${tail}`;
}

function useAllowances() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<Allowance[]> => {
      const { data, error } = await supabase
        .from("allowance_types" as never)
        .select("id,name,earning_type,display_name,short_name,is_default,enabled,calc_type,percentage,base_components,cap_amount,include_in_ot")
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[]).map(rowToItem);
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });
  type Payload = Omit<Allowance, "id">;
  const toRow = (p: Payload) => ({
    name: p.name.trim(),
    earning_type: p.earning_type.trim(),
    display_name: p.display_name.trim(),
    short_name: p.short_name.trim(),
    is_default: p.is_default,
    enabled: p.enabled,
    calc_type: p.calc_type,
    percentage: p.calc_type === "percentage" ? Number(p.percentage) || 0 : 0,
    base_components: p.calc_type === "percentage" ? p.base_components : [],
    cap_amount: p.calc_type === "percentage" ? p.cap_amount : null,
    include_in_ot: p.include_in_ot,
  });

  const addMut = useMutation({
    mutationFn: async (p: Payload) => {
      if (!p.name.trim()) throw new Error("Name is required");
      const { error } = await supabase.from("allowance_types" as never).insert(toRow(p) as never);
      if (error) throw error;
      void logActivity({ module: "Allowance Manager", action: "create", entityType: "allowance_types", entityLabel: String((p as Record<string, unknown>).display_name ?? ""), details: p as Record<string, unknown> });
    },
    onSuccess: invalidate,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: Payload }) => {
      const { error } = await supabase.from("allowance_types" as never).update(toRow(p) as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: "Allowance Manager", action: "update", entityType: "allowance_types", entityId: id, entityLabel: String((p as Record<string, unknown>).display_name ?? ""), details: p as Record<string, unknown> });
    },
    onSuccess: invalidate,
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("allowance_types" as never).update({ enabled } as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: "Allowance Manager", action: enabled ? "enable" : "disable", entityType: "allowance_types", entityId: id, details: { enabled } });
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("allowance_types" as never).delete().eq("id", id);
      if (error) throw error;
      void logActivity({ module: "Allowance Manager", action: "delete", entityType: "allowance_types", entityId: id });
    },
    onSuccess: invalidate,
  });

  return { items, addMut, updateMut, toggleMut, deleteMut };
}

function AllowanceManagerPage() {
  const { items, addMut, updateMut, toggleMut, deleteMut } = useAllowances();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Allowance | null>(null);
  const [deleting, setDeleting] = useState<Allowance | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.earning_type.toLowerCase().includes(q) ||
        i.display_name.toLowerCase().includes(q) ||
        i.short_name.toLowerCase().includes(q),
    );
  }, [items, query]);

  // Labels usable as formula bases: built-ins + every other allowance's short/display name.
  const labelsFor = (current: Allowance | null): string[] => {
    const set = new Set<string>(BUILTIN_BASES);
    for (const a of items) {
      if (current && a.id === current.id) continue;
      const lbl = a.short_name || a.display_name || a.name;
      if (lbl) set.add(lbl);
    }
    return Array.from(set);
  };

  return (
    <div>
      <PageHeader
        title="Allowance Manager"
        description="Define allowance / earning components. Each one can be a fixed amount or a formula like 5% of Basic + Special Allowance."
        crumbs={[{ label: "Control Center", to: "/admin/control-center" }, { label: "Allowance Manager" }]}
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search allowance…"
            className="h-10 rounded-lg pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setAddOpen(true)}
            className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add New Allowance Type
          </Button>
          <Button
            variant="outline"
            disabled={filtered.length === 0}
            onClick={() =>
              downloadCsv(
                "allowance-types",
                filtered.map((i) => ({
                  name: i.name,
                  earning_type: i.earning_type,
                  display_name: i.display_name,
                  short_name: i.short_name,
                  formula: buildFormulaPreview(i),
                  is_default: i.is_default ? "Yes" : "No",
                  enabled: i.enabled ? "Yes" : "No",
                })),
                [
                  { key: "name", header: "Name" },
                  { key: "earning_type", header: "Earning Type" },
                  { key: "display_name", header: "Display Name" },
                  { key: "short_name", header: "Short Name" },
                  { key: "formula", header: "Formula" },
                  { key: "is_default", header: "Default" },
                  { key: "enabled", header: "Enabled" },
                ],
              )
            }
            className="h-10 rounded-lg"
          >
            <Download className="mr-1.5 h-4 w-4" />
            Export
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
                <th className="px-5 py-3">Earning Type</th>
                <th className="px-5 py-3">Short</th>
                <th className="px-5 py-3">Formula</th>
                <th className="px-5 py-3">Default</th>
                <th className="px-5 py-3">In OT</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right" data-col="actions">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">

              {filtered.map((i) => (
                <tr key={i.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-medium text-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Coins className="h-4 w-4 text-muted-foreground" />
                      {i.name}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-foreground/90">{i.earning_type || "—"}</td>
                  <td className="px-5 py-3 text-foreground/90">{i.short_name || "—"}</td>
                  <td className="px-5 py-3 text-foreground/80">
                    {i.calc_type === "percentage" ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="rounded-md bg-accent/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-accent">Formula</span>
                        {buildFormulaPreview(i)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Manual</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={
                        i.is_default
                          ? "inline-flex rounded-md bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent"
                          : "text-xs text-muted-foreground"
                      }
                    >
                      {i.is_default ? "YES" : "NO"}
                    </span>
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
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    No allowance types found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AllowanceFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add New Allowance Type"
        baseLabels={labelsFor(null)}
        onSubmit={async (p) => {
          try {
            await addMut.mutateAsync(p);
            toast.success("Allowance added");
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not add allowance";
          }
        }}
      />

      <AllowanceFormDialog
        open={!!editing}
        initial={editing}
        baseLabels={labelsFor(editing)}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Edit Allowance Type"
        onSubmit={async (p) => {
          if (!editing) return null;
          try {
            await updateMut.mutateAsync({ id: editing.id, p });
            toast.success("Allowance updated");
            setEditing(null);
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not update allowance";
          }
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this allowance type?</AlertDialogTitle>
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
                  toast.success("Allowance deleted");
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

function AllowanceFormDialog({
  open,
  onOpenChange,
  title,
  initial,
  baseLabels,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  initial?: Allowance | null;
  baseLabels: string[];
  onSubmit: (p: Omit<Allowance, "id">) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [earningType, setEarningType] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [shortName, setShortName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [calcType, setCalcType] = useState<"fixed" | "percentage">("fixed");
  const [percentage, setPercentage] = useState<string>("0");
  const [baseRefs, setBaseRefs] = useState<BaseRef[]>([]);
  const [capAmount, setCapAmount] = useState<string>("");
  const [includeInOt, setIncludeInOt] = useState(true);
  const [saving, setSaving] = useState(false);

  useResetOnOpen(open, () => {
    setName(initial?.name ?? "");
    setEarningType(initial?.earning_type ?? "");
    setDisplayName(initial?.display_name ?? "");
    setShortName(initial?.short_name ?? "");
    setIsDefault(initial?.is_default ?? false);
    setEnabled(initial?.enabled ?? true);
    setCalcType(initial?.calc_type ?? "fixed");
    setPercentage(String(initial?.percentage ?? 0));
    setBaseRefs(initial?.base_components ?? []);
    setCapAmount(initial?.cap_amount != null ? String(initial.cap_amount) : "");
    setIncludeInOt(initial?.include_in_ot ?? true);
  });

  const preview = buildFormulaPreview({
    calc_type: calcType,
    percentage: Number(percentage) || 0,
    base_components: baseRefs,
    cap_amount: capAmount ? Number(capAmount) : null,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Used as an earning component in payroll.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HRA" />
          </div>
          <div className="grid gap-2">
            <Label>Earning Type</Label>
            <Input
              value={earningType}
              onChange={(e) => setEarningType(e.target.value)}
              placeholder="e.g. House Rent Allowance"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Display Name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="HRA"
              />
            </div>
            <div className="grid gap-2">
              <Label>Short Name</Label>
              <Input
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="HRA"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Calculation Type</Label>
            <Select value={calcType} onValueChange={(v) => setCalcType(v as "fixed" | "percentage")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Manual amount (entered per contract)</SelectItem>
                <SelectItem value="percentage">Formula — % of other components</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {calcType === "percentage" && (
            <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Percentage (%)</Label>
                  <Input type="number" step="0.01" value={percentage} onChange={(e) => setPercentage(e.target.value)} placeholder="e.g. 5" />
                </div>
                <div className="grid gap-2">
                  <Label>Wage Ceiling (optional, ₹)</Label>
                  <Input type="number" value={capAmount} onChange={(e) => setCapAmount(e.target.value)} placeholder="e.g. 15000" />
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Base Components</Label>
                <div className="rounded-lg border border-border bg-card p-3">
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
                    const used = new Set(baseRefs.map((b) => b.label.toLowerCase()));
                    const remaining = baseLabels.filter((l) => !used.has(l.toLowerCase()));
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
                <p className="text-[11px] text-muted-foreground">
                  Pick built-in totals (Basic, DA, Gross, CTC) or other allowances. The amount is auto-calculated on each contract when this allowance is added.
                </p>
              </div>

              <div className="rounded-lg border border-dashed border-border bg-card px-3 py-2 text-sm">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">Preview · </span>
                <span className="font-medium text-foreground">{preview}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <div className="text-sm font-medium">Default</div>
              <div className="text-xs text-muted-foreground">Auto-included for new employees</div>
            </div>
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <div className="text-sm font-medium">Enabled</div>
              <div className="text-xs text-muted-foreground">Show in dropdowns</div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <div className="text-sm font-medium">Include in OT Calculation</div>
              <div className="text-xs text-muted-foreground">If off, this allowance is excluded from the OT base amount</div>
            </div>
            <Switch checked={includeInOt} onCheckedChange={setIncludeInOt} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const err = await onSubmit({
                name,
                earning_type: earningType,
                display_name: displayName,
                short_name: shortName,
                is_default: isDefault,
                enabled,
                calc_type: calcType,
                percentage: Number(percentage) || 0,
                base_components: baseRefs,
                cap_amount: capAmount ? Number(capAmount) : null,
                include_in_ot: includeInOt,
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
