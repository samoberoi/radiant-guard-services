import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { logInv } from "@/lib/inv-helpers";
import { downloadCsv } from "@/lib/csv-export";

export const Route = createFileRoute("/admin/inventory/payroll-recoveries")({
  component: PayrollRecoveriesPage,
});

type Rec = {
  id: string;
  writeoff_id: string | null;
  candidate_id: string;
  amount: number;
  status: string;
  payroll_period: string;
  notes: string;
  created_at: string;
};

type Cand = { id: string; full_name: string; employee_code: string };
type WO = { id: string; writeoff_number: string };

function PayrollRecoveriesPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("pending");
  const [search, setSearch] = useState("");

  const recsQ = useQuery({
    queryKey: ["inv-payrec", status],
    queryFn: async () => {
      let q = supabase.from("inv_payroll_recoveries" as never).select("*").order("created_at", { ascending: false });
      if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as Rec[]) ?? [];
    },
  });
  const candsQ = useQuery({
    queryKey: ["inv-payrec", "cands"],
    queryFn: async () => {
      const { data, error } = await supabase.from("candidates").select("id,full_name,employee_code");
      if (error) throw error;
      return (data as unknown as Cand[]) ?? [];
    },
  });
  const wosQ = useQuery({
    queryKey: ["inv-payrec", "wos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inv_write_offs" as never).select("id,writeoff_number");
      if (error) throw error;
      return (data as unknown as WO[]) ?? [];
    },
  });

  const candMap = useMemo(() => new Map((candsQ.data ?? []).map((c) => [c.id, c])), [candsQ.data]);
  const woMap = useMemo(() => new Map((wosQ.data ?? []).map((w) => [w.id, w])), [wosQ.data]);

  const rows = (recsQ.data ?? []).filter((r) => {
    if (!search) return true;
    const c = candMap.get(r.candidate_id);
    return (c?.full_name + " " + c?.employee_code).toLowerCase().includes(search.toLowerCase());
  });

  const setStatusMut = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: string }) => {
      const patch: Record<string, unknown> = { status: newStatus };
      if (newStatus === "posted") {
        const { data: auth } = await supabase.auth.getUser();
        patch.posted_at = new Date().toISOString();
        patch.posted_by = auth?.user?.id ?? null;
      }
      const { error } = await supabase.from("inv_payroll_recoveries" as never).update(patch as never).eq("id", id);
      if (error) throw error;
      return { id, newStatus };
    },
    onSuccess: ({ id, newStatus }) => {
      logInv("Payroll Recoveries", newStatus === "posted" ? "post" : "void", "inv_payroll_recoveries", id, `Recovery ${newStatus}`);
      qc.invalidateQueries({ queryKey: ["inv-payrec"] });
      toast.success(`Marked ${newStatus}`);
    },
  });

  const exportCsv = () => {
    const out = rows.map((r) => ({
      created_at: r.created_at,
      employee: candMap.get(r.candidate_id)?.employee_code ?? r.candidate_id,
      employee_name: candMap.get(r.candidate_id)?.full_name ?? "",
      writeoff: woMap.get(r.writeoff_id ?? "")?.writeoff_number ?? "",
      amount: r.amount,
      status: r.status,
      payroll_period: r.payroll_period,
      notes: r.notes,
    }));
    downloadCsv("payroll-recoveries.csv", out);
  };

  return (
    <div>
      <PageHeader
        title="Payroll Recoveries"
        description="Salary deductions queued from inventory write-offs."
        crumbs={[{ label: "Inventory", to: "/admin/inventory" }, { label: "Payroll Recoveries" }]}
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-medium">Status</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="posted">Posted</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Input placeholder="Search employee…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <div className="ml-auto"><Button variant="outline" onClick={exportCsv}>Export CSV</Button></div>
      </div>

      <div className="overflow-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-3 text-left font-medium">Date</th>
              <th className="p-3 text-left font-medium">Employee</th>
              <th className="p-3 text-left font-medium">Write-off</th>
              <th className="p-3 text-right font-medium">Amount</th>
              <th className="p-3 text-left font-medium">Period</th>
              <th className="p-3 text-left font-medium">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No recoveries.</td></tr>
            ) : rows.map((r) => {
              const c = candMap.get(r.candidate_id);
              const wo = woMap.get(r.writeoff_id ?? "");
              return (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="p-3 text-muted-foreground tabular-nums">{new Date(r.created_at).toLocaleDateString("en-IN")}</td>
                  <td className="p-3">{c ? `${c.employee_code} — ${c.full_name}` : r.candidate_id.slice(0, 8)}</td>
                  <td className="p-3 text-muted-foreground">{wo?.writeoff_number ?? "—"}</td>
                  <td className="p-3 text-right tabular-nums font-semibold">₹{Number(r.amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</td>
                  <td className="p-3">{r.payroll_period || "—"}</td>
                  <td className="p-3">
                    <span className={`rounded px-2 py-0.5 text-xs ${r.status === "posted" ? "bg-emerald-500/15 text-emerald-700" : r.status === "cancelled" ? "bg-rose-500/15 text-rose-700" : "bg-amber-500/15 text-amber-700"}`}>{r.status}</span>
                  </td>
                  <td className="p-3 text-right">
                    {r.status === "pending" && (
                      <>
                        <Button size="sm" variant="ghost" className="text-emerald-600" onClick={() => setStatusMut.mutate({ id: r.id, newStatus: "posted" })}><CheckCircle2 className="mr-1 h-4 w-4" />Post</Button>
                        <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setStatusMut.mutate({ id: r.id, newStatus: "cancelled" })}><XCircle className="mr-1 h-4 w-4" />Cancel</Button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
