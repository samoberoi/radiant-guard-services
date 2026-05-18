import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Edit2, Plus, Search, Trash2, LogOut } from "lucide-react";
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

export const Route = createFileRoute("/admin/offboarding-reason-manager")({
  component: OffboardingReasonManagerPage,
});

type Reason = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  sort_order: number;
};

const QK = ["admin", "offboarding-reasons"] as const;
const MODULE = "Offboarding Reason Manager";
const ENTITY = "offboarding_reasons";
const TABLE = "offboarding_reasons";

function rowToItem(r: Record<string, unknown>): Reason {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    description: String(r.description ?? ""),
    enabled: Boolean(r.enabled ?? true),
    sort_order: Number(r.sort_order ?? 0),
  };
}

function useReasons() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<Reason[]> => {
      const { data, error } = await supabase
        .from(TABLE as never)
        .select("id,name,description,enabled,sort_order")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[]).map(rowToItem);
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });
  type Payload = Omit<Reason, "id">;
  const toRow = (p: Payload) => ({
    name: p.name.trim(),
    description: p.description.trim(),
    enabled: p.enabled,
    sort_order: p.sort_order,
  });

  const addMut = useMutation({
    mutationFn: async (p: Payload) => {
      if (!p.name.trim()) throw new Error("Name is required");
      const { error } = await supabase.from(TABLE as never).insert(toRow(p) as never);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "create", entityType: ENTITY, entityLabel: p.name, details: p as Record<string, unknown> });
    },
    onSuccess: invalidate,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: Payload }) => {
      const { error } = await supabase
        .from(TABLE as never)
        .update(toRow(p) as never)
        .eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "update", entityType: ENTITY, entityId: id, entityLabel: p.name, details: p as Record<string, unknown> });
    },
    onSuccess: invalidate,
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from(TABLE as never)
        .update({ enabled } as never)
        .eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: enabled ? "enable" : "disable", entityType: ENTITY, entityId: id, details: { enabled } });
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(TABLE as never).delete().eq("id", id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "delete", entityType: ENTITY, entityId: id });
    },
    onSuccess: invalidate,
  });

  return { items, addMut, updateMut, toggleMut, deleteMut };
}

function OffboardingReasonManagerPage() {
  const { items, addMut, updateMut, toggleMut, deleteMut } = useReasons();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Reason | null>(null);
  const [deleting, setDeleting] = useState<Reason | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <div>
      <PageHeader
        title="Offboarding Reason Manager"
        description="Manage reasons used when offboarding an employee (Resignation, Termination, Absconding, Death)."
        crumbs={[{ label: "Control Center", to: "/admin/control-center" }, { label: "Offboarding Reason Manager" }]}
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reason…"
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
                "offboarding-reasons",
                filtered.map((i) => ({
                  name: i.name,
                  description: i.description,
                  sort_order: i.sort_order,
                  enabled: i.enabled ? "Yes" : "No",
                })),
                [
                  { key: "name", header: "Name" },
                  { key: "description", header: "Description" },
                  { key: "sort_order", header: "Sort Order" },
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
          <span className="inline-flex items-center gap-2">
            <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">{filtered.length}</span>
            <span className="uppercase tracking-[0.14em] text-muted-foreground">Total {filtered.length === 1 ? "row" : "rows"}</span>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Description</th>
                <th className="px-5 py-3">Sort</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((i) => (
                <tr key={i.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-medium text-foreground">
                    <span className="inline-flex items-center gap-2">
                      <LogOut className="h-4 w-4 text-muted-foreground" />
                      {i.name}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-foreground/90">{i.description || "—"}</td>
                  <td className="px-5 py-3 text-foreground/90">{i.sort_order}</td>
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
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    No offboarding reasons found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ReasonFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add Offboarding Reason"
        onSubmit={async (p) => {
          try {
            await addMut.mutateAsync(p);
            toast.success("Reason added");
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not add reason";
          }
        }}
      />

      <ReasonFormDialog
        open={!!editing}
        initial={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Edit Offboarding Reason"
        onSubmit={async (p) => {
          if (!editing) return null;
          try {
            await updateMut.mutateAsync({ id: editing.id, p });
            toast.success("Reason updated");
            setEditing(null);
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not update reason";
          }
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this reason?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && (
                <span className="font-semibold text-foreground">{deleting.name}</span>
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
                  toast.success("Reason deleted");
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

function ReasonFormDialog({
  open,
  onOpenChange,
  title,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  initial?: Reason | null;
  onSubmit: (p: Omit<Reason, "id">) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  useResetOnOpen(open, () => {
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setEnabled(initial?.enabled ?? true);
    setSortOrder(initial?.sort_order ?? 0);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Reason shown in the offboarding dropdown for employees.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Resignation"
            />
          </div>
          <div className="grid gap-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes"
              rows={3}
            />
          </div>
          <div className="grid gap-2">
            <Label>Sort Order</Label>
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
            />
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
              const err = await onSubmit({ name, description, enabled, sort_order: sortOrder });
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
