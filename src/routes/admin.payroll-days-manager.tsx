import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CalendarCheck2,
  CalendarDays,
  CalendarMinus,
  CalendarRange,
  Download,
  Edit2,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Badge } from "@/components/ui/badge";
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

export const Route = createFileRoute("/admin/payroll-days-manager")({
  component: PayrollDaysManagerPage,
});

type Method = "actual_days" | "fixed_days" | "actual_minus_weekly_off" | "custom_weekdays";

type PayrollDayBase = {
  id: string;
  name: string;
  code: string;
  method: Method;
  fixedDays: number | null;
  weeklyOffDay: number | null;
  includedWeekdays: number[] | null;
  description: string;
  isDefault: boolean;
  enabled: boolean;
  sortOrder: number;
};

const QK = ["admin", "payroll-day-bases"] as const;

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const METHOD_META: Record<Method, { label: string; icon: typeof CalendarDays; tone: string }> = {
  actual_days: {
    label: "Actual days in month",
    icon: CalendarDays,
    tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  fixed_days: {
    label: "Fixed days",
    icon: CalendarRange,
    tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  actual_minus_weekly_off: {
    label: "Actual minus weekly off",
    icon: CalendarMinus,
    tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  custom_weekdays: {
    label: "Custom — pick weekdays",
    icon: CalendarCheck2,
    tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
};

function rowToItem(r: Record<string, unknown>): PayrollDayBase {
  const iw = r.included_weekdays;
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    code: String(r.code ?? ""),
    method: (r.method as Method) ?? "actual_days",
    fixedDays: r.fixed_days == null ? null : Number(r.fixed_days),
    weeklyOffDay: r.weekly_off_day == null ? null : Number(r.weekly_off_day),
    includedWeekdays: Array.isArray(iw)
      ? (iw as unknown[]).map((n) => Number(n)).filter((n) => n >= 0 && n <= 6)
      : null,
    description: String(r.description ?? ""),
    isDefault: Boolean(r.is_default ?? false),
    enabled: Boolean(r.enabled ?? true),
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function describeMethod(item: PayrollDayBase): string {
  switch (item.method) {
    case "actual_days":
      return "Salary ÷ actual calendar days of the payroll month (28/29/30/31).";
    case "fixed_days":
      return `Salary ÷ ${item.fixedDays ?? "?"} (fixed) regardless of month length.`;
    case "actual_minus_weekly_off": {
      const day = WEEKDAYS[item.weeklyOffDay ?? 0] ?? "Sunday";
      return `Salary ÷ (actual days of month − ${day}s in that month).`;
    }
    case "custom_weekdays": {
      const days = (item.includedWeekdays ?? []).slice().sort((a, b) => a - b);
      if (!days.length) return "Salary ÷ count of selected weekdays (none picked yet).";
      return `Salary ÷ count of ${days.map((d) => WEEKDAY_SHORT[d]).join(", ")} in that month.`;
    }
  }
}

function usePayrollDayBases() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<PayrollDayBase[]> => {
      const { data, error } = await supabase
        .from("payroll_day_bases" as never)
        .select("id,name,code,method,fixed_days,weekly_off_day,included_weekdays,description,is_default,enabled,sort_order")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[]).map(rowToItem);
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });
  type Payload = Omit<PayrollDayBase, "id">;

  const validate = (p: Payload) => {
    if (!p.name.trim()) throw new Error("Name is required");
    if (!p.code.trim()) throw new Error("Code is required");
    if (!/^[A-Z0-9_]+$/.test(p.code)) throw new Error("Code must be uppercase letters, digits, or underscore");
    if (p.method === "fixed_days") {
      if (!p.fixedDays || p.fixedDays < 1 || p.fixedDays > 31) {
        throw new Error("Fixed days must be between 1 and 31");
      }
    }
    if (p.method === "actual_minus_weekly_off") {
      if (p.weeklyOffDay == null || p.weeklyOffDay < 0 || p.weeklyOffDay > 6) {
        throw new Error("Weekly off day is required");
      }
    }
    if (p.method === "custom_weekdays") {
      if (!p.includedWeekdays || p.includedWeekdays.length === 0) {
        throw new Error("Pick at least one weekday for Custom Weekdays");
      }
    }
  };

  const toRow = (p: Payload) => ({
    name: p.name.trim(),
    code: p.code.trim().toUpperCase(),
    method: p.method,
    fixed_days: p.method === "fixed_days" ? p.fixedDays : null,
    weekly_off_day: p.method === "actual_minus_weekly_off" ? p.weeklyOffDay : null,
    included_weekdays:
      p.method === "custom_weekdays"
        ? (p.includedWeekdays ?? []).slice().sort((a, b) => a - b)
        : null,
    description: p.description.trim(),
    is_default: p.isDefault,
    enabled: p.enabled,
    sort_order: p.sortOrder,
  });

  const addMut = useMutation({
    mutationFn: async (p: Payload) => {
      validate(p);
      const { error } = await supabase.from("payroll_day_bases" as never).insert(toRow(p) as never);
      if (error) throw error;
      void logActivity({
        module: "Payroll Days Manager",
        action: "create",
        entityType: "payroll_day_bases",
        entityLabel: p.name,
        details: p as unknown as Record<string, unknown>,
      });
    },
    onSuccess: invalidate,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: Payload }) => {
      validate(p);
      const { error } = await supabase
        .from("payroll_day_bases" as never)
        .update(toRow(p) as never)
        .eq("id", id);
      if (error) throw error;
      void logActivity({
        module: "Payroll Days Manager",
        action: "update",
        entityType: "payroll_day_bases",
        entityId: id,
        entityLabel: p.name,
        details: p as unknown as Record<string, unknown>,
      });
    },
    onSuccess: invalidate,
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("payroll_day_bases" as never)
        .update({ enabled } as never)
        .eq("id", id);
      if (error) throw error;
      void logActivity({
        module: "Payroll Days Manager",
        action: enabled ? "enable" : "disable",
        entityType: "payroll_day_bases",
        entityId: id,
        details: { enabled },
      });
    },
    onSuccess: invalidate,
  });

  const setDefaultMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("payroll_day_bases" as never)
        .update({ is_default: true } as never)
        .eq("id", id);
      if (error) throw error;
      void logActivity({
        module: "Payroll Days Manager",
        action: "set_default",
        entityType: "payroll_day_bases",
        entityId: id,
      });
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payroll_day_bases" as never).delete().eq("id", id);
      if (error) throw error;
      void logActivity({
        module: "Payroll Days Manager",
        action: "delete",
        entityType: "payroll_day_bases",
        entityId: id,
      });
    },
    onSuccess: invalidate,
  });

  return { items, addMut, updateMut, toggleMut, setDefaultMut, deleteMut };
}

function PayrollDaysManagerPage() {
  const { items, addMut, updateMut, toggleMut, setDefaultMut, deleteMut } = usePayrollDayBases();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<PayrollDayBase | null>(null);
  const [deleting, setDeleting] = useState<PayrollDayBase | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.code.toLowerCase().includes(q) ||
        METHOD_META[i.method].label.toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <div>
      <PageHeader
        title="Payroll Days Manager"
        description="Define how monthly salary days are calculated. Used in every payroll & cost formula."
        crumbs={[
          { label: "Control Center", to: "/admin/control-center" },
          { label: "Payroll Days Manager" },
        ]}
      />

      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        {(Object.keys(METHOD_META) as Method[]).map((m) => {
          const meta = METHOD_META[m];
          const Icon = meta.icon;
          const count = items.filter((i) => i.method === m).length;
          return (
            <div
              key={m}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${meta.tone}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="font-display text-sm font-bold text-foreground">{meta.label}</div>
                <div className="text-xs text-muted-foreground">{count} configured</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, code or method…"
            className="h-10 rounded-lg pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setAddOpen(true)}
            className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add New
          </Button>
          <Button
            variant="outline"
            disabled={filtered.length === 0}
            onClick={() =>
              downloadCsv(
                "payroll-day-bases",
                filtered.map((i) => ({
                  name: i.name,
                  code: i.code,
                  method: METHOD_META[i.method].label,
                  fixed_days: i.fixedDays ?? "",
                  weekly_off: i.weeklyOffDay == null ? "" : WEEKDAYS[i.weeklyOffDay],
                  custom_weekdays: (i.includedWeekdays ?? []).map((d) => WEEKDAY_SHORT[d]).join(" "),
                  default: i.isDefault ? "Yes" : "No",
                  enabled: i.enabled ? "Yes" : "No",
                })),
                [
                  { key: "name", header: "Name" },
                  { key: "code", header: "Code" },
                  { key: "method", header: "Method" },
                  { key: "fixed_days", header: "Fixed Days" },
                  { key: "weekly_off", header: "Weekly Off" },
                  { key: "custom_weekdays", header: "Custom Weekdays" },
                  { key: "default", header: "Default" },
                  { key: "enabled", header: "Enabled" },
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
                <th className="px-5 py-3">Code</th>
                <th className="px-5 py-3">Method</th>
                <th className="px-5 py-3">Logic</th>
                <th className="px-5 py-3">Default</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right" data-col="actions">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((i) => {
                const meta = METHOD_META[i.method];
                const Icon = meta.icon;
                return (
                  <tr key={i.id} className="hover:bg-secondary/30">
                    <td className="px-5 py-3 font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${meta.tone}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <div>{i.name}</div>
                          {i.description && (
                            <div className="text-xs text-muted-foreground">{i.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-foreground/80">{i.code}</td>
                    <td className="px-5 py-3">
                      <Badge variant="outline" className="rounded-full border-border">
                        {meta.label}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">{describeMethod(i)}</td>
                    <td className="px-5 py-3">
                      {i.isDefault ? (
                        <Badge className="gap-1 rounded-full bg-amber-500/15 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400">
                          <Star className="h-3 w-3 fill-current" /> Default
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            setDefaultMut.mutate(i.id, {
                              onSuccess: () => toast.success(`${i.name} set as default`),
                              onError: (e) =>
                                toast.error(e instanceof Error ? e.message : "Update failed"),
                            })
                          }
                        >
                          Set default
                        </Button>
                      )}
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
                          disabled={i.isDefault}
                          title={i.isDefault ? "Cannot delete the default entry" : "Delete"}
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
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    No payroll day bases found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PayrollDayBaseFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add Payroll Day Base"
        nextSortOrder={(items[items.length - 1]?.sortOrder ?? 0) + 1}
        onSubmit={async (p) => {
          try {
            await addMut.mutateAsync(p);
            toast.success("Added");
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not add";
          }
        }}
      />

      <PayrollDayBaseFormDialog
        open={!!editing}
        initial={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Edit Payroll Day Base"
        nextSortOrder={editing?.sortOrder ?? 0}
        onSubmit={async (p) => {
          if (!editing) return null;
          try {
            await updateMut.mutateAsync({ id: editing.id, p });
            toast.success("Updated");
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
            <AlertDialogTitle>Delete this payroll day base?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && (
                <span className="font-semibold text-foreground">{deleting.name}</span>
              )}{" "}
              — this is referenced in salary formulas. Make sure no contracts use it.
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

function PayrollDayBaseFormDialog({
  open,
  onOpenChange,
  title,
  initial,
  nextSortOrder,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  initial?: PayrollDayBase | null;
  nextSortOrder: number;
  onSubmit: (p: Omit<PayrollDayBase, "id">) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [method, setMethod] = useState<Method>("actual_days");
  const [fixedDays, setFixedDays] = useState<string>("26");
  const [weeklyOffDay, setWeeklyOffDay] = useState<string>("0");
  const [includedWeekdays, setIncludedWeekdays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [description, setDescription] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useResetOnOpen(open, () => {
    setName(initial?.name ?? "");
    setCode(initial?.code ?? "");
    setMethod(initial?.method ?? "actual_days");
    setFixedDays(initial?.fixedDays != null ? String(initial.fixedDays) : "26");
    setWeeklyOffDay(initial?.weeklyOffDay != null ? String(initial.weeklyOffDay) : "0");
    setIncludedWeekdays(
      initial?.includedWeekdays && initial.includedWeekdays.length > 0
        ? initial.includedWeekdays
        : [1, 2, 3, 4, 5, 6],
    );
    setDescription(initial?.description ?? "");
    setIsDefault(initial?.isDefault ?? false);
    setEnabled(initial?.enabled ?? true);
  });

  const toggleWeekday = (d: number) =>
    setIncludedWeekdays((cur) =>
      cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b),
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Choose how monthly salary days are computed. This drives every payroll formula.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fixed 26 Days" />
            </div>
            <div className="grid gap-2">
              <Label>Code *</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="FIXED_26"
                className="font-mono"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Calculation method *</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="actual_days">Actual days in month</SelectItem>
                <SelectItem value="fixed_days">Fixed number of days</SelectItem>
                <SelectItem value="actual_minus_weekly_off">Actual days minus a weekly off</SelectItem>
                <SelectItem value="custom_weekdays">Custom — pick weekdays</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {method === "fixed_days" && (
            <div className="grid gap-2">
              <Label>Fixed days *</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={fixedDays}
                onChange={(e) => setFixedDays(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Salary will always be divided by this number (e.g. 26).
              </p>
            </div>
          )}

          {method === "actual_minus_weekly_off" && (
            <div className="grid gap-2">
              <Label>Weekly off day *</Label>
              <Select value={weeklyOffDay} onValueChange={setWeeklyOffDay}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((d, idx) => (
                    <SelectItem key={d} value={String(idx)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Salary ÷ (actual days of month − occurrences of this weekday).
              </p>
            </div>
          )}

          {method === "custom_weekdays" && (
            <div className="grid gap-2">
              <Label>Working weekdays *</Label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((d, idx) => {
                  const checked = includedWeekdays.includes(idx);
                  return (
                    <label
                      key={d}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${checked ? "border-violet-500/50 bg-violet-500/10 text-violet-700 dark:text-violet-300" : "border-border hover:bg-secondary/50"}`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleWeekday(idx)}
                      />
                      {WEEKDAY_SHORT[idx]}
                    </label>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setIncludedWeekdays([0, 1, 2, 3, 4, 5, 6])}>All 7 days</Button>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setIncludedWeekdays([1, 2, 3, 4, 5, 6])}>Mon–Sat</Button>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setIncludedWeekdays([1, 2, 3, 4, 5])}>Mon–Fri</Button>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setIncludedWeekdays([])}>Clear</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Salary ÷ count of these weekdays occurring in the payroll month
                {includedWeekdays.length > 0 ? ` (${includedWeekdays.map((i) => WEEKDAY_SHORT[i]).join(", ")}).` : "."}
              </p>
            </div>
          )}

          <div className="grid gap-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes shown next to this option in dropdowns."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <div className="text-sm font-medium">Default</div>
                <div className="text-xs text-muted-foreground">Pre-selected in forms</div>
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
                code,
                method,
                fixedDays: method === "fixed_days" ? Number(fixedDays) || 0 : null,
                weeklyOffDay:
                  method === "actual_minus_weekly_off" ? Number(weeklyOffDay) : null,
                includedWeekdays: method === "custom_weekdays" ? includedWeekdays : null,
                description,
                isDefault,
                enabled,
                sortOrder: initial?.sortOrder ?? nextSortOrder,
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
