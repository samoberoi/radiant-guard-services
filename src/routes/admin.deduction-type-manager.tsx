import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Calculator, Coins, Edit2, Plus, Search, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/admin/deduction-type-manager")({
  component: DeductionTypeManagerPage,
});

type DType = { id: string; name: string; code: string; is_active: boolean; sort_order: number };

const QK = ["admin", "deduction-types"] as const;

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function DeductionTypeManagerPage() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<DType[]> => {
      const { data, error } = await supabase
        .from("deduction_types" as never)
        .select("id,name,code,is_active,sort_order")
        .order("sort_order");
      if (error) throw error;
      return (data as unknown) as DType[];
    },
  });

  const inv = () => qc.invalidateQueries({ queryKey: QK });

  const addMut = useMutation({
    mutationFn: async (p: { name: string; code: string; is_active: boolean }) => {
      const { error } = await supabase.from("deduction_types" as never).insert(p as never);
      if (error) throw error;
      void logActivity({ module: "Deduction Type Manager", action: "create", entityType: "deduction_types", entityLabel: p.name });
    },
    onSuccess: inv,
  });
  const updateMut = useMutation({
    mutationFn: async ({ id, p }: { id: string; p: Partial<DType> }) => {
      const { error } = await supabase.from("deduction_types" as never).update(p as never).eq("id", id);
      if (error) throw error;
      void logActivity({ module: "Deduction Type Manager", action: "update", entityType: "deduction_types", entityId: id });
    },
    onSuccess: inv,
  });
  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("deduction_types" as never).delete().eq("id", id);
      if (error) throw error;
      void logActivity({ module: "Deduction Type Manager", action: "delete", entityType: "deduction_types", entityId: id });
    },
    onSuccess: inv,
  });

  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<DType | null>(null);
  const [deleting, setDeleting] = useState<DType | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((i) => i.name.toLowerCase().includes(s) || i.code.toLowerCase().includes(s));
  }, [items, q]);

  return (
    <div>
      <PageHeader
        title="Deduction Type Manager"
        description="Catalog of deduction categories used when recording employee deductions."
        crumbs={[{ label: "Control Center", to: "/admin/control-center" }, { label: "Deduction Type Manager" }]}
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-10 rounded-lg pl-9" />
        </div>
        <Button onClick={() => setAddOpen(true)} className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-1.5 h-4 w-4" /> Add Deduction Type
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="ios-table w-full text-sm">
          <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Code</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right" data-col="actions">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((i) => (
              <tr key={i.id} className="hover:bg-secondary/30">
                <td className="px-5 py-3 font-medium"><span className="inline-flex items-center gap-2"><Coins className="h-4 w-4 text-muted-foreground" />{i.name}</span></td>
                <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{i.code}</td>
                <td className="px-5 py-3">
                  <Switch checked={i.is_active} onCheckedChange={(v) => updateMut.mutate({ id: i.id, p: { is_active: v } }, { onSuccess: () => toast.success(v ? "Active" : "Inactive") })} />
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <Link to="/admin/formula-lab/$kind/$id" params={{ kind: "deduction", id: i.id }}>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:text-primary"><Calculator className="h-4 w-4" /></Button>
                    </Link>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditing(i)}><Edit2 className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 hover:text-destructive" onClick={() => setDeleting(i)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={4} className="px-5 py-12 text-center text-sm text-muted-foreground">No deduction types.</td></tr>}
          </tbody>
        </table>
      </div>

      <FormDialog
        open={addOpen} onOpenChange={setAddOpen} title="Add Deduction Type"
        onSubmit={async (p) => {
          try { await addMut.mutateAsync(p); toast.success("Added"); return null; }
          catch (e) { return e instanceof Error ? e.message : "Failed"; }
        }}
      />
      <FormDialog
        open={!!editing} initial={editing} onOpenChange={(o) => !o && setEditing(null)} title="Edit Deduction Type"
        onSubmit={async (p) => {
          if (!editing) return null;
          try { await updateMut.mutateAsync({ id: editing.id, p }); toast.success("Updated"); setEditing(null); return null; }
          catch (e) { return e instanceof Error ? e.message : "Failed"; }
        }}
      />
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this deduction type?</AlertDialogTitle>
            <AlertDialogDescription>{deleting?.name}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try { await deleteMut.mutateAsync(deleting.id); toast.success("Deleted"); setDeleting(null); }
                catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
              }}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FormDialog({ open, onOpenChange, title, initial, onSubmit }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string;
  initial?: DType | null;
  onSubmit: (p: { name: string; code: string; is_active: boolean }) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [last, setLast] = useState(false);
  if (open !== last) {
    setLast(open);
    if (open) {
      setName(initial?.name ?? "");
      setCode(initial?.code ?? "");
      setActive(initial?.is_active ?? true);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Used as the Deduction Type dropdown on each employee deduction.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => { setName(e.target.value); if (!initial) setCode(slugify(e.target.value)); }} placeholder="e.g. Security Deposit" />
          </div>
          <div className="grid gap-2">
            <Label>Code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="security_deposit" />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div className="text-sm font-medium">Active</div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button disabled={saving || !name.trim() || !code.trim()} onClick={async () => {
            setSaving(true);
            const err = await onSubmit({ name: name.trim(), code: code.trim(), is_active: active });
            setSaving(false);
            if (err) toast.error(err); else onOpenChange(false);
          }}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
