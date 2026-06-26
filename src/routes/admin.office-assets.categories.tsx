import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Tag, Plus, Edit2, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { confirmAction } from "@/components/ConfirmProvider";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/office-assets/categories")({
  component: CategoriesPage,
});

type Cat = { id: string; name: string; description: string; enabled: boolean };
const MODULE = "Office Assets";
const empty = { name: "", description: "", enabled: true };

function CategoriesPage() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: ["oa-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("office_asset_categories" as never).select("*").order("name");
      if (error) throw error;
      return data as unknown as Cat[];
    },
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cat | null>(null);
  const [form, setForm] = useState(empty);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Name is required");
      if (editing) {
        const { error } = await supabase.from("office_asset_categories" as never).update(form as never).eq("id", editing.id);
        if (error) throw error;
        void logActivity({ module: MODULE, action: "update", entityType: "category", entityId: editing.id, entityLabel: form.name });
      } else {
        const { error } = await supabase.from("office_asset_categories" as never).insert(form as never);
        if (error) throw error;
        void logActivity({ module: MODULE, action: "create", entityType: "category", entityLabel: form.name });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["oa-categories"] }); toast.success("Saved"); setOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (c: Cat) => {
      const { error } = await supabase.from("office_asset_categories" as never).delete().eq("id", c.id);
      if (error) throw error;
      void logActivity({ module: MODULE, action: "delete", entityType: "category", entityId: c.id, entityLabel: c.name });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["oa-categories"] }); toast.success("Deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Office Asset Categories"
        description="Group assets into categories: IT, Furniture, Electrical, etc."
        crumbs={[{ label: "Office Assets", to: "/admin/office-assets" }, { label: "Categories" }]}
        icon={Tag}
        actions={<Button size="sm" onClick={() => { setEditing(null); setForm(empty); setOpen(true); }}><Plus className="h-4 w-4" /> Add Category</Button>}
      />
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-5 py-3">Name</th><th className="px-5 py-3">Description</th><th className="px-5 py-3">Status</th><th></th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.length === 0 && <tr><td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">No categories yet.</td></tr>}
            {items.map((c) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="px-5 py-3 font-medium">{c.name}</td>
                <td className="px-5 py-3 text-muted-foreground">{c.description || "—"}</td>
                <td className="px-5 py-3">{c.enabled ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700">Active</span> : <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Disabled</span>}</td>
                <td className="px-5 py-3 text-right">
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(c); setForm({ name: c.name, description: c.description, enabled: c.enabled }); setOpen(true); }}><Edit2 className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={async () => { if (await confirmAction({ title: "Delete category?", description: `"${c.name}" will be removed.`, destructive: true, confirmText: "Delete" })) del.mutate(c); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Category" : "Add Category"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} /><Label>Enabled</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
