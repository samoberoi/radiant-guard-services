import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Edit2, Lock, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { toast } from "sonner";
import { confirmAction } from "@/components/ConfirmProvider";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/roles-manager")({
  component: RolesManagerPage,
});

type Role = {
  key: string;
  name: string;
  description: string;
  is_system: boolean;
  sort_order: number;
};

const QK = ["admin", "roles", "manager"] as const;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function RolesManagerPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Role | null>(null);
  const [open, setOpen] = useState(false);

  const { data: roles = [], isLoading } = useQuery({
    queryKey: QK,
    queryFn: async (): Promise<Role[]> => {
      const { data, error } = await supabase
        .from("roles")
        .select("key,name,description,is_system,sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Role[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.key.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q),
    );
  }, [roles, search]);

  const saveMut = useMutation({
    mutationFn: async (payload: Role & { _isNew: boolean }) => {
      const row = {
        key: payload.key,
        name: payload.name.trim(),
        description: payload.description.trim(),
        sort_order: Number(payload.sort_order) || 0,
        is_system: payload.is_system,
      };
      if (payload._isNew) {
        const { error } = await supabase.from("roles").insert(row);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("roles")
          .update({
            name: row.name,
            description: row.description,
            sort_order: row.sort_order,
          })
          .eq("key", row.key);
        if (error) throw error;
      }
      void logActivity({
        module: "Roles Manager",
        action: payload._isNew ? "create" : "update",
        entityType: "role",
        entityId: row.key,
        entityLabel: row.name,
      });
    },
    onSuccess: () => {
      toast.success("Role saved");
      setOpen(false);
      setEditing(null);
      void qc.invalidateQueries({ queryKey: QK });
      void qc.invalidateQueries({ queryKey: ["rbac", "roles"] });
    },
    onError: (e) => toast.error("Save failed", { description: String((e as Error).message) }),
  });

  const deleteMut = useMutation({
    mutationFn: async (role: Role) => {
      const { error } = await supabase.from("roles").delete().eq("key", role.key);
      if (error) throw error;
      void logActivity({
        module: "Roles Manager",
        action: "delete",
        entityType: "role",
        entityId: role.key,
        entityLabel: role.name,
      });
    },
    onSuccess: () => {
      toast.success("Role deleted");
      void qc.invalidateQueries({ queryKey: QK });
      void qc.invalidateQueries({ queryKey: ["rbac", "roles"] });
    },
    onError: (e) => toast.error("Delete failed", { description: String((e as Error).message) }),
  });

  const handleNew = () => {
    setEditing({ key: "", name: "", description: "", is_system: false, sort_order: (roles.at(-1)?.sort_order ?? 0) + 10 });
    setOpen(true);
  };

  const handleEdit = (r: Role) => {
    setEditing({ ...r });
    setOpen(true);
  };

  const handleDelete = async (r: Role) => {
    if (r.is_system) {
      toast.error("System role cannot be deleted");
      return;
    }
    const ok = await confirmAction({
      title: `Delete role "${r.name}"?`,
      description: "This will also clear all RBAC permissions assigned to this role. Employees on this role will lose access.",
      confirmText: "Delete",
      destructive: true,
    });
    if (ok) deleteMut.mutate(r);
  };

  return (
    <div>
      <PageHeader
        title="Roles Manager"
        description="Create, rename or remove roles. RBAC permissions and the role chips in Access Control update automatically."
        crumbs={[
          { label: "Control Center", to: "/admin/control-center" },
          { label: "Roles Manager" },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search roles…" className="pl-9" />
        </div>
        <Button onClick={handleNew} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="mr-1.5 h-4 w-4" /> New Role
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_100px_120px] gap-3 border-b border-border bg-secondary/40 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <div>Role</div>
          <div>Description</div>
          <div className="text-center">Sort Order</div>
          <div className="text-right">Actions</div>
        </div>
        <div className="divide-y divide-border">
          {isLoading ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">No roles found.</div>
          ) : (
            filtered.map((r) => (
              <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_100px_120px] items-center gap-3 px-4 py-3 hover:bg-secondary/30">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    {r.is_system ? <Lock className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-foreground">{r.name}</div>
                    <div className="truncate font-mono text-[11px] text-muted-foreground">{r.key}</div>
                  </div>
                </div>
                <div className="truncate text-sm text-muted-foreground">{r.description || "—"}</div>
                <div className="text-center text-sm tabular-nums text-foreground">{r.sort_order}</div>
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => handleEdit(r)} title="Edit">
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(r)}
                    disabled={r.is_system}
                    title={r.is_system ? "System role" : "Delete"}
                    className="text-rose-500 hover:text-rose-600 disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing && roles.some((x) => x.key === editing.key) ? "Edit Role" : "New Role"}</DialogTitle>
            <DialogDescription>Roles drive RBAC. Keys must be lowercase and stable; the display name can change freely.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label>Role name</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    const isNew = !roles.some((x) => x.key === editing.key);
                    setEditing({ ...editing, name, key: isNew ? slugify(name) : editing.key });
                  }}
                  placeholder="e.g. Regional Manager"
                />
              </div>
              <div>
                <Label>Role key</Label>
                <Input
                  value={editing.key}
                  onChange={(e) => setEditing({ ...editing, key: slugify(e.target.value) })}
                  disabled={roles.some((x) => x.key === editing.key)}
                  className="font-mono"
                  placeholder="regional_manager"
                />
                <p className="mt-1 text-xs text-muted-foreground">Used internally; cannot be changed after creation.</p>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div>
                <Label>Sort order</Label>
                <Input
                  type="number"
                  value={editing.sort_order}
                  onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!editing) return;
                if (!editing.key || !editing.name.trim()) {
                  toast.error("Name and key are required");
                  return;
                }
                const isNew = !roles.some((x) => x.key === editing.key);
                saveMut.mutate({ ...editing, _isNew: isNew });
              }}
              disabled={saveMut.isPending}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {saveMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
