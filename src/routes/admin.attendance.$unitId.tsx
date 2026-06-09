import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Printer, Download, CheckCircle2, XCircle, Send, RotateCcw, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { classifyAttendanceEmployee, matchesAttendanceScope, type AttendanceScopeAssignment, type AttendanceUnitContext } from "@/lib/attendance";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  month: z.coerce.number().min(0).max(11).optional(),
  year: z.coerce.number().min(2000).max(2100).optional(),
});

export const Route = createFileRoute("/admin/attendance/$unitId")({
  validateSearch: (s) => searchSchema.parse(s),
  component: MusterRollPage,
});

type AttendanceCode = {
  id: string;
  code: string;
  label: string;
  color: string;
  counts_as_present: boolean;
  is_paid: boolean;
  is_leave: boolean;
  sort_order: number;
};

type EntryRow = {
  candidate_id: string;
  designation_id: string | null;
  entry_date: string;
  code: string;
  ot_hours: number;
};

const SERVICE_PROVIDER = {
  name: "Radiant Guard Services Private Limited",
  address: "Office No. 818, 8th Floor, Clover Hills Plaza, NIBM Road, Pune. 411048",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const ATTENDANCE_EMPLOYEE_STATUSES = ["active"] as const;

function daysInMonth(year: number, monthIdx0: number) {
  return new Date(year, monthIdx0 + 1, 0).getDate();
}

function ymd(year: number, monthIdx0: number, day: number) {
  const m = String(monthIdx0 + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function buildPeriodCells(
  year: number,
  monthIdx: number,
  win: { window_start_day: number; window_end_day: number } | null,
): Array<{ date: string; dayNum: number; monthIdx: number; year: number }> {
  const startDay = win?.window_start_day ?? 1;
  const endDay = win?.window_end_day ?? 31;
  const endsInSelected = startDay > endDay || (startDay === 1 && endDay >= 28);

  let startY: number, startM: number, startD: number;
  let endY: number, endM: number, endD: number;

  if (endsInSelected && startDay > endDay) {
    const prev = new Date(year, monthIdx - 1, 1);
    startY = prev.getFullYear();
    startM = prev.getMonth();
    const prevLast = daysInMonth(startY, startM);
    startD = Math.min(startDay, prevLast);
    endY = year;
    endM = monthIdx;
    endD = Math.min(endDay, daysInMonth(year, monthIdx));
  } else {
    startY = year;
    startM = monthIdx;
    startD = startDay;
    endY = year;
    endM = monthIdx;
    endD = Math.min(endDay, daysInMonth(year, monthIdx));
  }

  const cells: Array<{ date: string; dayNum: number; monthIdx: number; year: number }> = [];
  const cursor = new Date(startY, startM, startD);
  const stop = new Date(endY, endM, endD);
  while (cursor <= stop) {
    cells.push({
      date: ymd(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()),
      dayNum: cursor.getDate(),
      monthIdx: cursor.getMonth(),
      year: cursor.getFullYear(),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

const NULL_DESIG = "__none__"; // sentinel row-key segment when an employee has no designation

const rowKey = (candidateId: string, designationId: string | null) =>
  `${candidateId}|${designationId ?? NULL_DESIG}`;

function MusterRollPage() {
  const { unitId } = Route.useParams();
  const search = Route.useSearch();
  const now = new Date();
  const todayStr = ymd(now.getFullYear(), now.getMonth(), now.getDate());
  const [year, setYear] = useState(search.year ?? now.getFullYear());
  const [monthIdx, setMonthIdx] = useState(search.month ?? now.getMonth());

  const { data: unit } = useQuery({
    queryKey: ["attendance-unit", unitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units")
        .select("id, code, name, location, branch_id, customer_id, billing_state, reporting_officers, shipping_address1, shipping_address2, shipping_city, shipping_district, shipping_state, shipping_pincode, billing_address1, billing_address2, billing_city, billing_district, billing_pincode")
        .eq("id", unitId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: cust } = await supabase
        .from("customers")
        .select("id, name")
        .eq("id", data.customer_id ?? "")
        .maybeSingle();
      return { ...data, customer_name: cust?.name ?? "" };
    },
  });

  const { data: employees, isLoading, error: rosterError } = useQuery({
    queryKey: ["attendance-roster-v5", unitId],
    queryFn: async () => {
      const rosterSelect = "id, employee_code, full_name, designation_id, preferred_joining_date, date_of_birth, is_enabled, status, role_key";

      const { data: prim, error: primError } = await supabase
        .from("candidates")
        .select(rosterSelect)
        .eq("unit_id", unitId)
        .eq("is_enabled", true)
        .in("status", [...ATTENDANCE_EMPLOYEE_STATUSES]);
      if (primError) throw primError;

      const [
        { data: links, error: linksError },
        { data: rawUnit, error: rawUnitError },
        { data: scopeAssignments, error: scopeAssignmentsError },
      ] = await Promise.all([
        supabase.from("candidate_units").select("candidate_id").eq("unit_id", unitId),
        supabase.from("units").select("id, branch_id, customer_id, billing_state").eq("id", unitId).maybeSingle(),
        supabase.from("employee_scope_assignments").select("candidate_id, scope_type, scope_id").limit(5000),
      ]);
      if (linksError) throw linksError;
      if (rawUnitError) throw rawUnitError;
      if (scopeAssignmentsError) throw scopeAssignmentsError;

      const context: AttendanceUnitContext | null = rawUnit
        ? {
            id: rawUnit.id,
            branch_id: rawUnit.branch_id,
            customer_id: rawUnit.customer_id,
            billing_state: rawUnit.billing_state,
          }
        : null;

      const scopeIds = new Set<string>();
      for (const assignment of ((scopeAssignments ?? []) as AttendanceScopeAssignment[])) {
        if (context && matchesAttendanceScope(context, assignment)) scopeIds.add(assignment.candidate_id);
      }

      const secondaryIds = Array.from(new Set([...(links ?? []).map((l) => l.candidate_id), ...scopeIds]));
      let extra: typeof prim = [];
      if (secondaryIds.length) {
        const { data, error } = await supabase
          .from("candidates")
          .select(rosterSelect)
          .in("id", secondaryIds)
          .eq("is_enabled", true)
          .in("status", [...ATTENDANCE_EMPLOYEE_STATUSES]);
        if (error) throw error;
        extra = data ?? [];
      }
      const all = [...(prim ?? []), ...(extra ?? [])];
      const dedup = Array.from(new Map(all.map((c) => [c.id, c])).values());

      const desigIds = Array.from(
        new Set(dedup.map((c) => c.designation_id).filter(Boolean)),
      ) as string[];
      const { data: desigs } = await supabase
        .from("designations")
        .select("id, name")
        .in("id", desigIds.length ? desigIds : ["00000000-0000-0000-0000-000000000000"]);
      const dMap = new Map((desigs ?? []).map((d) => [d.id, d.name]));

      const mappedEmployees = dedup
        .map((c) => ({
          id: c.id,
          employee_code: c.employee_code || "",
          full_name: c.full_name || "",
          designation_id: c.designation_id as string | null,
          designation: (c.designation_id && dMap.get(c.designation_id)) || "",
          employee_type: classifyAttendanceEmployee(c.role_key, (c.designation_id && dMap.get(c.designation_id)) || ""),
          doj: c.preferred_joining_date || "",
        }))
        .filter((e) => e.employee_type === "security_guard")
        .sort((a, b) =>
          (a.employee_code || a.full_name).localeCompare(b.employee_code || b.full_name),
        );

      return mappedEmployees;
    },
    enabled: Boolean(unit),
  });

  // Active contract: payroll window + designations available on this unit
  const { data: contractInfo } = useQuery({
    queryKey: ["attendance-contract", unitId],
    queryFn: async () => {
      const { data: contracts, error } = await supabase
        .from("client_contracts")
        .select("id, payroll_window_id, start_date, status, record_type")
        .eq("unit_id", unitId)
        .eq("record_type", "client")
        .eq("status", "active")
        .order("start_date", { ascending: true })
        .limit(1);
      if (error) throw error;
      const winId = contracts?.[0]?.payroll_window_id;
      const startDate = contracts?.[0]?.start_date ?? null;
      const contractId = contracts?.[0]?.id ?? null;

      type Win = { id: string; label: string | null; window_start_day: number; window_end_day: number };
      let win: Win | null = null;
      if (winId) {
        const { data: winRow } = await supabase
          .from("payroll_windows")
          .select("id, label, window_start_day, window_end_day")
          .eq("id", winId)
          .maybeSingle();
        win = (winRow as Win | null) ?? null;
      }

      let resources: Array<{ designationId: string; designationName: string }> = [];
      if (contractId) {
        const { data: r } = await supabase
          .from("contract_resources")
          .select("designation_id")
          .eq("contract_id", contractId);
        const ids = Array.from(new Set((r ?? []).map((x) => x.designation_id).filter(Boolean))) as string[];
        if (ids.length) {
          const { data: ds } = await supabase
            .from("designations")
            .select("id, name")
            .in("id", ids);
          resources = (ds ?? []).map((d) => ({ designationId: d.id, designationName: d.name }));
        }
      }
      return { window: win, startDate, contractId, resources };
    },
    enabled: Boolean(unitId),
  });
  const payrollWindow = contractInfo?.window ?? null;
  const contractStartDate = contractInfo?.startDate ?? null;
  const contractDesignations = contractInfo?.resources ?? [];

  const periodCells = useMemo(
    () => buildPeriodCells(year, monthIdx, payrollWindow ?? null),
    [year, monthIdx, payrollWindow],
  );
  const dayCount = periodCells.length;
  const periodStart = periodCells[0]?.date ?? ymd(year, monthIdx, 1);
  const periodEnd = periodCells[periodCells.length - 1]?.date ?? ymd(year, monthIdx, daysInMonth(year, monthIdx));

  const queryClient = useQueryClient();

  type SheetStatus = "draft" | "submitted" | "approved" | "rejected";
  type SheetRow = { id: string; status: SheetStatus; rejection_reason: string };
  const sheetQK = ["attendance-sheet", unitId, periodStart, periodEnd];
  const { data: sheet } = useQuery({
    queryKey: sheetQK,
    queryFn: async (): Promise<SheetRow | null> => {
      const { data, error } = await supabase
        .from("attendance_sheets" as never)
        .select("id, status, rejection_reason")
        .eq("unit_id", unitId)
        .eq("period_start", periodStart)
        .eq("period_end", periodEnd)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as SheetRow | null);
    },
    enabled: Boolean(unitId && periodStart && periodEnd),
  });
  const status: SheetStatus = sheet?.status ?? "draft";
  const editable = status === "draft" || status === "rejected";

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const transitionSheet = useMutation({
    mutationFn: async (next: { status: SheetStatus; reason?: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      const ts = new Date().toISOString();
      const base: Record<string, unknown> = {
        unit_id: unitId,
        period_start: periodStart,
        period_end: periodEnd,
        status: next.status,
      };
      if (next.status === "submitted") { base.submitted_at = ts; base.submitted_by = uid; }
      if (next.status === "approved") { base.approved_at = ts; base.approved_by = uid; }
      if (next.status === "rejected") {
        base.rejected_at = ts; base.rejected_by = uid;
        base.rejection_reason = next.reason ?? "";
      }
      if (next.status === "draft") { base.rejection_reason = ""; }
      if (sheet?.id) {
        const { error } = await supabase
          .from("attendance_sheets" as never)
          .update(base as never)
          .eq("id", sheet.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("attendance_sheets" as never)
          .insert(base as never);
        if (error) throw error;
      }
      void logActivity({
        module: "Attendance",
        action: next.status === "submitted" ? "submit" : next.status === "approved" ? "approve" : next.status === "rejected" ? "reject" : "reopen",
        entityType: "attendance_sheets",
        entityLabel: `${unitId} ${periodStart} → ${periodEnd}`,
        details: { unit_id: unitId, period_start: periodStart, period_end: periodEnd, status: next.status, reason: next.reason ?? "" },
      });
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: sheetQK });
      toast.success(
        vars.status === "submitted" ? "Submitted for approval" :
        vars.status === "approved" ? "Attendance approved — payroll unlocked" :
        vars.status === "rejected" ? "Attendance rejected" : "Reopened for editing",
      );
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const { data: codes = [] } = useQuery({
    queryKey: ["attendance-codes-enabled"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_codes")
        .select("id, code, label, color, counts_as_present, is_paid, is_leave, sort_order")
        .eq("enabled", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AttendanceCode[];
    },
  });

  const codeMap = useMemo(() => new Map(codes.map((c) => [c.code, c])), [codes]);

  const entriesQK = ["attendance-entries-v2", unitId, periodStart, periodEnd];
  const { data: entries = [] } = useQuery({
    queryKey: entriesQK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_entries")
        .select("candidate_id, designation_id, entry_date, code, ot_hours")
        .eq("unit_id", unitId)
        .gte("entry_date", periodStart)
        .lte("entry_date", periodEnd);
      if (error) throw error;
      return (data ?? []) as EntryRow[];
    },
    enabled: Boolean(unitId),
  });

  const entryMap = useMemo(() => {
    const m = new Map<string, EntryRow>();
    for (const e of entries) m.set(`${rowKey(e.candidate_id, e.designation_id)}|${e.entry_date}`, e);
    return m;
  }, [entries]);

  // Extra (candidate, designation) rows the user added locally — persisted as soon as an entry is saved.
  const [extraRows, setExtraRows] = useState<Set<string>>(new Set());

  // Derived list of muster rows: one per (candidate, designation)
  const musterRows = useMemo(() => {
    const out: Array<{
      key: string;
      candidateId: string;
      designationId: string | null;
      designationName: string;
      emp: NonNullable<typeof employees>[number];
      isPrimary: boolean;
    }> = [];
    const seen = new Set<string>();
    const desigNameMap = new Map(contractDesignations.map((d) => [d.designationId, d.designationName]));

    for (const emp of employees ?? []) {
      // Primary row from candidate's own designation
      const primaryKey = rowKey(emp.id, emp.designation_id);
      out.push({
        key: primaryKey,
        candidateId: emp.id,
        designationId: emp.designation_id,
        designationName: emp.designation || "—",
        emp,
        isPrimary: true,
      });
      seen.add(primaryKey);

      // Additional rows from any entries with a different designation
      for (const e of entries) {
        if (e.candidate_id !== emp.id) continue;
        const k = rowKey(e.candidate_id, e.designation_id);
        if (seen.has(k)) continue;
        seen.add(k);
        const dName = (e.designation_id && desigNameMap.get(e.designation_id)) || "—";
        out.push({
          key: k,
          candidateId: emp.id,
          designationId: e.designation_id,
          designationName: dName,
          emp,
          isPrimary: false,
        });
      }

      // Locally added extras for this candidate
      for (const xk of extraRows) {
        if (!xk.startsWith(emp.id + "|")) continue;
        if (seen.has(xk)) continue;
        seen.add(xk);
        const did = xk.split("|")[1];
        const designationId = did === NULL_DESIG ? null : did;
        const dName = (designationId && desigNameMap.get(designationId)) || "—";
        out.push({
          key: xk,
          candidateId: emp.id,
          designationId,
          designationName: dName,
          emp,
          isPrimary: false,
        });
      }
    }
    return out;
  }, [employees, entries, extraRows, contractDesignations]);

  // ---- Mutations ----
  const guardFuture = (date: string) => {
    if (date > todayStr) {
      toast.error("Cannot mark attendance for a future date");
      return false;
    }
    return true;
  };

  const upsertEntries = async (
    candidate_id: string,
    designation_id: string | null,
    rows: Array<{ entry_date: string; code: string; ot_hours: number }>,
  ) => {
    const filtered = rows.filter((r) => r.entry_date <= todayStr);
    if (filtered.length === 0) {
      toast.error("All selected dates are in the future — nothing marked");
      return;
    }
    const payload = filtered.map((r) => ({
      unit_id: unitId,
      candidate_id,
      designation_id,
      entry_date: r.entry_date,
      code: r.code,
      ot_hours: r.ot_hours,
    }));
    const { error } = await supabase
      .from("attendance_entries")
      .upsert(payload, { onConflict: "unit_id,candidate_id,designation_id,entry_date" });
    if (error) throw error;
  };

  // Drag-to-select state — keyed by row (candidate|designation)
  const [dragRowKey, setDragRowKey] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRowKey, setPickerRowKey] = useState<string | null>(null);
  const [pickerDates, setPickerDates] = useState<string[]>([]);

  const [otDragRowKey, setOtDragRowKey] = useState<string | null>(null);
  const [isOtDragging, setIsOtDragging] = useState(false);
  const [otSelectedDates, setOtSelectedDates] = useState<Set<string>>(new Set());
  const [otPickerOpen, setOtPickerOpen] = useState(false);
  const [otPickerRowKey, setOtPickerRowKey] = useState<string | null>(null);
  const [otPickerDates, setOtPickerDates] = useState<string[]>([]);

  useEffect(() => {
    if (!isDragging) return;
    const onUp = () => {
      setIsDragging(false);
      setSelectedDates((current) => {
        if (current.size > 0 && dragRowKey) {
          const sorted = Array.from(current).sort();
          setPickerRowKey(dragRowKey);
          setPickerDates(sorted);
          setPickerOpen(true);
          setDragRowKey(null);
          return new Set();
        }
        return current;
      });
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [isDragging, dragRowKey]);

  useEffect(() => {
    if (!isOtDragging) return;
    const onUp = () => {
      setIsOtDragging(false);
      setOtSelectedDates((current) => {
        if (current.size > 0 && otDragRowKey) {
          const sorted = Array.from(current).sort();
          setOtPickerRowKey(otDragRowKey);
          setOtPickerDates(sorted);
          setOtPickerOpen(true);
          setOtDragRowKey(null);
          return new Set();
        }
        return current;
      });
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [isOtDragging, otDragRowKey]);

  const openPickerForSelection = () => {
    if (!dragRowKey || selectedDates.size === 0) return;
    setPickerRowKey(dragRowKey);
    setPickerDates(Array.from(selectedDates).sort());
    setPickerOpen(true);
  };

  const openOtPickerForSelection = () => {
    if (!otDragRowKey || otSelectedDates.size === 0) return;
    setOtPickerRowKey(otDragRowKey);
    setOtPickerDates(Array.from(otSelectedDates).sort());
    setOtPickerOpen(true);
  };

  const clearSelection = () => { setSelectedDates(new Set()); setDragRowKey(null); };
  const clearOtSelection = () => { setOtSelectedDates(new Set()); setOtDragRowKey(null); };

  const findRow = (k: string | null) => musterRows.find((r) => r.key === k);

  const applyCodeToSelection = async (code: string) => {
    const row = findRow(pickerRowKey);
    if (!row) return;
    try {
      const rows = pickerDates.map((d) => ({
        entry_date: d,
        code,
        ot_hours: entryMap.get(`${row.key}|${d}`)?.ot_hours ?? 0,
      }));
      await upsertEntries(row.candidateId, row.designationId, rows);
      queryClient.invalidateQueries({ queryKey: entriesQK });
      setPickerOpen(false);
      setSelectedDates(new Set());
      setDragRowKey(null);
      toast.success(`Applied ${code || "Clear"} to ${pickerDates.length} day${pickerDates.length > 1 ? "s" : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  };

  const applyOtToSelection = async (hours: number) => {
    const row = findRow(otPickerRowKey);
    if (!row) return;
    try {
      const rows = otPickerDates.map((d) => ({
        entry_date: d,
        code: entryMap.get(`${row.key}|${d}`)?.code ?? "",
        ot_hours: hours,
      }));
      await upsertEntries(row.candidateId, row.designationId, rows);
      queryClient.invalidateQueries({ queryKey: entriesQK });
      setOtPickerOpen(false);
      setOtSelectedDates(new Set());
      setOtDragRowKey(null);
      toast.success(
        hours > 0
          ? `Set ${hours}h OT on ${otPickerDates.length} day${otPickerDates.length > 1 ? "s" : ""}`
          : `Cleared OT on ${otPickerDates.length} day${otPickerDates.length > 1 ? "s" : ""}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  };

  const UNIT_DUTY_HOURS = 8;

  const computeTotalsForRow = (rk: string) => {
    let pDays = 0;
    let otHours = 0;
    let phCount = 0;
    let otherPaidDays = 0;
    for (const cell of periodCells) {
      const e = entryMap.get(`${rk}|${cell.date}`);
      if (!e) continue;
      otHours += Number(e.ot_hours) || 0;
      const c = codeMap.get(e.code);
      if (!c) continue;
      if (e.code === "PH") { phCount += 1; continue; }
      if (c.counts_as_present) pDays += 1;
      else if (c.is_paid) otherPaidDays += 1;
    }
    const phDays = phCount * 2;
    const otDays = Math.round((otHours / UNIT_DUTY_HOURS) * 100) / 100;
    const tDays = pDays + phDays + otherPaidDays + otDays;
    return { pDays, otHours, otDays, phDays, tDays };
  };

  const principalEmployer = unit
    ? `${unit.customer_name || ""}${unit.code ? ` - ${unit.code}` : ""}`.trim()
    : "—";
  const principalAddress = unit
    ? [
        unit.shipping_address1 || unit.billing_address1 || unit.location,
        unit.shipping_address2 || unit.billing_address2,
        [
          unit.shipping_city || unit.billing_city,
          unit.shipping_district || unit.billing_district,
          unit.shipping_state || unit.billing_state,
          unit.shipping_pincode || unit.billing_pincode,
        ].filter(Boolean).join(", "),
      ].filter((v) => v && String(v).trim()).join(", ")
    : "";

  const monthLabel = `${MONTH_NAMES[monthIdx]} ${year}`;
  const formatPretty = (iso: string) => {
    const [yy, mm, dd] = iso.split("-").map(Number);
    return `${String(dd).padStart(2, "0")} ${MONTH_NAMES[mm - 1].slice(0, 3)} ${yy}`;
  };
  const periodLabel =
    periodCells.length > 0
      ? `${formatPretty(periodStart)} – ${formatPretty(periodEnd)}`
      : monthLabel;
  const windowLabel = payrollWindow?.label
    ? `Payroll window: ${payrollWindow.label}`
    : "Payroll window: full calendar month";

  // "Add line item" UI state
  const [addCand, setAddCand] = useState<string>("");
  const [addDesig, setAddDesig] = useState<string>("");
  const handleAddLineItem = () => {
    if (!addCand || !addDesig) {
      toast.error("Pick both an employee and a designation");
      return;
    }
    const k = rowKey(addCand, addDesig);
    if (musterRows.some((r) => r.key === k)) {
      toast.info("That line item already exists");
      return;
    }
    setExtraRows((prev) => new Set(prev).add(k));
    const empName = (employees ?? []).find((e) => e.id === addCand)?.full_name ?? "";
    const dName = contractDesignations.find((d) => d.designationId === addDesig)?.designationName ?? "";
    toast.success(`Added row: ${empName} — ${dName}`);
    setAddCand(""); setAddDesig("");
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body * { visibility: hidden !important; }
          #form-xvi-print, #form-xvi-print * { visibility: visible !important; }
          #form-xvi-print {
            position: absolute !important;
            left: 0; top: 0;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: 0 !important;
          }
        }
      `}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to="/admin/attendance"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" /> Back to units
        </Link>

        <div className="flex items-center gap-2">
          <Select value={String(monthIdx)} onValueChange={(v) => setMonthIdx(Number(v))}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((m, i) => {
                if (contractStartDate) {
                  const [sy, sm] = contractStartDate.split("-").map(Number);
                  if (year < sy || (year === sy && i < sm - 1)) return null;
                }
                if (year > now.getFullYear() || (year === now.getFullYear() && i > now.getMonth())) return null;
                return <SelectItem key={m} value={String(i)}>{m}</SelectItem>;
              })}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[year - 2, year - 1, year, year + 1].map((y) => {
                if (contractStartDate) {
                  const sy = Number(contractStartDate.split("-")[0]);
                  if (y < sy) return null;
                }
                if (y > now.getFullYear()) return null;
                return <SelectItem key={y} value={String(y)}>{y}</SelectItem>;
              })}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" /> Print
          </Button>
          <Button variant="outline" size="sm" disabled>
            <Download className="mr-1.5 h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {/* Approval workflow */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3 print:hidden">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Status</span>
          <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
            status === "draft" && "bg-slate-100 text-slate-700",
            status === "submitted" && "bg-amber-100 text-amber-800",
            status === "approved" && "bg-emerald-100 text-emerald-800",
            status === "rejected" && "bg-rose-100 text-rose-800",
          )}>
            {status === "draft" && "Draft"}
            {status === "submitted" && "Submitted — awaiting approval"}
            {status === "approved" && <><CheckCircle2 className="h-3.5 w-3.5" /> Approved</>}
            {status === "rejected" && <><XCircle className="h-3.5 w-3.5" /> Rejected</>}
          </span>
          {status === "rejected" && sheet?.rejection_reason && (
            <span className="text-xs text-rose-700">Reason: {sheet.rejection_reason}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(status === "draft" || status === "rejected") && (
            <Button size="sm" onClick={() => transitionSheet.mutate({ status: "submitted" })} disabled={transitionSheet.isPending}>
              <Send className="mr-1.5 h-4 w-4" /> Submit for Payroll
            </Button>
          )}
          {status === "submitted" && (
            <>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => transitionSheet.mutate({ status: "approved" })} disabled={transitionSheet.isPending}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setRejectOpen(true)} disabled={transitionSheet.isPending}>
                <XCircle className="mr-1.5 h-4 w-4" /> Reject
              </Button>
            </>
          )}
          {status === "approved" && (
            <Button size="sm" variant="outline" onClick={() => transitionSheet.mutate({ status: "draft" })} disabled={transitionSheet.isPending}>
              <RotateCcw className="mr-1.5 h-4 w-4" /> Reopen
            </Button>
          )}
        </div>
      </div>

      {!editable && (
        <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 print:hidden">
          This attendance sheet is {status === "approved" ? "approved" : "submitted"} and locked for editing. {status === "submitted" ? "Reject it to allow further edits." : "Reopen it to make changes."}
        </div>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject attendance</DialogTitle>
            <DialogDescription>Provide a reason so the submitter knows what to fix.</DialogDescription>
          </DialogHeader>
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection…" rows={4} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              if (!rejectReason.trim()) { toast.error("Reason required"); return; }
              transitionSheet.mutate({ status: "rejected", reason: rejectReason.trim() }, {
                onSuccess: () => { setRejectOpen(false); setRejectReason(""); },
              });
            }}>Reject</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="rounded-md border border-dashed border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground print:hidden">
        Tip: click a cell to mark one day, click & drag to mark a range. Future dates are locked. Use{" "}
        <strong>Add line item</strong> below to give an employee an extra designation (e.g. Priya covering Senior Guard shift) — each line is paid separately.
      </div>

      {/* Add line item panel */}
      <div className="rounded-xl border border-border/70 bg-card p-3 print:hidden">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Employee</label>
            <Select value={addCand} onValueChange={setAddCand}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Pick employee…" /></SelectTrigger>
              <SelectContent>
                {(employees ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name || e.employee_code || e.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Additional designation</label>
            <Select value={addDesig} onValueChange={setAddDesig} disabled={!addCand}>
              <SelectTrigger className="w-[260px]"><SelectValue placeholder="Pick designation from contract…" /></SelectTrigger>
              <SelectContent>
                {contractDesignations
                  .filter((d) => {
                    if (!addCand) return true;
                    return !musterRows.some((r) => r.candidateId === addCand && r.designationId === d.designationId);
                  })
                  .map((d) => (
                    <SelectItem key={d.designationId} value={d.designationId}>{d.designationName}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={handleAddLineItem} disabled={!editable || !addCand || !addDesig}>
            <Plus className="mr-1.5 h-4 w-4" /> Add line item
          </Button>
          <div className="ml-auto text-[11px] text-muted-foreground">
            {contractDesignations.length === 0 ? "No contract resources mapped — add designations on the contract first." : `${contractDesignations.length} designation(s) on contract`}
          </div>
        </div>
      </div>

      {selectedDates.size > 0 && !isDragging && dragRowKey && (
        <div className="sticky top-2 z-20 flex items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm shadow-sm print:hidden">
          <div>
            <span className="font-semibold">{selectedDates.size}</span> day
            {selectedDates.size > 1 ? "s" : ""} selected for{" "}
            <span className="font-semibold">
              {findRow(dragRowKey)?.emp.full_name ?? ""} — {findRow(dragRowKey)?.designationName ?? ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={clearSelection}>Clear</Button>
            <Button size="sm" onClick={openPickerForSelection}>Apply attendance</Button>
          </div>
        </div>
      )}

      {otSelectedDates.size > 0 && !isOtDragging && otDragRowKey && (
        <div className="sticky top-2 z-20 flex items-center justify-between gap-3 rounded-md border border-amber-500/50 bg-amber-50 px-3 py-2 text-sm shadow-sm print:hidden">
          <div>
            <span className="font-semibold">{otSelectedDates.size}</span> OT day
            {otSelectedDates.size > 1 ? "s" : ""} selected for{" "}
            <span className="font-semibold">
              {findRow(otDragRowKey)?.emp.full_name ?? ""} — {findRow(otDragRowKey)?.designationName ?? ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={clearOtSelection}>Clear</Button>
            <Button size="sm" onClick={openOtPickerForSelection}>Set OT hours</Button>
          </div>
        </div>
      )}

      {/* Muster Roll Sheet */}
      <div id="form-xvi-print" className="rounded-xl border border-border/60 bg-white p-5 text-[11px] text-slate-900 shadow-sm print:rounded-none print:border-0 print:shadow-none sm:p-6">

        <div className="text-center">
          <div className="text-base font-bold">Form XVI</div>
          <div className="text-[10px] italic">[ See Rule 78 (1) (a) (i) ]</div>
          <div className="mt-1 text-sm font-bold tracking-wide">MUSTER ROLL</div>
        </div>

        <table className="mt-3 w-full border border-slate-400 text-[11px]">
          <tbody>
            <tr>
              <td className="w-1/2 border border-slate-400 p-2 align-top">
                <div className="font-semibold">Name And Address Of Service Provider :</div>
                <div className="mt-1 font-bold">{SERVICE_PROVIDER.name}</div>
                <div className="text-slate-700">{SERVICE_PROVIDER.address}</div>
              </td>
              <td className="w-1/2 border border-slate-400 p-2 align-top">
                <div className="font-semibold">Name and Address of Principal Employer :</div>
                <div className="mt-1 font-bold">{principalEmployer || "—"}</div>
                {principalAddress && <div className="text-slate-700">{principalAddress}</div>}
                <div className="mt-3 font-semibold">For the month of {monthLabel}</div>
                <div className="text-slate-700">Period: {periodLabel}</div>
                <div className="text-[10px] text-slate-500">{windowLabel}</div>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse border border-slate-400 text-center text-[10px]">
            <thead className="bg-slate-100">
              <tr>
                <th className="border border-slate-400 p-1 align-middle">Sl.<br />No.</th>
                <th className="border border-slate-400 p-1 align-middle">Emp ID</th>
                <th className="border border-slate-400 p-1 text-left align-middle">Employee Name</th>
                <th className="border border-slate-400 p-1 text-left align-middle">Designation</th>
                <th className="border border-slate-400 p-1 align-middle">DOJ</th>
                <th className="border border-slate-400 p-1 align-middle" colSpan={dayCount}>Days</th>
                <th className="border border-slate-400 p-1 align-middle" rowSpan={2}>P<br />Days</th>
                <th className="border border-slate-400 p-1 align-middle">OT<br />Hrs</th>
                <th className="border border-slate-400 p-1 align-middle" rowSpan={2}>PH<br />Days</th>
                <th className="border border-slate-400 p-1 align-middle" rowSpan={2}>T<br />Days</th>
              </tr>
              <tr className="bg-slate-50">
                <th className="border border-slate-400 p-1"></th>
                <th className="border border-slate-400 p-1"></th>
                <th className="border border-slate-400 p-1"></th>
                <th className="border border-slate-400 p-1"></th>
                <th className="border border-slate-400 p-1"></th>
                {periodCells.map((cell) => {
                  const isMonthBoundary = cell.dayNum === 1 || cell === periodCells[0];
                  const isFuture = cell.date > todayStr;
                  return (
                    <th
                      key={cell.date}
                      className={cn(
                        "border border-slate-400 p-0.5 text-[9px] font-medium",
                        isMonthBoundary && "border-l-2 border-l-slate-600",
                        isFuture && "bg-slate-200 text-slate-400",
                      )}
                      style={{ minWidth: 18 }}
                      title={cell.date + (isFuture ? " (future)" : "")}
                    >
                      {cell.dayNum}
                    </th>
                  );
                })}
                <th className="border border-slate-400 p-1 text-[9px] font-medium">OT<br />Days</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9 + dayCount} className="p-4 text-slate-500">Loading roster…</td></tr>
              ) : rosterError ? (
                <tr><td colSpan={9 + dayCount} className="p-6 text-red-600">Failed to load mapped employees for this unit.</td></tr>
              ) : musterRows.length === 0 ? (
                <tr><td colSpan={9 + dayCount} className="p-6 text-slate-500">No active security guards are mapped to this unit.</td></tr>
              ) : (
                musterRows.flatMap((mr, idx) => {
                  const cellBase = "border border-slate-400 align-middle";
                  const totals = computeTotalsForRow(mr.key);
                  return [
                    <tr key={mr.key + "-att"}>
                      <td className={cn(cellBase, "p-1 font-medium")} rowSpan={2}>{idx + 1}</td>
                      <td className={cn(cellBase, "p-1")} rowSpan={2}>{mr.emp.employee_code || "—"}</td>
                      <td className={cn(cellBase, "p-1 text-left")} rowSpan={2}>
                        <div className="flex items-center gap-1.5">
                          <span>{mr.emp.full_name || "—"}</span>
                          {!mr.isPrimary && (
                            <button
                              type="button"
                              title="Remove this extra line (does not delete existing entries)"
                              onClick={() => {
                                setExtraRows((prev) => {
                                  const next = new Set(prev);
                                  next.delete(mr.key);
                                  return next;
                                });
                              }}
                              className="rounded-full p-0.5 text-slate-400 hover:text-rose-600 print:hidden"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className={cn(cellBase, "p-1 text-left")} rowSpan={2}>
                        {mr.designationName || "—"}
                        {!mr.isPrimary && (
                          <span className="ml-1 rounded bg-violet-100 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-violet-700 print:hidden">extra</span>
                        )}
                      </td>
                      <td className={cn(cellBase, "p-1")} rowSpan={2}>
                        {mr.emp.doj ? new Date(mr.emp.doj).toLocaleDateString("en-GB") : "—"}
                      </td>
                      {periodCells.map((cell) => {
                        const date = cell.date;
                        const isFuture = date > todayStr;
                        const entry = entryMap.get(`${mr.key}|${date}`);
                        const codeMeta = entry?.code ? codeMap.get(entry.code) : undefined;
                        const isSelected = dragRowKey === mr.key && selectedDates.has(date);
                        return (
                          <td
                            key={`a-${cell.date}`}
                            className={cn(
                              cellBase,
                              "p-0 print:bg-transparent select-none",
                              isFuture
                                ? "bg-slate-100 cursor-not-allowed"
                                : "cursor-pointer",
                              isSelected && "ring-2 ring-primary ring-inset",
                            )}
                            style={{
                              height: 22,
                              minWidth: 18,
                              backgroundColor: isFuture
                                ? undefined
                                : codeMeta?.color ? `${codeMeta.color}22` : undefined,
                            }}
                            title={isFuture ? "Future date — cannot mark attendance" : undefined}
                            onMouseDown={(e) => {
                              if (isFuture) { e.preventDefault(); return; }
                              if (!editable) { e.preventDefault(); return; }
                              e.preventDefault();
                              const additive = e.ctrlKey || e.metaKey;
                              if (additive) {
                                setSelectedDates((prev) => {
                                  const sameRow = dragRowKey === mr.key;
                                  const next = sameRow ? new Set(prev) : new Set<string>();
                                  if (sameRow && next.has(date)) next.delete(date);
                                  else next.add(date);
                                  return next;
                                });
                                setDragRowKey(mr.key);
                                return;
                              }
                              setDragRowKey(mr.key);
                              setIsDragging(true);
                              setSelectedDates(new Set([date]));
                            }}
                            onMouseEnter={() => {
                              if (isFuture) return;
                              if (isDragging && dragRowKey === mr.key) {
                                setSelectedDates((prev) => {
                                  if (prev.has(date)) return prev;
                                  const next = new Set(prev);
                                  next.add(date);
                                  return next;
                                });
                              }
                            }}
                            onClick={(e) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); }}
                          >
                            <div
                              className="h-full w-full px-0 text-[10px] font-semibold leading-none flex items-center justify-center"
                              style={{ color: codeMeta?.color }}
                            >
                              {entry?.code || ""}
                            </div>
                          </td>
                        );
                      })}

                      <td className={cn(cellBase, "p-1 font-semibold")} rowSpan={2}>{totals.pDays}</td>
                      <td className={cn(cellBase, "p-1 font-semibold")}>{totals.otHours}</td>
                      <td className={cn(cellBase, "p-1 font-semibold")} rowSpan={2}>{totals.phDays}</td>
                      <td className={cn(cellBase, "p-1 font-semibold")} rowSpan={2}>{totals.tDays}</td>
                    </tr>,
                    <tr key={mr.key + "-ot"}>
                      {periodCells.map((cell) => {
                        const date = cell.date;
                        const isFuture = date > todayStr;
                        const entry = entryMap.get(`${mr.key}|${date}`);
                        const hrs = Number(entry?.ot_hours) || 0;
                        const isSelected = otDragRowKey === mr.key && otSelectedDates.has(date);
                        return (
                          <td
                            key={`o-${cell.date}`}
                            className={cn(
                              cellBase,
                              "p-0 select-none transition-colors",
                              isFuture
                                ? "bg-slate-100 cursor-not-allowed"
                                : "cursor-pointer",
                              hrs > 0 && !isFuture && "bg-amber-50",
                              isSelected && "ring-2 ring-amber-500 ring-inset bg-amber-100",
                            )}
                            style={{ height: 22, minWidth: 18 }}
                            onMouseDown={(e) => {
                              if (isFuture || !editable) { e.preventDefault(); return; }
                              e.preventDefault();
                              const additive = e.ctrlKey || e.metaKey;
                              if (additive) {
                                setOtSelectedDates((prev) => {
                                  const sameRow = otDragRowKey === mr.key;
                                  const next = sameRow ? new Set(prev) : new Set<string>();
                                  if (sameRow && next.has(date)) next.delete(date);
                                  else next.add(date);
                                  return next;
                                });
                                setOtDragRowKey(mr.key);
                                return;
                              }
                              setOtDragRowKey(mr.key);
                              setIsOtDragging(true);
                              setOtSelectedDates(new Set([date]));
                            }}
                            onMouseEnter={() => {
                              if (isFuture) return;
                              if (isOtDragging && otDragRowKey === mr.key) {
                                setOtSelectedDates((prev) => {
                                  if (prev.has(date)) return prev;
                                  const next = new Set(prev);
                                  next.add(date);
                                  return next;
                                });
                              }
                            }}
                            onClick={(e) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); }}
                            title={isFuture ? "Future date — cannot mark OT" : `OT for ${date}${hrs > 0 ? ` · ${hrs}h` : ""}`}
                          >
                            <div
                              className={cn(
                                "h-full w-full flex items-center justify-center text-[10px] font-semibold leading-none",
                                hrs > 0 ? "text-amber-700" : "text-slate-300",
                              )}
                            >
                              {hrs > 0 ? hrs : ""}
                            </div>
                          </td>
                        );
                      })}
                      <td className={cn(cellBase, "p-1 font-semibold")}>{totals.otDays}</td>
                    </tr>,
                  ];
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-[10px] text-slate-600">
          Att = Attendance · OT = Overtime hours · Each (employee × designation) is a separate payroll line.
        </div>
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark attendance</DialogTitle>
            <DialogDescription>
              {pickerDates.length} day{pickerDates.length > 1 ? "s" : ""} selected
              {pickerRowKey
                ? ` for ${findRow(pickerRowKey)?.emp.full_name ?? ""} — ${findRow(pickerRowKey)?.designationName ?? ""}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-2">
            {codes.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => applyCodeToSelection(c.code)}
                className="rounded-md border border-border px-2 py-3 text-sm font-bold transition hover:bg-muted"
                style={{ color: c.color }}
                title={c.label}
              >
                {c.code}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => applyCodeToSelection("")}
            className="mt-2 w-full rounded-md border border-border px-2 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            Clear selection
          </button>
        </DialogContent>
      </Dialog>

      <Dialog open={otPickerOpen} onOpenChange={setOtPickerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set OT hours</DialogTitle>
            <DialogDescription>
              {otPickerDates.length} day{otPickerDates.length > 1 ? "s" : ""} selected
              {otPickerRowKey
                ? ` for ${findRow(otPickerRowKey)?.emp.full_name ?? ""} — ${findRow(otPickerRowKey)?.designationName ?? ""}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 16 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => applyOtToSelection(n)}
                className="rounded-md border border-amber-200 bg-amber-50 px-2 py-3 text-base font-bold text-amber-800 transition hover:border-amber-400 hover:bg-amber-100"
              >
                {n}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => applyOtToSelection(0)}
            className="mt-2 w-full rounded-md border border-border px-2 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            Clear OT
          </button>
        </DialogContent>
      </Dialog>

      {/* Suppress unused warning - guardFuture reserved for future server-roundtrip helpers */}
      <span hidden>{String(guardFuture("2000-01-01"))}</span>
    </div>
  );
}
