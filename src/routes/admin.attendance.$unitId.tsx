import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Printer, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/attendance/$unitId")({
  component: MusterRollPage,
});

const SERVICE_PROVIDER = {
  name: "Radiant Guard Services Private Limited",
  address: "Office No. 818, 8th Floor, Clover Hills Plaza, NIBM Road, Pune. 411048",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const ATTENDANCE_EMPLOYEE_STATUSES = ["approved", "active", "inactive"] as const;

function daysInMonth(year: number, monthIdx0: number) {
  return new Date(year, monthIdx0 + 1, 0).getDate();
}

function MusterRollPage() {
  const { unitId } = Route.useParams();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIdx, setMonthIdx] = useState(now.getMonth()); // 0-based

  const { data: unit } = useQuery({
    queryKey: ["attendance-unit", unitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units")
        .select("id, code, name, customer_id")
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
    queryKey: ["attendance-roster-v2", unitId],
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
      const { data: links, error: linksError } = await supabase
        .from("candidate_units")
        .select("candidate_id")
        .eq("unit_id", unitId);
      if (linksError) throw linksError;

      const linkIds = (links ?? []).map((l) => l.candidate_id);
      let extra: typeof prim = [];
      if (linkIds.length) {
        const { data, error } = await supabase
          .from("candidates")
          .select(rosterSelect)
          .in("id", linkIds)
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

      return dedup
        .map((c) => ({
          id: c.id,
          employee_code: c.employee_code || "",
          full_name: c.full_name || "",
          designation: (c.designation_id && dMap.get(c.designation_id)) || "",
          doj: c.preferred_joining_date || "",
        }))
        .sort((a, b) =>
          (a.employee_code || a.full_name).localeCompare(b.employee_code || b.full_name),
        );
    },
  });

  const dayCount = daysInMonth(year, monthIdx);
  const dayList = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => i + 1),
    [dayCount],
  );

  const principalEmployer = unit
    ? `${unit.customer_name || ""}${unit.code ? ` - ${unit.code}` : ""}`.trim()
    : "—";

  const monthLabel = `${MONTH_NAMES[monthIdx]} ${year}`;

  return (
    <div className="space-y-4 p-4 sm:p-6">
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
      <div className="rounded-xl border border-border/60 bg-white p-5 text-[11px] text-slate-900 shadow-sm print:rounded-none print:border-0 print:shadow-none sm:p-6">
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
                    No enabled employees are mapped to this unit.
                  </td>
                </tr>
              ) : (
                (employees ?? []).flatMap((emp, idx) => {
                  const rowBase = "border border-slate-400 align-middle";
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
                      {dayList.map((d) => (
                        <td
                          key={`a-${d}`}
                          className={cn(rowBase, "p-0")}
                          style={{ height: 22, minWidth: 18 }}
                        ></td>
                      ))}
                      <td className={cn(rowBase, "p-1")} rowSpan={2}></td>
                      <td className={cn(rowBase, "p-1")} rowSpan={2}></td>
                      <td className={cn(rowBase, "p-1")} rowSpan={2}></td>
                      <td className={cn(rowBase, "p-1")} rowSpan={2}></td>
                    </tr>,
                    <tr key={emp.id + "-ot"}>
                      {dayList.map((d) => (
                        <td
                          key={`o-${d}`}
                          className={cn(rowBase, "p-0")}
                          style={{ height: 22, minWidth: 18 }}
                        ></td>
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
    </div>
  );
}
