import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Edit2, Plus, Receipt, Search, Trash2 } from "lucide-react";
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

export const Route = createFileRoute("/admin/billing-type-manager")({
  component: BillingTypeManagerPage,
});

type BillingType = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
};

const QK = ["admin", "billing-types"] as const;

function rowToItem(r: Record<string, unknown>): BillingType {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    description: String(r.description ?? ""),
    enabled: Boolean(r.enabled ?? true),
  };
}

function useBillingTypes() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<BillingType[]> => {
      const { data, error } = await supabase
        .from("billing_types" as never)
        .select("id,name,description,enabled")
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data as unknown) as Record<string, unknown>[]).map(rowToItem);
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });
  type Payload = Omit<BillingType, "id">;
  const toRow = (p: Payload) => ({
    name: p.name.trim(),
    description: p.description.trim(),
    enabled: p.enabled,
  });

  const addMut = useMutation({
    mutationFn: async (p: Payload) => {
      if (!p.name.trim()) throw new Error("Name is required");
      const { error } = await supabase.from("billing_types" as never).insert(toRow(p) as never);
      if (error) throw error;
    void logActivity({ module: "Billing Type Manager", action: "create", entityType: "billing_types", entityLabel: String((p as Record<string, unknown>).name ?? ""), details: p as Record<string, unknown> });
    },
    onSuccess: invalidate,
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: Payload }) => {
      const { error } = await supabase
        .from("billing_types" as never)
        .update(toRow(p) as never)
        .eq("id", id);
      if (error) throw error;
    void logActivity({ module: "Billing Type Manager", action: "update", entityType: "billing_types", entityId: id, entityLabel: String((p as Record<string, unknown>).name ?? ""), details: p as Record<string, unknown> });
    },
    onSuccess: invalidate,
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("billing_types" as never)
        .update({ enabled } as never)
        .eq("id", id);
      if (error) throw error;
    void logActivity({ module: "Billing Type Manager", action: enabled ? "enable" : "disable", entityType: "billing_types", entityId: id, details: { enabled } });
    },
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("billing_types" as never).delete().eq("id", id);
      if (error) throw error;
    void logActivity({ module: "Billing Type Manager", action: "delete", entityType: "billing_types", entityId: id });
    },
    onSuccess: invalidate,
  });

  return { items, addMut, updateMut, toggleMut, deleteMut };
}

function BillingTypeManagerPage() {
  const { items, addMut, updateMut, toggleMut, deleteMut } = useBillingTypes();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<BillingType | null>(null);
  const [deleting, setDeleting] = useState<BillingType | null>(null);

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
        title="Billing Type Manager"
        description="Define billing types like Man Hours, Man Days, Man Months, Special."
        crumbs={[{ label: "Control Center", to: "/admin/control-center" }, { label: "Billing Type Manager" }]}
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search billing type…"
            className="h-10 rounded-lg pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setAddOpen(true)}
            className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add New Billing Type
          </Button>
          <Button
            variant="outline"
            disabled={filtered.length === 0}
            onClick={() =>
              downloadCsv(
                "billing-types",
                filtered.map((i) => ({
                  name: i.name,
                  description: i.description,
                  enabled: i.enabled ? "Yes" : "No",
                })),
                [
                  { key: "name", header: "Name" },
                  { key: "description", header: "Description" },
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
                <th className="px-5 py-3">Description</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right" data-col="actions">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((i) => (
                <tr key={i.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-medium text-foreground">
                    <span className="inline-flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-muted-foreground" />
                      {i.name}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-foreground/90">{i.description || "—"}</td>
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
                  <td colSpan={4} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    No billing types found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <BillingTypeFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add New Billing Type"
        onSubmit={async (p) => {
          try {
            await addMut.mutateAsync(p);
            toast.success("Billing type added");
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not add billing type";
          }
        }}
      />

      <BillingTypeFormDialog
        open={!!editing}
        initial={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Edit Billing Type"
        onSubmit={async (p) => {
          if (!editing) return null;
          try {
            await updateMut.mutateAsync({ id: editing.id, p });
            toast.success("Billing type updated");
            setEditing(null);
            return null;
          } catch (e) {
            return e instanceof Error ? e.message : "Could not update billing type";
          }
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this billing type?</AlertDialogTitle>
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
                  toast.success("Billing type deleted");
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

function BillingTypeFormDialog({
  open,
  onOpenChange,
  title,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  initial?: BillingType | null;
  onSubmit: (p: Omit<BillingType, "id">) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useResetOnOpen(open, () => {
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setEnabled(initial?.enabled ?? true);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Used as a dropdown across billing flows.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Man Days"
            />
          </div>
          <div className="grid gap-2">
            <Label>
              Description <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description"
              rows={3}
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
              setSaving(true);
              const err = await onSubmit({ name, description, enabled });
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
