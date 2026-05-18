import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Edit2, Plus, Search, Trash2, CalendarRange } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/payroll-manager")({
  component: PayrollManagerPage,
});

type PayrollWindow = {
  id: string;
  label: string;
  windowStartDay: number;
  windowEndDay: number;
  processingDay: number;
  enabled: boolean;
};

const QK = ["admin", "payroll-windows"] as const;

function rowToItem(r: Record<string, unknown>): PayrollWindow {
  return {
    id: String(r.id),
    label: String(r.label ?? ""),
    windowStartDay: Number(r.window_start_day ?? 1),
    windowEndDay: Number(r.window_end_day ?? 31),
    processingDay: Number(r.processing_day ?? 1),
    enabled: Boolean(r.enabled ?? true),
  };
}

function windowLabel(w: PayrollWindow): string {
  if (w.label.trim()) return w.label;
  const end = w.windowEndDay === 31 ? "30/31" : String(w.windowEndDay);
  return `${w.windowStartDay} to ${end}`;
}

function usePayrollWindows() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<PayrollWindow[]> => {
      const { data, error } = await supabase
        .from("payroll_windows" as never)
        .select("id,label,window_start_day,window_end_day,processing_day,enabled")
        .order("window_start_day", { ascending: true });
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[]).map(rowToItem);
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });
  type Payload = Omit<PayrollWindow, "id">;
  const toRow = (p: Payload) => ({
    label: p.label.trim(),
    window_start_day: Number(p.windowStartDay),
    window_end_day: Number(p.windowEndDay),
    processing_day: Number(p.processingDay),
    enabled: p.enabled,
  });

  const validate = (p: Payload) => {
    const inRange = (n: number) => Number.isFinite(n) && n >= 1 && n <= 31;
    if (!inRange(p.windowStartDay)) throw new Error("Window start day must be 1–31");
    if (!inRange(p.windowEndDay)) throw new Error("Window end day must be 1–31");
    if (!inRange(p.processingDay)) throw new Error("Processing day must be 1–31");
  };

  const addMut = useMutation({
    mutationFn: async (p: Payload) => {
      validate(p);
      const { error } = await supabase.from("payroll_windows" as never).insert(toRow(p) as never);
      if (error) throw error;
    void logActivity({ module: "Payroll Manager", action: "create", entityType: "payroll_windows", entityLabel: String((p as Record<string, unknown>).label ?? ""), details: p as Record<string, unknown> });
    },
    onSuccess: invalidate,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: Payload }) => {
      validate(p);
      const { error } = await supabase
        .from("payroll_windows" as never)
        .update(toRow(p) as never)
        .eq("id", id);
      if (error) throw error;
    void logActivity({ module: "Payroll Manager", action: "update", entityType: "payroll_windows", entityId: id, entityLabel: String((p as Record<string, unknown>).label ?? ""), details: p as Record<string, unknown> });
    },
    onSuccess: invalidate,
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("payroll_windows" as never)
        .update({ enabled } as never)
        .eq("id", id);
      if (error) throw error;
    void logActivity({ module: "Payroll Manager", action: enabled ? "enable" : "disable", entityType: "payroll_windows", entityId: id, details: { enabled } });
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("payroll_windows" as never).delete().eq("id", id);
      if (error) throw error;
    void logActivity({ module: "Payroll Manager", action: "delete", entityType: "payroll_windows", entityId: id });
    },
    onSuccess: invalidate,
  });

  return { items, addMut, updateMut, toggleMut, deleteMut };
}

function PayrollManagerPage() {
  const { items, addMut, updateMut, toggleMut, deleteMut } = usePayrollWindows();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<PayrollWindow | null>(null);
  const [deleting, setDeleting] = useState<PayrollWindow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => windowLabel(i).toLowerCase().includes(q));
  }, [items, query]);

  return (
    <div>
      <PageHeader
        title="Payroll Manager"
        description="Configure payroll windows and the salary processing day for each cycle."
        crumbs={[{ label: "Control Center", to: "/admin/control-center" }, { label: "Payroll Manager" }]}
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search window…"
            className="h-10 rounded-lg pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setAddOpen(true)}
            className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add New
          </Button>
          <Button
            variant="outline"
            disabled={filtered.length === 0}
            onClick={() =>
              downloadCsv(
                "payroll-windows",
                filtered.map((i) => ({
                  window: windowLabel(i),
                  start: i.windowStartDay,
                  end: i.windowEndDay,
                  processing: i.processingDay,
                  enabled: i.enabled ? "Yes" : "No",
                })),
                [
                  { key: "window", header: "Window" },
                  { key: "start", header: "Start day" },
                  { key: "end", header: "End day" },
                  { key: "processing", header: "Processing day" },
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
        <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-5 py-2 text-xs text-muted-foreground">
          <span><span className="font-semibold text-foreground">{filtered.length}</span> {filtered.length === 1 ? "row" : "rows"}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Payroll Window</th>
                <th className="px-5 py-3 text-right">Start Day</th>
                <th className="px-5 py-3 text-right">End Day</th>
                <th className="px-5 py-3 text-right">Processing Day</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((i) => (
                <tr key={i.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-medium text-foreground">
                    <span className="inline-flex items-center gap-2">
                      <CalendarRange className="h-4 w-4 text-muted-foreground" />
                      {windowLabel(i)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-foreground/90">{i.windowStartDay}</td>
                  <td className="px-5 py-3 text-right font-mono text-foreground/90">
                    {i.windowEndDay === 31 ? "30/31" : i.windowEndDay}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Badge variant="outline" className="rounded-full border-border font-mono font-semibold text-foreground">
                      {i.processingDay}
                    </Badge>
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
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    No payroll windows found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PayrollFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add New Payroll Window"
        onSubmit={async (p) => {
          try {
            await addMut.mutateAsync(p);
            toast.success("Payroll window added");
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not add window";
          }
        }}
      />

      <PayrollFormDialog
        open={!!editing}
        initial={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Edit Payroll Window"
        onSubmit={async (p) => {
          if (!editing) return null;
          try {
            await updateMut.mutateAsync({ id: editing.id, p });
            toast.success("Payroll window updated");
            setEditing(null);
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not update window";
          }
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this payroll window?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && (
                <span className="font-semibold text-foreground">{windowLabel(deleting)}</span>
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
                  toast.success("Payroll window deleted");
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

function PayrollFormDialog({
  open,
  onOpenChange,
  title,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  initial?: PayrollWindow | null;
  onSubmit: (p: Omit<PayrollWindow, "id">) => Promise<string | null>;
}) {
  const [label, setLabel] = useState("");
  const [start, setStart] = useState<string>("1");
  const [end, setEnd] = useState<string>("31");
  const [processing, setProcessing] = useState<string>("7");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useResetOnOpen(open, () => {
    setLabel(initial?.label ?? "");
    setStart(initial ? String(initial.windowStartDay) : "1");
    setEnd(initial ? String(initial.windowEndDay) : "31");
    setProcessing(initial ? String(initial.processingDay) : "7");
    setEnabled(initial?.enabled ?? true);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Define the attendance window and the day salary is processed.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Window start day</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Window end day</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Salary processing day</Label>
            <Input
              type="number"
              min={1}
              max={31}
              value={processing}
              onChange={(e) => setProcessing(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Day of the month salary is processed (e.g. 7 for 1–30/31 window).
            </p>
          </div>
          <div className="grid gap-2">
            <Label>Label (optional)</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Standard month"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to auto-label as “{start} to {end === "31" ? "30/31" : end}”.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <div className="text-sm font-medium">Enabled</div>
              <div className="text-xs text-muted-foreground">Show in dropdowns</div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              if (!(await confirmAction({ title: "Save changes?", description: "Do you want to save these changes?", confirmText: "Save" }))) return;
              setSaving(true);
              const err = await onSubmit({
                label,
                windowStartDay: Number(start) || 0,
                windowEndDay: Number(end) || 0,
                processingDay: Number(processing) || 0,
                enabled,
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
