import { supabase } from "@/integrations/supabase/client";

export type AttendanceEntryFetchRow = {
  unit_id?: string;
  candidate_id: string;
  designation_id: string | null;
  entry_date: string;
  code: string;
  ot_hours: number | string | null;
};

export async function fetchAttendanceEntriesForPeriod(params: {
  unitId?: string;
  unitIds?: string[];
  start: string;
  end: string;
  includeUnitId?: boolean;
}): Promise<AttendanceEntryFetchRow[]> {
  const unitIds = params.unitId ? [params.unitId] : Array.from(new Set(params.unitIds ?? []));
  if (unitIds.length === 0) return [];

  const pageSize = 1000;
  const rows: AttendanceEntryFetchRow[] = [];
  const selectCols = `${params.includeUnitId ? "unit_id, " : ""}candidate_id, designation_id, entry_date, code, ot_hours`;

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("attendance_entries")
      .select(selectCols)
      .gte("entry_date", params.start)
      .lte("entry_date", params.end)
      .order("entry_date", { ascending: true })
      .range(from, from + pageSize - 1);

    query = params.unitId ? query.eq("unit_id", params.unitId) : query.in("unit_id", unitIds);

    const { data, error } = await query;
    if (error) throw error;

    const page = ((data ?? []) as unknown) as AttendanceEntryFetchRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}
