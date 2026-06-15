import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Download, CheckCircle2, XCircle, Send, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentPermissions } from "@/lib/rbac";
import { logActivity } from "@/lib/activity-log";
import {
  computeAttendanceTotals,
  computeWages,
  fmtINR,
  type AttendanceCodeLike,
  type AttendanceEntryLike,
  type ContractResourceLike,
} from "@/lib/payroll-calc";

const searchSchema = z.object({
  start: z.string(),
  end: z.string(),
  candidate: z.string().optional(),
});

export const Route = createFileRoute("/admin/payroll/$unitId")({
  validateSearch: (s) => searchSchema.parse(s),
  component: PayrollUnitPage,
});

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function fmtPretty(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MONTH_NAMES[m - 1].slice(0, 3)} ${y}`;
}

function buildDates(start: string, end: string): string[] {
  const out: string[] = [];
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  const cursor = new Date(ys, ms - 1, ds);
  const stop = new Date(ye, me - 1, de);
  while (cursor <= stop) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function PayrollUnitPage() {
  const { unitId } = Route.useParams();
  const { start, end, candidate: highlightCandidate } = Route.useSearch();

  const periodDates = useMemo(() => buildDates(start, end), [start, end]);

  const { data: unit } = useQuery({
    queryKey: ["payroll-unit", unitId],
    queryFn: async () => {
      const { data } = await supabase
        .from("units")
        .select("id, code, name, customer_id")
        .eq("id", unitId)
        .maybeSingle();
      if (!data) return null;
      const { data: cust } = await supabase
        .from("customers")
        .select("name")
        .eq("id", data.customer_id ?? "")
        .maybeSingle();
      return { ...data, customer_name: cust?.name ?? "" };
    },
  });

  const { data: sheet } = useQuery({
    queryKey: ["payroll-sheet", unitId, start, end],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_sheets" as never)
        .select("status, approved_at")
        .eq("unit_id", unitId)
        .eq("period_start", start)
        .eq("period_end", end)
        .maybeSingle();
      return data as unknown as { status: string; approved_at: string | null } | null;
    },
  });

  const queryClient = useQueryClient();
  const { can } = useCurrentPermissions();
  const canApprove = can("payroll", "approve");

  type RunStatus = "draft" | "submitted" | "approved" | "rejected";
  type RunRow = { id: string; status: RunStatus; rejection_reason: string | null };
  const runQK = ["payroll-run", unitId, start, end];
  const { data: run } = useQuery({
    queryKey: runQK,
    queryFn: async (): Promise<RunRow | null> => {
      const { data, error } = await supabase
        .from("payroll_runs" as never)
        .select("id, status, rejection_reason")
        .eq("unit_id", unitId)
        .eq("period_start", start)
        .eq("period_end", end)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as RunRow | null);
    },
  });
  const runStatus: RunStatus = run?.status ?? "draft";

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const transitionRun = useMutation({
    mutationFn: async (next: { status: RunStatus; reason?: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      const ts = new Date().toISOString();
      const base: Record<string, unknown> = {
        unit_id: unitId,
        period_start: start,
        period_end: end,
        status: next.status,
      };
      if (next.status === "submitted") { base.submitted_at = ts; base.submitted_by = uid; }
      if (next.status === "approved") { base.approved_at = ts; base.approved_by = uid; }
      if (next.status === "rejected") {
        base.rejected_at = ts; base.rejected_by = uid;
        base.rejection_reason = next.reason ?? "";
      }
      if (next.status === "draft") { base.rejection_reason = null; }
      if (run?.id) {
        const { error } = await supabase.from("payroll_runs" as never).update(base as never).eq("id", run.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payroll_runs" as never).insert(base as never);
        if (error) throw error;
      }
      void logActivity({
        module: "Payroll",
        action: next.status === "submitted" ? "submit" : next.status === "approved" ? "approve" : next.status === "rejected" ? "reject" : "reopen",
        entityType: "payroll_runs",
        entityLabel: `${unitId} ${start} → ${end}`,
        details: { unit_id: unitId, period_start: start, period_end: end, status: next.status, reason: next.reason ?? "" },
      });
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: runQK });
      toast.success(
        vars.status === "submitted" ? "Payroll submitted for approval" :
        vars.status === "approved" ? "Payroll approved" :
        vars.status === "rejected" ? "Payroll rejected" : "Payroll reopened",
      );
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["payroll-compute", unitId, start, end],
    queryFn: async () => {
      // 1. Roster: candidates mapped to this unit (primary + secondary).
      const candidateCols =
        "id, employee_code, full_name, designation_id, bank_account_holder, bank_account_number, bank_ifsc, bank_name, bank_branch, approved_at, preferred_joining_date, application_date, pan_number";
      const [{ data: primary }, { data: links }] = await Promise.all([
        supabase
          .from("candidates")
          .select(candidateCols)
          .eq("unit_id", unitId)
          .eq("is_enabled", true)
          .eq("status", "active"),
        supabase.from("candidate_units").select("candidate_id").eq("unit_id", unitId),
      ]);
      const linkIds = (links ?? []).map((l) => l.candidate_id);
      let secondary: typeof primary = [];
      if (linkIds.length > 0) {
        const { data } = await supabase
          .from("candidates")
          .select(candidateCols)
          .in("id", linkIds)
          .eq("is_enabled", true)
          .eq("status", "active");
        secondary = data ?? [];
      }
      const roster = Array.from(
        new Map([...(primary ?? []), ...(secondary ?? [])].map((c) => [c.id, c])).values(),
      );

      const designationIds = Array.from(
        new Set(roster.map((c) => c.designation_id).filter(Boolean)),
      ) as string[];
      const { data: designations } = await supabase
        .from("designations")
        .select("id, name")
        .in("id", designationIds.length ? designationIds : ["00000000-0000-0000-0000-000000000000"]);
      const desigMap = new Map((designations ?? []).map((d) => [d.id, d.name as string]));

      // 2. Attendance entries (now include designation_id)
      const { data: entriesRaw } = await supabase
        .from("attendance_entries")
        .select("candidate_id, designation_id, entry_date, code, ot_hours")
        .eq("unit_id", unitId)
        .gte("entry_date", start)
        .lte("entry_date", end);
      const entries = (entriesRaw ?? []) as Array<{
        candidate_id: string;
        designation_id: string | null;
        entry_date: string;
        code: string;
        ot_hours: number | string | null;
      }>;

      const { data: codes } = await supabase
        .from("attendance_codes")
        .select("code, counts_as_present, is_paid")
        .eq("enabled", true);

      // 3. Contract resources for this unit's active contract.
      const { data: contracts } = await supabase
        .from("client_contracts")
        .select("id, payroll_window_id")
        .eq("unit_id", unitId)
        .eq("record_type", "client")
        .eq("status", "active")
        .order("start_date", { ascending: false })
        .limit(1);
      const contractId = contracts?.[0]?.id;

      let resources: Record<string, unknown>[] = [];
      if (contractId) {
        const { data: r } = await supabase
          .from("contract_resources")
          .select(
            "designation_id, components, benefits, deductions, employer_contributions, payroll_day_base_id",
          )
          .eq("contract_id", contractId);
        resources = r ?? [];
      }

      // Make sure we know the names of any designation_ids referenced by entries
      // that weren't in the roster's primary designation list.
      const allDesigIds = new Set<string>(designationIds);
      for (const e of entries) if (e.designation_id) allDesigIds.add(e.designation_id);
      for (const r of resources) {
        const d = r.designation_id ? String(r.designation_id) : "";
        if (d) allDesigIds.add(d);
      }
      if (allDesigIds.size > 0) {
        const { data: extraDs } = await supabase
          .from("designations")
          .select("id, name")
          .in("id", Array.from(allDesigIds));
        for (const d of extraDs ?? []) desigMap.set(d.id, d.name as string);
      }

      const pdbIds = Array.from(
        new Set(resources.map((r) => r.payroll_day_base_id).filter(Boolean)),
      ) as string[];
      const { data: pdbs } = await supabase
        .from("payroll_day_bases")
        .select("id, method, fixed_days, weekly_off_day")
        .in("id", pdbIds.length ? pdbIds : ["00000000-0000-0000-0000-000000000000"]);
      type PdbMethod = "actual_days" | "fixed_days" | "actual_minus_weekly_off";
      const pdbMap = new Map<string, NonNullable<ContractResourceLike["payrollDayBase"]>>(
        (pdbs ?? []).map((p) => [
          p.id,
          {
            method: p.method as PdbMethod,
            fixedDays: p.fixed_days,
            weeklyOffDay: p.weekly_off_day,
          },
        ]),
      );

      const resourceByDesignation = new Map<string, ContractResourceLike>();
      for (const r of resources) {
        const did = String(r.designation_id ?? "");
        if (!did) continue;
        resourceByDesignation.set(did, {
          designationId: did,
          components: Array.isArray(r.components)
            ? (r.components as { name: string; amount: number }[]).map((c) => ({
                name: String(c.name ?? ""),
                amount: Number(c.amount) || 0,
              }))
            : [],
          benefits: Array.isArray(r.benefits) ? (r.benefits as { name: string; amount: number }[]) : [],
          deductions: Array.isArray(r.deductions) ? (r.deductions as { name: string; amount: number }[]) : [],
          employerContributions: Array.isArray(r.employer_contributions)
            ? (r.employer_contributions as { name: string; amount: number }[])
            : [],
          payrollDayBase: r.payroll_day_base_id
            ? pdbMap.get(String(r.payroll_day_base_id)) ?? null
            : null,
        });
      }

      // 4. Build line items per (candidate, designation_id).
      // Each candidate gets a primary line (their own designation) plus an extra
      // line for any other designation found in their attendance entries.
      const rosterById = new Map(roster.map((c) => [c.id, c]));
      const pairKey = (cid: string, did: string | null) => `${cid}|${did ?? "__none__"}`;
      const pairs = new Map<string, { candidateId: string; designationId: string | null }>();

      for (const c of roster) {
        const k = pairKey(c.id, c.designation_id ?? null);
        pairs.set(k, { candidateId: c.id, designationId: c.designation_id ?? null });
      }
      for (const e of entries) {
        if (!rosterById.has(e.candidate_id)) continue;
        const k = pairKey(e.candidate_id, e.designation_id);
        if (!pairs.has(k)) pairs.set(k, { candidateId: e.candidate_id, designationId: e.designation_id });
      }

      const rows = Array.from(pairs.values()).map((p) => {
        const c = rosterById.get(p.candidateId)!;
        const did = p.designationId ? String(p.designationId) : "";
        const designationName = (p.designationId && desigMap.get(p.designationId)) || "—";
        // Filter entries to just this (candidate, designation) pair so totals reflect only that line.
        const lineEntries = entries.filter(
          (e) => e.candidate_id === p.candidateId && (e.designation_id ?? null) === p.designationId,
        );
        const totals = computeAttendanceTotals(
          c.id,
          periodDates,
          lineEntries as AttendanceEntryLike[],
          (codes ?? []) as AttendanceCodeLike[],
        );
        const resource = resourceByDesignation.get(did);
        const wages = resource
          ? computeWages(totals, resource, periodDates.length)
          : null;
        const isPrimary = (c.designation_id ?? null) === p.designationId;
        const cAny = c as unknown as Record<string, unknown>;
        return {
          id: c.id,
          rowKey: pairKey(c.id, p.designationId),
          employeeCode: c.employee_code || "",
          name: c.full_name || "—",
          designation: designationName,
          designationId: p.designationId,
          isPrimary,
          totals,
          wages,
          resource: resource ?? null,
          hasContract: !!resource,
          bankAccountHolder: (cAny.bank_account_holder as string) || "",
          bankAccountNumber: (cAny.bank_account_number as string) || "",
          bankIfsc: (cAny.bank_ifsc as string) || "",
          bankName: (cAny.bank_name as string) || "",
          bankBranch: (cAny.bank_branch as string) || "",
          dateOfJoining:
            (cAny.approved_at as string) ||
            (cAny.preferred_joining_date as string) ||
            (cAny.application_date as string) ||
            "",
          panNumber: (cAny.pan_number as string) || "",
        };
      });

      rows.sort((a, b) => {
        const an = (a.employeeCode || a.name).localeCompare(b.employeeCode || b.name);
        if (an !== 0) return an;
        // primary first, then by designation name
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return a.designation.localeCompare(b.designation);
      });

      return rows;
    },
  });



  const rows = data ?? [];

  useEffect(() => {
    if (!highlightCandidate || rows.length === 0) return;
    const el = document.getElementById(`payroll-row-${highlightCandidate}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightCandidate, rows.length]);



  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        if (!r.wages) return acc;
        acc.earnedGross += r.wages.earnedGross;
        acc.deductions += r.wages.totalDeductions;
        acc.employerContrib += r.wages.totalEmployerContributions;
        acc.net += r.wages.netPay;
        acc.employerCost += r.wages.employerCost;
        return acc;
      },
      { earnedGross: 0, deductions: 0, employerContrib: 0, net: 0, employerCost: 0 },
    );
  }, [rows]);

  const exportCsv = () => {
    // Dynamic Wage Register — columns are derived from the actual contract
    // components / earned components / deductions present across rows. Empty
    // categories collapse so the CSV only contains what's truly in use.
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

    const collectUnique = (
      pick: (r: (typeof rows)[number]) => { name: string }[] | undefined,
    ) => {
      const seen = new Map<string, string>(); // norm -> display name (first seen)
      rows.forEach((r) => {
        const items = pick(r) ?? [];
        items.forEach((it) => {
          if (!it?.name) return;
          const key = norm(it.name);
          if (!key) return;
          if (!seen.has(key)) seen.set(key, it.name);
        });
      });
      return Array.from(seen.values());
    };

    const CONTRACT_COMPONENT_COLS = collectUnique((r) => r.resource?.components);
    const EARNED_COMPONENT_COLS = collectUnique((r) => r.wages?.components);
    const DEDUCTION_COLS = collectUnique((r) => r.wages?.deductions);

    const lookup = (items: { name: string; amount: number }[] | undefined, label: string) => {
      if (!items) return 0;
      const target = norm(label);
      const hit = items.find((i) => norm(i.name) === target);
      return hit ? hit.amount : 0;
    };

    const escapeCell = (v: unknown): string => {
      if (v === null || v === undefined) return "";
      const s = typeof v === "number" ? String(v) : String(v);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const periodMonth = (() => {
      const [y, m] = end.split("-");
      return `${m}-${y}`;
    })();
    const customerName = unit?.customer_name || "";
    const clientId = unit?.code || "";
    const siteName = unit?.name || "";

    const headers = [
      "SI No", "Month", "Agency Branch Name", "Client ID", "Client Name", "Site Name",
      "Employee ID", "Employee Name", "Designation", "Date Of Joining",
      "PF No", "ESI No", "UAN",
      ...CONTRACT_COMPONENT_COLS,
      "Rate", "Fixed Duties", "Duties", "Over Time Duties", "Reliever Duties",
      ...EARNED_COMPONENT_COLS,
      "Gross Salary",
      ...DEDUCTION_COLS,
      "Total Deductions", "Net Pay",
      "Bank Acc No", "Bank IFSC", "Bank Name", "Bank Branch Name", "Bank Account Holder Name",
      "Approved Date", "Approval Info", "Is payment completed", "Payment date", "Remarks",
    ];

    const lines = [headers.map(escapeCell).join(",")];
    rows.forEach((r, idx) => {
      const w = r.wages;
      const contractComponents = r.resource?.components ?? [];
      const earnedComponents = w?.components ?? [];
      const earnedDeductions = w?.deductions ?? [];

      const cells: unknown[] = [
        idx + 1, periodMonth, "", clientId, customerName, siteName,
        r.employeeCode, r.name, r.designation,
        r.dateOfJoining ? r.dateOfJoining.slice(0, 10) : "",
        "", "", "", // PF No, ESI No, UAN — not captured
        ...CONTRACT_COMPONENT_COLS.map((c) => lookup(contractComponents, c)),
        w ? w.perDayRate : 0,
        w ? w.baseDays : 0,
        r.totals.tDays, r.totals.otDays, 0,
        ...EARNED_COMPONENT_COLS.map((c) => lookup(earnedComponents, c)),
        w ? w.earnedGross : 0,
        ...DEDUCTION_COLS.map((c) => lookup(earnedDeductions, c)),
        w ? w.totalDeductions : 0,
        w ? w.netPay : 0,
        r.bankAccountNumber, r.bankIfsc, r.bankName, r.bankBranch, r.bankAccountHolder,
        runStatus === "approved" ? new Date().toISOString().slice(0, 10) : "",
        "", "No", "", "",
      ];
      lines.push(cells.map(escapeCell).join(","));
    });

    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wage-register-${unit?.code ?? unitId}-${start}-${end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };


  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/admin/payroll"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Back to payroll units
        </Link>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="mr-1.5 h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Payroll computation</div>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">{unit?.name || unit?.code || "Unit"}</h1>
            <div className="mt-1 text-sm text-muted-foreground">
              {unit?.customer_name} · Period {fmtPretty(start)} – {fmtPretty(end)}
            </div>
          </div>
          {sheet?.status === "approved" && (
            <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
              Attendance approved
            </span>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Earned gross" value={fmtINR(totals.earnedGross)} />
          <Stat label="Deductions" value={fmtINR(totals.deductions)} />
          <Stat label="Net pay" value={fmtINR(totals.net)} tone="emerald" />
          <Stat label="Employer contrib" value={fmtINR(totals.employerContrib)} />
          <Stat label="Total employer cost" value={fmtINR(totals.employerCost)} tone="amber" />
        </div>
      </div>

      {/* Payroll approval workflow */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Payroll status</span>
          <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
            runStatus === "draft" && "bg-slate-100 text-slate-700",
            runStatus === "submitted" && "bg-amber-100 text-amber-800",
            runStatus === "approved" && "bg-emerald-100 text-emerald-800",
            runStatus === "rejected" && "bg-rose-100 text-rose-800",
          )}>
            {runStatus === "draft" && "Draft"}
            {runStatus === "submitted" && "Submitted — awaiting approval"}
            {runStatus === "approved" && <><CheckCircle2 className="h-3.5 w-3.5" /> Approved</>}
            {runStatus === "rejected" && <><XCircle className="h-3.5 w-3.5" /> Rejected</>}
          </span>
          {runStatus === "rejected" && run?.rejection_reason && (
            <span className="text-xs text-rose-700">Reason: {run.rejection_reason}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {sheet?.status !== "approved" && (
            <span className="text-xs text-amber-700">Approve attendance first to submit payroll.</span>
          )}
          {sheet?.status === "approved" && (runStatus === "draft" || runStatus === "rejected") && (
            <Button size="sm" onClick={() => transitionRun.mutate({ status: "submitted" })} disabled={transitionRun.isPending}>
              <Send className="mr-1.5 h-4 w-4" /> Submit for Approval
            </Button>
          )}
          {runStatus === "submitted" && canApprove && (
            <>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => transitionRun.mutate({ status: "approved" })} disabled={transitionRun.isPending}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setRejectOpen(true)} disabled={transitionRun.isPending}>
                <XCircle className="mr-1.5 h-4 w-4" /> Reject
              </Button>
            </>
          )}
          {runStatus === "submitted" && !canApprove && (
            <span className="text-xs text-muted-foreground">Awaiting leadership approval</span>
          )}
          {runStatus === "approved" && canApprove && (
            <Button size="sm" variant="outline" onClick={() => transitionRun.mutate({ status: "draft" })} disabled={transitionRun.isPending}>
              <RotateCcw className="mr-1.5 h-4 w-4" /> Reopen
            </Button>
          )}
        </div>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject payroll</DialogTitle>
            <DialogDescription>Provide a reason so the submitter knows what to fix.</DialogDescription>
          </DialogHeader>
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection…" rows={4} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              if (!rejectReason.trim()) { toast.error("Reason required"); return; }
              transitionRun.mutate({ status: "rejected", reason: rejectReason.trim() }, {
                onSuccess: () => { setRejectOpen(false); setRejectReason(""); },
              });
            }}>Reject</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="ios-table min-w-[1480px] table-auto text-sm">
            <thead className="border-b border-border/60 bg-secondary/40">
              <tr className="text-left text-xs uppercase tracking-[0.16em] text-muted-foreground">
                <th className="px-4 py-3 font-medium w-[60px]"></th>
                <th className="px-4 py-3 font-medium">Emp ID</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Designation</th>
                <th className="px-4 py-3 text-left font-medium">T Days</th>
                <th className="px-4 py-3 text-left font-medium">OT Hrs</th>
                <th className="px-4 py-3 text-left font-medium" title="Full contract gross — what would be paid for a full month">Projected</th>
                <th className="px-4 py-3 text-left font-medium" title="Per-day × T Days based on actual attendance">Earned gross</th>
                <th className="px-4 py-3 text-left font-medium" title="Projected − Earned (unpaid due to absence)">Shortfall</th>
                <th className="px-4 py-3 text-left font-medium">Deductions</th>
                <th className="px-4 py-3 text-left font-medium">Net pay</th>
                <th className="px-4 py-3 text-left font-medium">Employer cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr><td colSpan={12} className="px-4 py-10 text-center text-muted-foreground">Computing wages…</td></tr>
              ) : error ? (
                <tr><td colSpan={12} className="px-4 py-10 text-center text-destructive">{error instanceof Error ? error.message : "Failed"}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-10 text-center text-muted-foreground">No employees mapped to this unit.</td></tr>
              ) : rows.map((r) => {
                const isHighlighted = highlightCandidate === r.id;
                const shortfall = r.wages ? Math.round((r.wages.contractGross - r.wages.earnedGross) * 100) / 100 : 0;
                const isExpanded = expandedRows.has(r.rowKey);
                return (
                <>
                <tr
                  key={r.rowKey}
                  id={`payroll-row-${r.rowKey}`}
                  className={`hover:bg-muted/40 ${isHighlighted ? "bg-emerald-50 ring-2 ring-emerald-400 dark:bg-emerald-950/40" : ""}`}
                >
                  <td className="px-4 py-3">
                    <button
                      onClick={() => {
                        const next = new Set(expandedRows);
                        if (next.has(r.rowKey)) next.delete(r.rowKey);
                        else next.add(r.rowKey);
                        setExpandedRows(next);
                      }}
                      className="inline-flex items-center justify-center rounded-lg border border-border/60 bg-background p-1 hover:bg-muted transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{r.employeeCode || "—"}</td>
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.designation}</td>
                  <td className="px-4 py-3 text-left">{r.totals.tDays}</td>
                  <td className="px-4 py-3 text-left">{r.totals.otHours}</td>
                  <td className="px-4 py-3 text-left text-muted-foreground">{r.wages ? fmtINR(r.wages.contractGross) : <span className="text-xs text-amber-600">no contract</span>}</td>
                  <td className="px-4 py-3 text-left font-medium">{r.wages ? fmtINR(r.wages.earnedGross) : "—"}</td>
                  <td className={`px-4 py-3 text-left ${shortfall > 0 ? "text-rose-600" : "text-muted-foreground"}`}>{r.wages ? (shortfall > 0 ? `− ${fmtINR(shortfall)}` : fmtINR(0)) : "—"}</td>
                  <td className="px-4 py-3 text-left">{r.wages ? fmtINR(r.wages.totalDeductions) : "—"}</td>
                  <td className="px-4 py-3 text-left font-semibold text-emerald-700">{r.wages ? fmtINR(r.wages.netPay) : "—"}</td>
                  <td className="px-4 py-3 text-left">{r.wages ? fmtINR(r.wages.employerCost) : "—"}</td>
                </tr>
                {isExpanded && r.wages && r.resource && (
                  <tr key={`${r.rowKey}-detail`} className="bg-secondary/20">
                    <td colSpan={12} className="px-4 py-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs my-3 rounded-lg border border-border/60 overflow-hidden">
                          <tbody>
                            <tr className="bg-muted/40">
                              <td className="px-3 py-2 font-bold uppercase">Salary Particulars</td>
                              <td className="px-3 py-2 text-center font-bold">{r.wages.baseDays} Days (contract)</td>
                              <td className="px-3 py-2 text-right font-bold">Earned Rs.</td>
                            </tr>
                            {r.resource.components.filter((c) => Number(c.amount) > 0).map((c) => {
                              const ratio = r.wages!.baseDays > 0 ? r.totals.tDays / r.wages!.baseDays : 0;
                              const earned = Math.round(Number(c.amount) * ratio * 100) / 100;
                              return (
                                <tr key={`c-${c.name}`} className="border-b border-border/40">
                                  <td className="px-3 py-2">{c.name}</td>
                                  <td className="px-3 py-2 text-center tabular-nums">{Number(c.amount).toFixed(2)}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{earned.toFixed(2)}</td>
                                </tr>
                              );
                            })}
                            {r.resource.benefits?.filter((b) => Number(b.amount) > 0).map((b) => {
                              const ratio = r.wages!.baseDays > 0 ? r.totals.tDays / r.wages!.baseDays : 0;
                              const earned = Math.round(Number(b.amount) * ratio * 100) / 100;
                              return (
                                <tr key={`b-${b.name}`} className="border-b border-border/40">
                                  <td className="px-3 py-2">{b.name}</td>
                                  <td className="px-3 py-2 text-center tabular-nums">{Number(b.amount).toFixed(2)}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{earned.toFixed(2)}</td>
                                </tr>
                              );
                            })}
                            {(r.resource.components.filter((c) => Number(c.amount) > 0).length === 0 && (r.resource.benefits?.filter((b) => Number(b.amount) > 0).length ?? 0) === 0) && (
                              <tr><td colSpan={3} className="px-3 py-3 text-center text-muted-foreground">No salary particulars configured.</td></tr>
                            )}
                            <tr className="bg-sky-100 font-bold dark:bg-sky-500/20">
                              <td className="px-3 py-2 uppercase">TOTAL Gross Rs.</td>
                              <td className="px-3 py-2 text-center tabular-nums">{(r.resource.components.reduce((s, c) => s + Number(c.amount), 0) + (r.resource.benefits?.reduce((s, b) => s + Number(b.amount), 0) ?? 0)).toFixed(2)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{r.wages.earnedGross.toFixed(2)}</td>
                            </tr>
                            <tr className="bg-muted/40">
                              <td className="px-3 py-2 font-bold uppercase">Deductions</td>
                              <td className="px-3 py-2" />
                              <td className="px-3 py-2 text-right font-bold">Earned Rs.</td>
                            </tr>
                            {r.resource.deductions?.filter((d) => Number(d.amount) > 0).map((d) => {
                              const ratio = r.wages!.baseDays > 0 ? r.totals.tDays / r.wages!.baseDays : 0;
                              const earned = Math.round(Number(d.amount) * ratio * 100) / 100;
                              return (
                                <tr key={`d-${d.name}`} className="border-b border-border/40">
                                  <td className="px-3 py-2">{d.name}</td>
                                  <td className="px-3 py-2 text-center tabular-nums">{Number(d.amount).toFixed(2)}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{earned.toFixed(2)}</td>
                                </tr>
                              );
                            })}
                            {(r.resource.deductions?.filter((d) => Number(d.amount) > 0).length ?? 0) === 0 && (
                              <tr><td colSpan={3} className="px-3 py-3 text-center text-muted-foreground">No deductions configured.</td></tr>
                            )}
                            <tr className="bg-rose-100 font-semibold dark:bg-rose-500/20">
                              <td className="px-3 py-2 uppercase">Total Deductions Rs.</td>
                              <td className="px-3 py-2 text-center tabular-nums">{(r.resource.deductions?.reduce((s, d) => s + Number(d.amount), 0) ?? 0).toFixed(2)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{r.wages.totalDeductions.toFixed(2)}</td>
                            </tr>
                            <tr className="bg-cyan-100 font-bold dark:bg-cyan-500/20">
                              <td className="px-3 py-2 uppercase">Total Amount (Payable) Rs.</td>
                              <td className="px-3 py-2 text-center tabular-nums">{((r.resource.components.reduce((s, c) => s + Number(c.amount), 0) + (r.resource.benefits?.reduce((s, b) => s + Number(b.amount), 0) ?? 0)) - (r.resource.deductions?.reduce((s, d) => s + Number(d.amount), 0) ?? 0)).toFixed(2)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{r.wages.netPay.toFixed(2)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
                </>
                );
              })}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t border-border/60 bg-secondary/30 text-sm font-semibold">
                <tr>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" colSpan={5}>Totals</td>
                  <td className="px-4 py-3 text-left text-muted-foreground">{fmtINR(rows.reduce((s, r) => s + (r.wages?.contractGross ?? 0), 0))}</td>
                  <td className="px-4 py-3 text-left">{fmtINR(totals.earnedGross)}</td>
                  <td className="px-4 py-3 text-left text-rose-600">− {fmtINR(rows.reduce((s, r) => s + (r.wages ? r.wages.contractGross - r.wages.earnedGross : 0), 0))}</td>
                  <td className="px-4 py-3 text-left">{fmtINR(totals.deductions)}</td>
                  <td className="px-4 py-3 text-left text-emerald-700">{fmtINR(totals.net)}</td>
                  <td className="px-4 py-3 text-left">{fmtINR(totals.employerCost)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "amber" }) {
  const cls = tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border/60 bg-background px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
