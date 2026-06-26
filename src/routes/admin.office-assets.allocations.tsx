import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { UserCheck, Plus, Search, Undo2, Download } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { confirmAction } from "@/components/ConfirmProvider";
import { downloadCsv } from "@/lib/csv-export";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/office-assets/allocations")({
  component: AllocationsPage,
});

const MODULE = "Office Assets";

type Unit = { id: string; asset_id: string; tag: string; branch_id: string | null; status: string };
type Asset = { id: string; name: string; unit_cost: number };
type Branch = { id: string; name: string };
type Candidate = { id: string; full_name: string; employee_code: string | null; designation: string | null; non_billable: boolean; unit_id: string | null; mobile: string };
type Unit2 = { id: string; name: string; branch_id: string | null };
type Alloc = { id: string; unit_id: string; candidate_id: string; branch_id: string | null; allocated_at: string; returned_at: string | null; condition_out: string; condition_in: string; notes: string };

function AllocationsPage() {
  const qc = useQueryClient();

  const { data: assets = [] } = useQuery({ queryKey: ["oa-assets-alloc"], queryFn: async () => {
    const { data, error } = await supabase.from("office_assets" as never).select("id,name,unit_cost");
    if (error) throw error; return data as unknown as Asset[];
  }});
  const { data: allUnits = [] } = useQuery({ queryKey: ["oa-units-alloc"], queryFn: async () => {
    const { data, error } = await supabase.from("office_asset_units" as never).select("id,asset_id,tag,branch_id,status");
    if (error) throw error; return data as unknown as Unit[];
  }});
  const { data: branches = [] } = useQuery({ queryKey: ["branches-alloc"], queryFn: async () => {
    const { data, error } = await supabase.from("branches" as never).select("id,name").order("name");
    if (error) throw error; return data as unknown as Branch[];
  }});
  const { data: candidates = [] } = useQuery({ queryKey: ["candidates-nonbillable"], queryFn: async () => {
    const { data, error } = await supabase.from("candidates" as never)
      .select("id,full_name,employee_code,designation_id,non_billable,unit_id,mobile,status,designations:designation_id(name)")
      .eq("non_billable", true)
      .eq("status", "active")
      .order("full_name");
    if (error) throw error;
    type Row = { id: string; full_name: string; employee_code: string | null; designation_id: string | null; non_billable: boolean; unit_id: string | null; mobile: string; designations: { name: string } | null };
    return ((data as unknown as Row[]) ?? []).map((r) => ({
      id: r.id, full_name: r.full_name, employee_code: r.employee_code, designation: r.designations?.name ?? null,
      non_billable: r.non_billable, unit_id: r.unit_id, mobile: r.mobile,
    })) as Candidate[];
  }});
  const { data: orgUnits = [] } = useQuery({ queryKey: ["org-units-lite"], queryFn: async () => {
    const { data, error } = await supabase.from("units" as never).select("id,name,branch_id");
    if (error) throw error; return data as unknown as Unit2[];
  }});
  const { data: allocs = [] } = useQuery({ queryKey: ["oa-allocations"], queryFn: async () => {
    const { data, error } = await supabase.from("office_asset_allocations" as never).select("*").order("allocated_at", { ascending: false });
    if (error) throw error; return data as unknown as Alloc[];
  }});

  const assetById = (id: string) => assets.find((a) => a.id === id);
  const unitById = (id: string) => allUnits.find((u) => u.id === id);
  const branchById = (id: string | null) => branches.find((b) => b.id === id)?.name ?? "—";
  const candById = (id: string) => candidates.find((c) => c.id === id);
  const orgUnitOfCand = (c: Candidate | undefined) => c?.unit_id ? orgUnits.find((u) => u.id === c.unit_id) : undefined;

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ candidate_id: "", unit_id: "", condition_out: "good", notes: "" });

  const availableUnits = allUnits.filter((u) => u.status === "in_stock");

  const allocate = useMutation({
    mutationFn: async () => {
      if (!form.candidate_id || !form.unit_id) throw new Error("Pick a resource and a unit");
      const u = unitById(form.unit_id);
      const cand = candById(form.candidate_id);
      if (!u || !cand) throw new Error("Invalid selection");
      const branchId = u.branch_id ?? orgUnitOfCand(cand)?.branch_id ?? null;
      const { error: e1 } = await supabase.from("office_asset_allocations" as never).insert({
        unit_id: form.unit_id,
        candidate_id: form.candidate_id,
        branch_id: branchId,
        condition_out: form.condition_out,
        notes: form.notes,
      } as never);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("office_asset_units" as never).update({ status: "allocated" } as never).eq("id", form.unit_id);
      if (e2) throw e2;
      void logActivity({ module: MODULE, action: "create", entityType: "allocation", entityLabel: `${u.tag} → ${cand.full_name}` });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oa-allocations"] });
      qc.invalidateQueries({ queryKey: ["oa-units-alloc"] });
      qc.invalidateQueries({ queryKey: ["oa-units"] });
      toast.success("Allocated");
      setOpen(false);
      setForm({ candidate_id: "", unit_id: "", condition_out: "good", notes: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const returnUnit = useMutation({
    mutationFn: async ({ alloc, condition }: { alloc: Alloc; condition: string }) => {
      const { error: e1 } = await supabase.from("office_asset_allocations" as never).update({ returned_at: new Date().toISOString(), condition_in: condition } as never).eq("id", alloc.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("office_asset_units" as never).update({ status: "in_stock" } as never).eq("id", alloc.unit_id);
      if (e2) throw e2;
      const u = unitById(alloc.unit_id);
      void logActivity({ module: MODULE, action: "update", entityType: "allocation", entityId: alloc.id, entityLabel: `Returned ${u?.tag ?? alloc.unit_id}` });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oa-allocations"] });
      qc.invalidateQueries({ queryKey: ["oa-units-alloc"] });
      qc.invalidateQueries({ queryKey: ["oa-units"] });
      toast.success("Returned to stock");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [tab, setTab] = useState<"active" | "history">("active");
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const base = tab === "active" ? allocs.filter((a) => !a.returned_at) : allocs.filter((a) => a.returned_at);
    const s = q.trim().toLowerCase();
    if (!s) return base;
    return base.filter((a) => {
      const u = unitById(a.unit_id);
      const c = candById(a.candidate_id);
      const asset = u ? assetById(u.asset_id) : undefined;
      return [u?.tag, asset?.name, c?.full_name, c?.employee_code, branchById(a.branch_id)].join(" ").toLowerCase().includes(s);
    });
  }, [allocs, tab, q, allUnits, assets, candidates, branches]);

  function exportCsv() {
    downloadCsv("office-asset-allocations.csv", list.map((a) => {
      const u = unitById(a.unit_id);
      const c = candById(a.candidate_id);
      const asset = u ? assetById(u.asset_id) : undefined;
      return {
        Tag: u?.tag ?? "",
        Asset: asset?.name ?? "",
        Resource: c?.full_name ?? "",
        "Employee #": c?.employee_code ?? "",
        Designation: c?.designation ?? "",
        Branch: branchById(a.branch_id),
        "Allocated At": a.allocated_at,
        "Returned At": a.returned_at ?? "",
        "Condition Out": a.condition_out,
        "Condition In": a.condition_in,
        Notes: a.notes,
      };
    }));
  }

  return (
    <div>
      <PageHeader
        title="Office Asset Allocations"
        description="Assign physical units to non-billable resources. Reflects on their profile automatically."
        crumbs={[{ label: "Office Assets", to: "/admin/office-assets" }, { label: "Allocations" }]}
        icon={UserCheck}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>
            <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New Allocation</Button>
          </div>
        }
      />

      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tag, asset, resource, branch…" className="pl-9" />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
          <button onClick={() => setTab("active")} className={`rounded-md px-3 py-1 text-xs font-medium ${tab === "active" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Active ({allocs.filter((a) => !a.returned_at).length})</button>
          <button onClick={() => setTab("history")} className={`rounded-md px-3 py-1 text-xs font-medium ${tab === "history" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Returned ({allocs.filter((a) => a.returned_at).length})</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Tag</th>
                <th className="px-5 py-3">Asset</th>
                <th className="px-5 py-3">Resource</th>
                <th className="px-5 py-3">Designation</th>
                <th className="px-5 py-3">Branch</th>
                <th className="px-5 py-3">Allocated</th>
                {tab === "history" && <th className="px-5 py-3">Returned</th>}
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.length === 0 && <tr><td colSpan={tab === "history" ? 8 : 7} className="px-5 py-10 text-center text-muted-foreground">Nothing here yet.</td></tr>}
              {list.map((a) => {
                const u = unitById(a.unit_id);
                const c = candById(a.candidate_id);
                const asset = u ? assetById(u.asset_id) : undefined;
                return (
                  <tr key={a.id} className="hover:bg-muted/30">
                    <td className="px-5 py-3 font-mono font-semibold">{u?.tag ?? "—"}</td>
                    <td className="px-5 py-3">{asset?.name ?? "—"}</td>
                    <td className="px-5 py-3 font-medium">{c?.full_name ?? "—"}<div className="text-xs text-muted-foreground">{c?.employee_code ?? ""}</div></td>
                    <td className="px-5 py-3 text-muted-foreground">{c?.designation ?? "—"}</td>
                    <td className="px-5 py-3">{branchById(a.branch_id)}</td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">{new Date(a.allocated_at).toLocaleDateString("en-IN")}</td>
                    {tab === "history" && <td className="px-5 py-3 text-xs text-muted-foreground">{a.returned_at ? new Date(a.returned_at).toLocaleDateString("en-IN") : "—"}</td>}
                    <td className="px-5 py-3 text-right">
                      {!a.returned_at && (
                        <Button variant="ghost" size="sm" onClick={async () => {
                          const ok = await confirmAction({ title: "Return to stock?", description: `${asset?.name ?? ""} (${u?.tag}) will be marked available.`, confirmText: "Return" });
                          if (ok) returnUnit.mutate({ alloc: a, condition: "good" });
                        }}><Undo2 className="mr-1 h-4 w-4" /> Return</Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Allocate dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>New Allocation</DialogTitle><DialogDescription>Assign an in-stock unit to a non-billable resource.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resource (Non-Billable) *</Label>
              <Select value={form.candidate_id} onValueChange={(v) => setForm({ ...form, candidate_id: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={candidates.length ? "Select resource" : "No non-billable resources yet"} /></SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}{c.designation ? ` · ${c.designation}` : ""}{c.employee_code ? ` · ${c.employee_code}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.candidate_id && (() => {
                const c = candById(form.candidate_id);
                const ou = orgUnitOfCand(c);
                return (
                  <div className="mt-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs">
                    <span className="font-semibold">Designation:</span> {c?.designation ?? "—"} · <span className="font-semibold">Unit:</span> {ou?.name ?? "—"} · <span className="font-semibold">Branch:</span> {branchById(ou?.branch_id ?? null)}
                  </div>
                );
              })()}
            </div>
            <div>
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Unit *</Label>
              <Select value={form.unit_id} onValueChange={(v) => setForm({ ...form, unit_id: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select in-stock unit" /></SelectTrigger>
                <SelectContent>
                  {availableUnits.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No in-stock units. Add some in Inventory.</div>}
                  {availableUnits.map((u) => {
                    const a = assetById(u.asset_id);
                    return <SelectItem key={u.id} value={u.id}>{u.tag} · {a?.name ?? ""} · {branchById(u.branch_id)}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Condition Handed Over</Label>
              <Select value={form.condition_out} onValueChange={(v) => setForm({ ...form, condition_out: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="fair">Fair</SelectItem>
                  <SelectItem value="poor">Poor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => allocate.mutate()} disabled={allocate.isPending}>Allocate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
