import { supabase } from "@/integrations/supabase/client";

export type AttendanceEntryFetchRow = {
  unit_id?: string;
  candidate_id: string;
  designation_id: string | null;
  entry_date: string;
  code: string;
  ot_hours: number | string | null;
};

function eachIsoDate(start: string, end: string): string[] {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const cursor = new Date(Date.UTC(sy, sm - 1, sd));
  const stop = new Date(Date.UTC(ey, em - 1, ed));
  const out: string[] = [];

  while (cursor <= stop) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return out;
}

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

  for (const date of eachIsoDate(params.start, params.end)) {
    for (let from = 0; ; from += pageSize) {
      let query = supabase
        .from("attendance_entries")
        .select(selectCols)
        .eq("entry_date", date)
        .range(from, from + pageSize - 1);

      query = params.unitId ? query.eq("unit_id", params.unitId) : query.in("unit_id", unitIds);

      const { data, error } = await query;
      if (error) throw error;

      const page = (data ?? []) as AttendanceEntryFetchRow[];
      rows.push(...page);
      if (page.length < pageSize) break;
    }
  }

  return rows;
}