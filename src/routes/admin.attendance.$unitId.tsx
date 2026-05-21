import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Printer, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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


export const Route = createFileRoute("/admin/attendance/$unitId")({
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

// Attendance is always for the previous month (May shows April's roll).
// Only active employees appear on the roll.
const ATTENDANCE_EMPLOYEE_STATUSES = ["active"] as const;

function daysInMonth(year: number, monthIdx0: number) {
  return new Date(year, monthIdx0 + 1, 0).getDate();
}

function previousMonth(now: Date) {
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: prev.getFullYear(), monthIdx: prev.getMonth() };
}

function MusterRollPage() {
  const { unitId } = Route.useParams();
  const now = new Date();
  const initial = previousMonth(now);
  const [year, setYear] = useState(initial.year);
  const [monthIdx, setMonthIdx] = useState(initial.monthIdx); // 0-based, defaults to previous month

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
    queryKey: ["attendance-roster-v4", unitId],
    queryFn: async () => {
      const rosterSelect = "id, employee_code, full_name, designation_id, preferred_joining_date, date_of_birth, is_enabled, status, role_key";

      // Primary unit assignment on candidates
      const { data: prim, error: primError } = await supabase
        .from("candidates")
        .select(rosterSelect)
        .eq("unit_id", unitId)
        .eq("is_enabled", true)
        .in("status", [...ATTENDANCE_EMPLOYEE_STATUSES]);
      if (primError) throw primError;

      // Multi-unit assignments
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

      // Only billable security guards are payable per-unit; field officers (reporting officers)
      // are on Radiant's own payroll and are excluded from the muster roll.
      const mappedEmployees = dedup
        .map((c) => ({
          id: c.id,
          employee_code: c.employee_code || "",
          full_name: c.full_name || "",
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

  const dayCount = daysInMonth(year, monthIdx);
  const dayList = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => i + 1),
    [dayCount],
  );

  const monthStart = useMemo(() => {
    const m = String(monthIdx + 1).padStart(2, "0");
    return `${year}-${m}-01`;
  }, [year, monthIdx]);
  const monthEnd = useMemo(() => {
    const m = String(monthIdx + 1).padStart(2, "0");
    const d = String(dayCount).padStart(2, "0");
    return `${year}-${m}-${d}`;
  }, [year, monthIdx, dayCount]);

  const queryClient = useQueryClient();

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

  const { data: entries = [] } = useQuery({
    queryKey: ["attendance-entries", unitId, monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_entries")
        .select("candidate_id, entry_date, code, ot_hours")
        .eq("unit_id", unitId)
        .gte("entry_date", monthStart)
        .lte("entry_date", monthEnd);
      if (error) throw error;
      return (data ?? []) as EntryRow[];
    },
    enabled: Boolean(unitId),
  });

  const entryMap = useMemo(() => {
    const m = new Map<string, EntryRow>();
    for (const e of entries) m.set(`${e.candidate_id}|${e.entry_date}`, e);
    return m;
  }, [entries]);

  const upsertEntry = useMutation({
    mutationFn: async (payload: { candidate_id: string; entry_date: string; code?: string; ot_hours?: number }) => {
      const existing = entryMap.get(`${payload.candidate_id}|${payload.entry_date}`);
      const next = {
        unit_id: unitId,
        candidate_id: payload.candidate_id,
        entry_date: payload.entry_date,
        code: payload.code ?? existing?.code ?? "",
        ot_hours: payload.ot_hours ?? existing?.ot_hours ?? 0,
      };
      const { error } = await supabase
        .from("attendance_entries")
        .upsert(next, { onConflict: "unit_id,candidate_id,entry_date" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance-entries", unitId, monthStart, monthEnd] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  const dateFor = (day: number) => {
    const m = String(monthIdx + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${year}-${m}-${d}`;
  };

  // Drag-to-select state
  const [dragCandidateId, setDragCandidateId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCandidateId, setPickerCandidateId] = useState<string | null>(null);
  const [pickerDates, setPickerDates] = useState<string[]>([]);

  // Track whether the current mousedown turned into an actual drag across
  // multiple cells. A plain click (no drag, no modifier) should open the
  // picker immediately for that single cell. Ctrl/Cmd+click toggles cells
  // into a persistent selection without opening the picker.
  const [dragMoved, setDragMoved] = useState(false);

  useEffect(() => {
    if (!isDragging) return;
    const onUp = () => {
      setIsDragging(false);
      if (dragMoved) {
        setSelectedDates((current) => {
          if (current.size > 0 && dragCandidateId) {
            const sorted = Array.from(current).sort();
            setPickerCandidateId(dragCandidateId);
            setPickerDates(sorted);
            setPickerOpen(true);
            return new Set();
          }
          return current;
        });
        setDragCandidateId(null);
      }
      setDragMoved(false);
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [isDragging, dragCandidateId, dragMoved]);

  const openPickerForSelection = () => {
    if (!dragCandidateId || selectedDates.size === 0) return;
    setPickerCandidateId(dragCandidateId);
    setPickerDates(Array.from(selectedDates).sort());
    setPickerOpen(true);
  };

  const clearSelection = () => {
    setSelectedDates(new Set());
    setDragCandidateId(null);
  };

  const applyCodeToSelection = async (code: string) => {
    if (!pickerCandidateId) return;
    try {
      const rows = pickerDates.map((d) => ({
        unit_id: unitId,
        candidate_id: pickerCandidateId,
        entry_date: d,
        code,
        ot_hours: entryMap.get(`${pickerCandidateId}|${d}`)?.ot_hours ?? 0,
      }));
      const { error } = await supabase
        .from("attendance_entries")
        .upsert(rows, { onConflict: "unit_id,candidate_id,entry_date" });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["attendance-entries", unitId, monthStart, monthEnd] });
      setPickerOpen(false);
      setSelectedDates(new Set());
      setDragCandidateId(null);
      toast.success(`Applied ${code || "Clear"} to ${pickerDates.length} day${pickerDates.length > 1 ? "s" : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  };



  const computeTotals = (candidateId: string) => {
    let pDays = 0;
    let otHours = 0;
    let paidDays = 0;
    for (const day of dayList) {
      const e = entryMap.get(`${candidateId}|${dateFor(day)}`);
      if (!e) continue;
      otHours += Number(e.ot_hours) || 0;
      const c = codeMap.get(e.code);
      if (!c) continue;
      if (c.counts_as_present) pDays += 1;
      if (c.is_paid) paidDays += 1;
    }
    return { pDays, otHours, tDays: pDays + paidDays };
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
        ]
          .filter(Boolean)
          .join(", "),
      ]
        .filter((v) => v && String(v).trim())
        .join(", ")
    : "";

  const monthLabel = `${MONTH_NAMES[monthIdx]} ${year}`;

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
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((m, i) => (
                <SelectItem key={m} value={String(i)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[year - 2, year - 1, year, year + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
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

      {/* Muster Roll Sheet */}
      <div id="form-xvi-print" className="rounded-xl border border-border/60 bg-white p-5 text-[11px] text-slate-900 shadow-sm print:rounded-none print:border-0 print:shadow-none sm:p-6">

        {/* Header */}
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
              </td>
            </tr>
          </tbody>
        </table>

        {/* Roster */}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse border border-slate-400 text-center text-[10px]">
            <thead className="bg-slate-100">
              <tr>
                <th className="border border-slate-400 p-1 align-middle">Sl.<br />No.</th>
                <th className="border border-slate-400 p-1 align-middle">Emp ID</th>
                <th className="border border-slate-400 p-1 text-left align-middle">Employee Name</th>
                <th className="border border-slate-400 p-1 text-left align-middle">Designation</th>
                <th className="border border-slate-400 p-1 align-middle">DOJ</th>
                <th
                  className="border border-slate-400 p-1 align-middle"
                  colSpan={dayCount}
                >
                  Days
                </th>
                <th className="border border-slate-400 p-1 align-middle">P<br />Days</th>
                <th className="border border-slate-400 p-1 align-middle">OT</th>
                <th className="border border-slate-400 p-1 align-middle">T<br />Days</th>
                <th className="border border-slate-400 p-1 align-middle">Remarks</th>
              </tr>
              <tr className="bg-slate-50">
                <th className="border border-slate-400 p-1"></th>
                <th className="border border-slate-400 p-1"></th>
                <th className="border border-slate-400 p-1"></th>
                <th className="border border-slate-400 p-1"></th>
                <th className="border border-slate-400 p-1"></th>
                {dayList.map((d) => (
                  <th
                    key={d}
                    className="border border-slate-400 p-0.5 text-[9px] font-medium"
                    style={{ minWidth: 18 }}
                  >
                    {d}
                  </th>
                ))}
                <th className="border border-slate-400 p-1"></th>
                <th className="border border-slate-400 p-1"></th>
                <th className="border border-slate-400 p-1"></th>
                <th className="border border-slate-400 p-1"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9 + dayCount} className="p-4 text-slate-500">
                    Loading roster…
                  </td>
                </tr>
              ) : rosterError ? (
                <tr>
                  <td colSpan={9 + dayCount} className="p-6 text-red-600">
                    Failed to load mapped employees for this unit.
                  </td>
                </tr>
              ) : (employees ?? []).length === 0 ? (
                <tr>
                  <td colSpan={9 + dayCount} className="p-6 text-slate-500">
                    No active security guards are mapped to this unit.
                  </td>
                </tr>
              ) : (
                (employees ?? []).flatMap((emp, idx) => {
                  const rowBase = "border border-slate-400 align-middle";
                  const totals = computeTotals(emp.id);
                  return [
                    <tr key={emp.id + "-att"}>
                      <td className={cn(rowBase, "p-1 font-medium")} rowSpan={2}>
                        {idx + 1}
                      </td>
                      <td className={cn(rowBase, "p-1")} rowSpan={2}>
                        {emp.employee_code || "—"}
                      </td>
                      <td className={cn(rowBase, "p-1 text-left")} rowSpan={2}>
                        {emp.full_name || "—"}
                      </td>
                      <td className={cn(rowBase, "p-1 text-left")} rowSpan={2}>
                        {emp.designation || "—"}
                      </td>
                      <td className={cn(rowBase, "p-1")} rowSpan={2}>
                        {emp.doj ? new Date(emp.doj).toLocaleDateString("en-GB") : "—"}
                      </td>
                      {dayList.map((d) => {
                        const date = dateFor(d);
                        const entry = entryMap.get(`${emp.id}|${date}`);
                        const codeMeta = entry?.code ? codeMap.get(entry.code) : undefined;
                        const isSelected =
                          dragCandidateId === emp.id && selectedDates.has(date);
                        return (
                          <td
                            key={`a-${d}`}
                            className={cn(
                              rowBase,
                              "p-0 print:bg-transparent select-none cursor-pointer",
                              isSelected && "ring-2 ring-primary ring-inset",
                            )}
                            style={{
                              height: 22,
                              minWidth: 18,
                              backgroundColor: codeMeta?.color ? `${codeMeta.color}22` : undefined,
                            }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              const additive = e.ctrlKey || e.metaKey;
                              if (additive) {
                                // Ctrl/Cmd+click: toggle this cell into the
                                // persistent selection (scoped to one row).
                                setSelectedDates((prev) => {
                                  const sameRow = dragCandidateId === emp.id;
                                  const next = sameRow ? new Set(prev) : new Set<string>();
                                  if (sameRow && next.has(date)) next.delete(date);
                                  else next.add(date);
                                  return next;
                                });
                                setDragCandidateId(emp.id);
                                return;
                              }
                              // Plain click: start a fresh drag selection.
                              setDragCandidateId(emp.id);
                              setIsDragging(true);
                              setDragMoved(false);
                              setSelectedDates(new Set([date]));
                            }}
                            onMouseEnter={() => {
                              if (isDragging && dragCandidateId === emp.id) {
                                setSelectedDates((prev) => {
                                  if (prev.has(date)) return prev;
                                  const next = new Set(prev);
                                  next.add(date);
                                  setDragMoved(true);
                                  return next;
                                });
                              }
                            }}
                            onClick={(e) => {
                              // Plain single click (no drag, no modifier) → open picker for this one cell.
                              if (e.ctrlKey || e.metaKey || dragMoved) return;
                              setPickerCandidateId(emp.id);
                              setPickerDates([date]);
                              setSelectedDates(new Set());
                              setDragCandidateId(null);
                              setPickerOpen(true);
                            }}
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

                      <td className={cn(rowBase, "p-1 font-semibold")} rowSpan={2}>{totals.pDays}</td>
                      <td className={cn(rowBase, "p-1 font-semibold")} rowSpan={2}>{totals.otHours}</td>
                      <td className={cn(rowBase, "p-1 font-semibold")} rowSpan={2}>{totals.tDays}</td>
                      <td className={cn(rowBase, "p-1")} rowSpan={2}></td>
                    </tr>,
                    <tr key={emp.id + "-ot"}>
                      {dayList.map((d) => (
                        <td
                          key={`o-${d}`}
                          className={cn(rowBase, "p-0")}
                          style={{ height: 22, minWidth: 18 }}
                        />
                      ))}
                    </tr>,
                  ];
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-[10px] text-slate-600">
          Att = Attendance · OT = Overtime hours
        </div>
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark attendance</DialogTitle>
            <DialogDescription>
              {pickerDates.length} day{pickerDates.length > 1 ? "s" : ""} selected
              {pickerCandidateId
                ? ` for ${(employees ?? []).find((e) => e.id === pickerCandidateId)?.full_name ?? ""}`
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
    </div>
  );
}

