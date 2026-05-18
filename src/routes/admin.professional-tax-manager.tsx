import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import {
  Download,
  Edit2,
  Plus,
  Search,
  Trash2,
  ReceiptText,
  MapPin,
  Layers,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIndianStates } from "@/lib/admin-data";
import { logActivity } from "@/lib/activity-log";
import { downloadCsv } from "@/lib/csv-export";
import { toast } from "sonner";
import { confirmAction } from "@/components/ConfirmProvider";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/admin/professional-tax-manager")({
  component: ProfessionalTaxManagerPage,
});

type Gender = "all" | "male" | "female";

type PtSlab = {
  id: string;
  state: string;
  regionLabel: string;
  pincodeCoverage: string;
  salaryMin: number;
  salaryMax: number | null;
  taxPerMonth: number;
  gender: Gender;
  workingDays: string;
  period: string;
};

const QK = ["admin", "professional-tax-slabs"] as const;

function rowToSlab(r: Record<string, unknown>): PtSlab {
  return {
    id: String(r.id),
    state: String(r.state ?? ""),
    regionLabel: String(r.region_label ?? "All Pincodes"),
    pincodeCoverage: String(r.pincode_coverage ?? ""),
    salaryMin: Number(r.salary_min ?? 0),
    salaryMax: r.salary_max == null ? null : Number(r.salary_max),
    taxPerMonth: Number(r.tax_per_month ?? 0),
    gender: (r.gender as Gender) ?? "all",
    workingDays: String(r.working_days ?? "NORMAL"),
    period: String(r.period ?? "No Period"),
  };
}

function usePtSlabs() {
  const qc = useQueryClient();
  const { data: slabs = [] } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<PtSlab[]> => {
      const { data, error } = await supabase
        .from("professional_tax_slabs" as never)
        .select(
          "id,state,region_label,pincode_coverage,salary_min,salary_max,tax_per_month,gender,working_days,period",
        )
        .order("state", { ascending: true })
        .order("region_label", { ascending: true })
        .order("gender", { ascending: true })
        .order("salary_min", { ascending: true });
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[]).map(rowToSlab);
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  type Payload = Omit<PtSlab, "id">;
  const toRow = (p: Payload) => ({
    state: p.state.trim(),
    region_label: p.regionLabel.trim() || "All Pincodes",
    pincode_coverage: p.pincodeCoverage.trim(),
    salary_min: Number(p.salaryMin) || 0,
    salary_max:
      p.salaryMax === null || p.salaryMax === undefined || (p.salaryMax as unknown) === ""
        ? null
        : Number(p.salaryMax),
    tax_per_month: Number(p.taxPerMonth) || 0,
    gender: p.gender,
    working_days: p.workingDays.trim() || "NORMAL",
    period: p.period.trim() || "No Period",
  });

  const addMut = useMutation({
    mutationFn: async (p: Payload) => {
      if (!p.state.trim()) throw new Error("State is required");
      const { error } = await supabase
        .from("professional_tax_slabs" as never)
        .insert(toRow(p) as never);
      if (error) throw error;
    void logActivity({ module: "Professional Tax Manager", action: "create", entityType: "professional_tax_slabs", entityLabel: String((p as Record<string, unknown>).state ?? ""), details: p as Record<string, unknown> });
    },
    onSuccess: invalidate,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: Payload }) => {
      const { error } = await supabase
        .from("professional_tax_slabs" as never)
        .update(toRow(p) as never)
        .eq("id", id);
      if (error) throw error;
    void logActivity({ module: "Professional Tax Manager", action: "update", entityType: "professional_tax_slabs", entityId: id, entityLabel: String((p as Record<string, unknown>).state ?? ""), details: p as Record<string, unknown> });
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("professional_tax_slabs" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
      void logActivity({ module: "Professional Tax Manager", action: "delete", entityType: "professional_tax_slabs", entityId: id });
    },
    onSuccess: invalidate,
  });

  return { slabs, addMut, updateMut, deleteMut };
}

function fmtRange(min: number, max: number | null): string {
  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  if (max === null) return `${fmt(min)} & above`;
  if (min === 0 && max === 0) return "No slab";
  return `${fmt(min)} – ${fmt(max)}`;
}

function genderLabel(g: Gender) {
  if (g === "male") return "Male";
  if (g === "female") return "Female";
  return "Male & Female";
}

function ProfessionalTaxManagerPage() {
  const { slabs, addMut, updateMut, deleteMut } = usePtSlabs();
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [genderFilter, setGenderFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<PtSlab | null>(null);
  const [deleting, setDeleting] = useState<PtSlab | null>(null);

  const states = useMemo(
    () => Array.from(new Set(slabs.map((s) => s.state))).sort(),
    [slabs],
  );
  const regions = useMemo(
    () => Array.from(new Set(slabs.map((s) => `${s.state} • ${s.regionLabel}`))),
    [slabs],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return slabs.filter((s) => {
      if (stateFilter !== "all" && s.state !== stateFilter) return false;
      if (genderFilter !== "all" && s.gender !== genderFilter) return false;
      if (!q) return true;
      return (
        s.state.toLowerCase().includes(q) ||
        s.regionLabel.toLowerCase().includes(q) ||
        s.pincodeCoverage.toLowerCase().includes(q)
      );
    });
  }, [slabs, query, stateFilter, genderFilter]);

  return (
    <div>
      <PageHeader
        title="Professional Tax Manager"
        description="State-wise professional tax slabs with pincode coverage. Use this as the source of truth for payroll PT computation."
        crumbs={[{ label: "Professional Tax Manager" }]}
      />

      {/* Stats */}
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <StatCard label="Total slabs" value={slabs.length} icon={ReceiptText} />
        <StatCard label="States covered" value={states.length} icon={MapPin} />
        <StatCard label="Regions" value={regions.length} icon={Layers} />
        <StatCard
          label="Gender-specific"
          value={slabs.filter((s) => s.gender !== "all").length}
          icon={Plus}
          accent
        />
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search state, region, pincode…"
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
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={genderFilter} onValueChange={setGenderFilter}>
            <SelectTrigger className="h-10 w-full rounded-lg sm:w-44">
              <SelectValue placeholder="All genders" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All genders</SelectItem>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={filtered.length === 0}
            onClick={() =>
              downloadCsv(
                "professional-tax-slabs",
                filtered.map((s) => ({
                  state: s.state,
                  region: s.regionLabel,
                  pincodeCoverage: s.pincodeCoverage,
                  salaryMin: s.salaryMin,
                  salaryMax: s.salaryMax ?? "",
                  monthlySalarySlab:
                    s.salaryMax === null
                      ? `${s.salaryMin} & above`
                      : `${s.salaryMin} - ${s.salaryMax}`,
                  taxPerMonth: s.taxPerMonth,
                  gender: genderLabel(s.gender),
                  workingDays: s.workingDays,
                  period: s.period,
                })),
                [
                  { key: "state", header: "State" },
                  { key: "region", header: "Region" },
                  { key: "pincodeCoverage", header: "Pincode coverage" },
                  { key: "monthlySalarySlab", header: "Monthly salary slab (₹)" },
                  { key: "salaryMin", header: "Salary min" },
                  { key: "salaryMax", header: "Salary max" },
                  { key: "taxPerMonth", header: "Tax per month (₹)" },
                  { key: "gender", header: "Gender" },
                  { key: "workingDays", header: "Working days" },
                  { key: "period", header: "Period" },
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
            New tax slab
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-accent/10 px-5 py-2.5 text-xs font-medium text-foreground">
          <span className="inline-flex items-center gap-2"><span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">{filtered.length}</span><span className="uppercase tracking-[0.14em] text-muted-foreground">Total {filtered.length === 1 ? "row" : "rows"}</span></span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">State</th>
                <th className="px-5 py-3">Region</th>
                <th className="px-5 py-3">Pincode coverage</th>
                <th className="px-5 py-3">Monthly salary slab</th>
                <th className="px-5 py-3 text-right">Tax / month</th>
                <th className="px-5 py-3">Gender</th>
                <th className="px-5 py-3">Working days</th>
                <th className="px-5 py-3">Period</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-medium text-foreground">{s.state}</td>
                  <td className="px-5 py-3 text-foreground/90">{s.regionLabel}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{s.pincodeCoverage}</td>
                  <td className="px-5 py-3 text-foreground/90">
                    {fmtRange(s.salaryMin, s.salaryMax)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono font-semibold text-foreground">
                    {s.taxPerMonth > 0 ? `₹${s.taxPerMonth.toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td className="px-5 py-3">
                    {s.gender === "all" ? (
                      <Badge variant="outline" className="rounded-full border-border font-semibold text-muted-foreground">
                        Male & Female
                      </Badge>
                    ) : (
                      <Badge className="rounded-full bg-accent/15 font-semibold text-accent hover:bg-accent/20">
                        {genderLabel(s.gender)}
                      </Badge>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs uppercase tracking-wide text-muted-foreground">
                    {s.workingDays}
                  </td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{s.period}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => setEditing(s)}
                        aria-label="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleting(s)}
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
                  <td colSpan={9} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    No professional tax slabs found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PtSlabFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="New professional tax slab"
        knownStates={states}
        onSubmit={async (p) => {
          if (!(await confirmAction({ title: "Save changes?", description: "Do you want to save these changes?", confirmText: "Save" }))) return null;
          try {
            await addMut.mutateAsync(p);
            toast.success("Tax slab added");
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not add slab";
          }
        }}
      />

      <PtSlabFormDialog
        open={!!editing}
        initial={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Edit professional tax slab"
        knownStates={states}
        onSubmit={async (p) => {
          if (!(await confirmAction({ title: "Save changes?", description: "Do you want to save these changes?", confirmText: "Save" }))) return null;
          if (!editing) return null;
          try {
            await updateMut.mutateAsync({ id: editing.id, p });
            toast.success("Tax slab updated");
            setEditing(null);
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not update slab";
          }
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this tax slab?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && (
                <>
                  <span className="font-semibold text-foreground">{deleting.state}</span> •{" "}
                  {deleting.regionLabel} • {fmtRange(deleting.salaryMin, deleting.salaryMax)}
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
                  toast.success("Tax slab deleted");
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
  regionLabel: string;
  pincodeCoverage: string;
  salaryMin: string;
  salaryMax: string; // empty = open-ended
  taxPerMonth: string;
  gender: Gender;
  workingDays: string;
  period: string;
};

function PtSlabFormDialog({
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
  initial?: PtSlab | null;
  knownStates: string[];
  onSubmit: (p: Omit<PtSlab, "id">) => Promise<string | null>;
}) {
  const blank: FormState = {
    state: "",
    regionLabel: "All Pincodes",
    pincodeCoverage: "",
    salaryMin: "0",
    salaryMax: "",
    taxPerMonth: "0",
    gender: "all",
    workingDays: "NORMAL",
    period: "No Period",
  };
  const [form, setForm] = useState<FormState>(blank);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        state: initial.state,
        regionLabel: initial.regionLabel,
        pincodeCoverage: initial.pincodeCoverage,
        salaryMin: String(initial.salaryMin),
        salaryMax: initial.salaryMax === null ? "" : String(initial.salaryMax),
        taxPerMonth: String(initial.taxPerMonth),
        gender: initial.gender,
        workingDays: initial.workingDays,
        period: initial.period,
      });
    } else {
      setForm(blank);
    }
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Define one row of the slab table. Leave the upper salary bound blank for an open-ended
            "and above" slab.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!(await confirmAction({ title: "Save changes?", description: "Do you want to save these changes?", confirmText: "Save" }))) return null;
            if (!form.state.trim()) {
              setError("State is required");
              return;
            }
            const min = Number(form.salaryMin);
            const max = form.salaryMax === "" ? null : Number(form.salaryMax);
            if (Number.isNaN(min) || (max !== null && Number.isNaN(max))) {
              setError("Salary range must be numeric");
              return;
            }
            if (max !== null && max < min) {
              setError("Salary max must be ≥ salary min");
              return;
            }
            setSubmitting(true);
            const err = await onSubmit({
              state: form.state.trim(),
              regionLabel: form.regionLabel.trim() || "All Pincodes",
              pincodeCoverage: form.pincodeCoverage.trim(),
              salaryMin: min,
              salaryMax: max,
              taxPerMonth: Number(form.taxPerMonth) || 0,
              gender: form.gender,
              workingDays: form.workingDays.trim() || "NORMAL",
              period: form.period.trim() || "No Period",
            });
            setSubmitting(false);
            if (err) setError(err);
            else if (!initial) onOpenChange(false);
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pt-state">State</Label>
              <StateSelect
                value={form.state}
                onChange={(v) => set("state", v)}
                fallbackStates={knownStates}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pt-region">Region label</Label>
              <Input
                id="pt-region"
                value={form.regionLabel}
                onChange={(e) => set("regionLabel", e.target.value)}
                placeholder="All Pincodes / Baroda / Mumbai zone"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pt-pincode">Pincode coverage</Label>
            <Input
              id="pt-pincode"
              value={form.pincodeCoverage}
              onChange={(e) => set("pincodeCoverage", e.target.value)}
              placeholder="e.g. 390001-390025 only, or All Karnataka pincodes (560001-591346)"
            />
            <p className="text-[11px] text-muted-foreground">
              Use this to record which pincodes this slab applies to (e.g. exclusions like
              Baroda within Gujarat). Reusable ranges are stored in the Pincode Ranges table.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="pt-min">Salary min (₹)</Label>
              <Input
                id="pt-min"
                type="number"
                inputMode="numeric"
                value={form.salaryMin}
                onChange={(e) => set("salaryMin", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pt-max">Salary max (₹)</Label>
              <Input
                id="pt-max"
                type="number"
                inputMode="numeric"
                value={form.salaryMax}
                onChange={(e) => set("salaryMax", e.target.value)}
                placeholder="blank = and above"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pt-tax">Tax / month (₹)</Label>
              <Input
                id="pt-tax"
                type="number"
                inputMode="numeric"
                value={form.taxPerMonth}
                onChange={(e) => set("taxPerMonth", e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Gender</Label>
              <Select value={form.gender} onValueChange={(v) => set("gender", v as Gender)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Male & Female</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pt-wd">Working days</Label>
              <Input
                id="pt-wd"
                value={form.workingDays}
                onChange={(e) => set("workingDays", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pt-period">Period</Label>
              <Input
                id="pt-period"
                value={form.period}
                onChange={(e) => set("period", e.target.value)}
              />
            </div>
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

function StateSelect({
  value,
  onChange,
  fallbackStates,
}: {
  value: string;
  onChange: (v: string) => void;
  fallbackStates: string[];
}) {
  const { indianStates } = useIndianStates({ onlyEnabled: true });
  const names = useMemo(() => {
    const set = new Set<string>();
    indianStates.forEach((s) => s.name && set.add(s.name));
    fallbackStates.forEach((s) => s && set.add(s));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [indianStates, fallbackStates]);
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger id="pt-state">
        <SelectValue placeholder="Select state" />
      </SelectTrigger>
      <SelectContent>
        {names.map((n) => (
          <SelectItem key={n} value={n}>
            {n}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
