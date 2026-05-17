import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Building2, Download, Edit2, Plus, Search, Trash2 } from "lucide-react";
import { downloadCsv } from "@/lib/csv-export";
import { toast } from "sonner";
import { confirmAction } from "@/components/ConfirmProvider";
import { logActivity } from "@/lib/activity-log";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useBranches, useStates, type Branch } from "@/lib/admin-data";

export const Route = createFileRoute("/admin/customers/branch-manager")({
  component: BranchManagerPage,
});

function BranchManagerPage() {
  const { states } = useStates();
  const { branches, addBranch, updateBranch, deleteBranch } = useBranches();

  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [deleting, setDeleting] = useState<Branch | null>(null);

  const stateById = useMemo(
    () => new Map(states.map((s) => [s.id, s])),
    [states],
  );

  const mappedStateIds = useMemo(
    () => new Set(branches.map((b) => b.stateId)),
    [branches],
  );

  const rows = useMemo(() => {
    const list = branches
      .map((b) => ({ ...b, stateName: stateById.get(b.stateId)?.name ?? "—" }))
      .sort((a, b) => {
        // Natural sort by code (BR1, BR2, BR10, ...)
        const na = parseInt(a.code.replace(/\D/g, ""), 10) || 0;
        const nb = parseInt(b.code.replace(/\D/g, ""), 10) || 0;
        return na - nb;
      });
    if (!query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter(
      (b) =>
        b.code.toLowerCase().includes(q) ||
        b.stateName.toLowerCase().includes(q) ||
        b.name.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q),
    );
  }, [branches, stateById, query]);

  const availableStates = useMemo(
    () =>
      states
        .filter((s) => !mappedStateIds.has(s.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [states, mappedStateIds],
  );

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(b: Branch) {
    setEditing(b);
    setFormOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Branch Manager"
        description="Map a unique branch code to each state. Branches display as CODE – STATE."
        crumbs={[
          { label: "Organizations", to: "/admin/customers" },
          { label: "Branch Manager" },
        ]}
      />

      {/* Stats */}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Total branches" value={branches.length} />
        <StatCard label="States mapped" value={mappedStateIds.size} />
        <StatCard label="States available" value={availableStates.length} accent />
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by code, state, description…"
            className="h-10 rounded-lg pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() =>
              downloadCsv(
                "branches",
                rows.map((b) => ({
                  branchCode: b.code,
                  branchName: b.name || b.stateName,
                  state: b.stateName,
                  branchDisplay: `${b.code} – ${b.stateName}`,
                  description: b.description,
                })),
                [
                  { key: "branchCode", header: "Branch code" },
                  { key: "branchName", header: "Branch name" },
                  { key: "state", header: "State" },
                  { key: "branchDisplay", header: "Branch display" },
                  { key: "description", header: "Description" },
                ],
              )
            }
            disabled={rows.length === 0}
            className="h-10 rounded-lg"
          >
            <Download className="mr-1.5 h-4 w-4" />
            Export
          </Button>
          <Button
            onClick={openAdd}
            disabled={availableStates.length === 0}
            className="h-10 rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
            title={availableStates.length === 0 ? "All states are already mapped" : ""}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add branch
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Code</th>
                <th className="px-5 py-3">Branch (Code – State)</th>
                <th className="px-5 py-3">State</th>
                <th className="px-5 py-3">Description</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((b) => (
                <tr key={b.id} className="hover:bg-secondary/30">
                  <td className="px-5 py-3 font-mono text-xs font-semibold text-foreground">
                    {b.code}
                  </td>
                  <td className="px-5 py-3 font-semibold text-foreground">
                    <span className="font-mono text-accent">{b.code}</span>
                    <span className="mx-2 text-muted-foreground">–</span>
                    <span>{b.stateName}</span>
                  </td>
                  <td className="px-5 py-3 text-foreground">{b.stateName}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {b.description || <span className="italic opacity-60">—</span>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(b)}
                        aria-label="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleting(b)}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center text-sm text-muted-foreground"
                  >
                    <Building2 className="mx-auto mb-2 h-6 w-6 opacity-50" />
                    {branches.length === 0
                      ? "No branches yet. Add your first branch to get started."
                      : "No branches match your search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <BranchFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        availableStates={availableStates}
        allStates={states}
        onSubmit={async (data) => {
          if (!(await confirmAction({ title: "Save changes?", description: "Do you want to save these changes?", confirmText: "Save" }))) return null;
          const r = editing
            ? await updateBranch(editing.id, data)
            : await addBranch(data);
          if (!r.ok) return r.error;
          toast.success(editing ? "Branch updated" : "Branch added");
          void logActivity({ module: "Branch Manager", action: editing ? "update" : "create", entityType: "branches", entityId: editing?.id, entityLabel: String(data.code ?? data.name ?? ""), details: data as Record<string, unknown> });
          return null;
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete branch?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove{" "}
              <span className="font-mono font-semibold text-foreground">
                {deleting?.code}
              </span>{" "}
              and free up its state mapping.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try {
                  const _delId = deleting.id;
                  const _delLabel = String((deleting as Record<string, unknown>).name ?? (deleting as Record<string, unknown>).code ?? _delId);
                  await deleteBranch(_delId);
                  void logActivity({ module: "Branch Manager", action: "delete", entityType: "branches", entityId: _delId, entityLabel: _delLabel });
                  toast.success("Branch deleted");
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
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </div>
      <div
        className={
          "mt-2 font-display text-3xl font-bold " +
          (accent ? "text-accent" : "text-foreground")
        }
      >
        {value}
      </div>
    </div>
  );
}

function nextSuggestedCode(branches: { code: string }[]) {
  const nums = branches
    .map((b) => parseInt(b.code.replace(/\D/g, ""), 10))
    .filter((n) => Number.isFinite(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `BR${max + 1}`;
}

function BranchFormDialog({
  open,
  onOpenChange,
  editing,
  availableStates,
  allStates,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Branch | null;
  availableStates: { id: string; name: string }[];
  allStates: { id: string; name: string }[];
  onSubmit: (data: Omit<Branch, "id">) => Promise<string | null> | string | null;
}) {
  const { branches } = useBranches();

  const [code, setCode] = useState("");
  const [stateId, setStateId] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  // When editing, the branch's own state must remain selectable.
  const stateOptions = useMemo(() => {
    const opts = [...availableStates];
    if (editing) {
      const own = allStates.find((s) => s.id === editing.stateId);
      if (own && !opts.some((s) => s.id === own.id)) {
        opts.push(own);
        opts.sort((a, b) => a.name.localeCompare(b.name));
      }
    }
    return opts;
  }, [availableStates, allStates, editing]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setCode(editing.code);
      setStateId(editing.stateId);
      setDescription(editing.description);
    } else {
      setCode(nextSuggestedCode(branches));
      setStateId("");
      setDescription("");
    }
    setError(null);
  }, [open, editing, branches]);

  const selectedState = allStates.find((s) => s.id === stateId);
  const previewName = selectedState
    ? `${code || "BR?"} – ${selectedState.name}`
    : "Pick a state to preview";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit branch" : "Add branch"}</DialogTitle>
          <DialogDescription>
            One branch per state. The dropdown only lists states that aren't already mapped.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!(await confirmAction({ title: "Save changes?", description: "Do you want to save these changes?", confirmText: "Save" }))) return null;
            const err = await onSubmit({
              code,
              name: selectedState?.name ?? "",
              description,
              stateId,
            });
            if (err) setError(err);
            else onOpenChange(false);
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="branch-code">Branch code</Label>
              <Input
                id="branch-code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setError(null);
                }}
                placeholder="BR22"
                autoFocus
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-state">State</Label>
              <Select
                value={stateId}
                onValueChange={(v) => {
                  setStateId(v);
                  setError(null);
                }}
              >
                <SelectTrigger id="branch-state">
                  <SelectValue placeholder="Select a state" />
                </SelectTrigger>
                <SelectContent>
                  {stateOptions.length === 0 ? (
                    <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                      All states are already mapped.
                    </div>
                  ) : (
                    stateOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="branch-desc">Description</Label>
            <Textarea
              id="branch-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notes about this branch (optional)"
              rows={3}
            />
          </div>

          <div className="rounded-xl border border-dashed border-border bg-secondary/40 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Preview
            </div>
            <div className="mt-1 font-display text-base font-bold text-foreground">
              {previewName}
            </div>
          </div>

          {error && <p className="text-xs font-medium text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {editing ? "Save changes" : "Create branch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
