import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Edit2, Link2, MapPin, Plus, Search, Trash2 } from "lucide-react";
import { downloadCsv } from "@/lib/csv-export";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/badge";
import { useBranches, useStates, type State } from "@/lib/admin-data";

export const Route = createFileRoute("/admin/customers/state-manager")({
  component: StateManagerPage,
});

function StateManagerPage() {
  const { states, addState, updateState, deleteState } = useStates();
  const { branches } = useBranches();

  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<State | null>(null);
  const [deleting, setDeleting] = useState<State | null>(null);

  const mappedStateIds = useMemo(
    () => new Set(branches.map((b) => b.stateId)),
    [branches],
  );

  const filtered = useMemo(() => {
    const sorted = [...states].sort((a, b) => a.name.localeCompare(b.name));
    if (!query.trim()) return sorted;
    const q = query.trim().toLowerCase();
    return sorted.filter((s) => s.name.toLowerCase().includes(q));
  }, [states, query]);

  const mappedCount = states.filter((s) => mappedStateIds.has(s.id)).length;

  return (
    <div>
      <PageHeader
        title="State Manager"
        description="All states served by Radiant Guard. Used as the source of truth for branch mappings."
        crumbs={[
          { label: "Customers", to: "/admin/customers" },
          { label: "State Manager" },
        ]}
      />

      {/* Stats */}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Total states" value={states.length} icon={MapPin} />
        <StatCard label="Mapped to branches" value={mappedCount} icon={Link2} />
        <StatCard
          label="Available"
          value={states.length - mappedCount}
          icon={Plus}
          accent
        />
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search states…"
            className="h-10 rounded-lg pl-9"
          />
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add state
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">#</th>
                <th className="px-5 py-3">State</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((s, i) => {
                const mapped = mappedStateIds.has(s.id);
                return (
                  <tr key={s.id} className="hover:bg-secondary/30">
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                      {i + 1}
                    </td>
                    <td className="px-5 py-3 font-medium text-foreground">
                      {s.name}
                    </td>
                    <td className="px-5 py-3">
                      {mapped ? (
                        <Badge className="rounded-full bg-accent/15 font-semibold text-accent hover:bg-accent/20">
                          Mapped
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="rounded-full border-border font-semibold text-muted-foreground"
                        >
                          Available
                        </Badge>
                      )}
                    </td>
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
                          disabled={mapped}
                          title={mapped ? "Unmap branch first" : "Delete"}
                          aria-label="Delete"
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
                  <td colSpan={4} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    No states found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <StateFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add state"
        onSubmit={async (name) => {
          const r = await addState(name);
          if (!r.ok) return r.error;
          toast.success("State added");
          return null;
        }}
      />

      <StateFormDialog
        open={!!editing}
        initial={editing?.name}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Edit state"
        onSubmit={async (name) => {
          if (!editing) return null;
          const r = await updateState(editing.id, name);
          if (!r.ok) return r.error;
          toast.success("State updated");
          setEditing(null);
          return null;
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete state?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <span className="font-semibold text-foreground">{deleting?.name}</span> from the list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await deleteState(deleting.id);
                  toast.success("State deleted");
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

function StateFormDialog({
  open,
  onOpenChange,
  title,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  initial?: string;
  onSubmit: (name: string) => Promise<string | null> | string | null;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset when dialog opens
  useMemo(() => {
    if (open) {
      setName(initial ?? "");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            States feed the branch mapping dropdown — each state can be mapped to one branch.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const err = await onSubmit(name);
            if (err) setError(err);
            else {
              setName("");
              if (!initial) onOpenChange(false);
            }
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="state-name">State name</Label>
            <Input
              id="state-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="e.g. Maharashtra"
              autoFocus
            />
            {error && <p className="text-xs font-medium text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
