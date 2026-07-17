import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUserRole } from "@/lib/use-current-user-role";
import { useFieldOfficerUnitScope } from "@/lib/use-fo-unit-scope";
import { useUserBranchScope } from "@/lib/use-user-branch-scope";

export type InsightPerson = {
  id: string;
  full_name: string;
  photo_url: string | null;
  mobile: string | null;
  date_of_birth: string | null;
  approved_at: string | null;
  created_at: string | null;
  unit_id: string | null;
  unit_name?: string;
  designation_id: string | null;
  designation_name?: string;
};

export type BirthdayEntry = InsightPerson & { daysUntil: number; nextDate: Date; turningAge: number };
export type AnniversaryEntry = InsightPerson & { daysUntil: number; nextDate: Date; years: number };
export type SixtyPlusEntry = InsightPerson & { age: number };

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function ageFrom(dob: string): number {
  const b = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

/** Next occurrence of the month/day of `date` on or after today. */
export function nextOccurrence(date: string): { next: Date; days: number } {
  const d = new Date(date);
  const today = startOfDay(new Date());
  let candidate = new Date(today.getFullYear(), d.getMonth(), d.getDate());
  if (candidate < today) candidate = new Date(today.getFullYear() + 1, d.getMonth(), d.getDate());
  const days = Math.round((candidate.getTime() - today.getTime()) / 86400000);
  return { next: candidate, days };
}

export function yearsBetween(from: string, to: Date): number {
  const f = new Date(from);
  let years = to.getFullYear() - f.getFullYear();
  const m = to.getMonth() - f.getMonth();
  if (m < 0 || (m === 0 && to.getDate() < f.getDate())) years--;
  return Math.max(0, years);
}

const HORIZON_DAYS = 30;

type Row = {
  id: string;
  full_name: string;
  photo_url: string | null;
  mobile: string | null;
  date_of_birth: string | null;
  approved_at: string | null;
  created_at: string | null;
  unit_id: string | null;
  designation_id: string | null;
  status: string | null;
};

export function usePeopleInsights() {
  const { isSuperAdmin, roleKey, isFieldOfficer, isBranchManager } = useCurrentUserRole();
  const foScope = useFieldOfficerUnitScope();
  const branchScope = useUserBranchScope();

  const canAll = isSuperAdmin || roleKey === "leadership" || roleKey === "hr" || roleKey === "admin";
  const showSixtyPlus = isSuperAdmin || roleKey === "leadership";

  const enabled =
    canAll ||
    (isBranchManager && !branchScope.isLoading) ||
    (isFieldOfficer && !foScope.isLoading);

  const q = useQuery({
    queryKey: [
      "people-insights",
      { canAll, isBranchManager, isFieldOfficer, foUnits: Array.from(foScope.unitIds), branches: branchScope.branchIds },
    ],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      let query = supabase
        .from("candidates")
        .select("id,full_name,photo_url,mobile,date_of_birth,approved_at,created_at,unit_id,designation_id,status")
        .in("status", ["approved", "active"])
        .not("date_of_birth", "is", null);

      if (!canAll) {
        if (isFieldOfficer) {
          const ids = Array.from(foScope.unitIds);
          if (ids.length === 0) return { rows: [] as Row[], unitNameById: new Map<string, string>(), desigNameById: new Map<string, string>() };
          query = query.in("unit_id", ids);
        } else if (isBranchManager) {
          const branchIds = branchScope.branchIds;
          if (!branchIds.length) return { rows: [] as Row[], unitNameById: new Map<string, string>(), desigNameById: new Map<string, string>() };
          const { data: unitsInBranch } = await supabase
            .from("units")
            .select("id")
            .in("branch_id", branchIds);
          const uIds = ((unitsInBranch as unknown) as Array<{ id: string }> ?? []).map((u) => u.id);
          if (!uIds.length) return { rows: [] as Row[], unitNameById: new Map<string, string>(), desigNameById: new Map<string, string>() };
          query = query.in("unit_id", uIds);
        } else {
          return { rows: [] as Row[], unitNameById: new Map<string, string>(), desigNameById: new Map<string, string>() };
        }
      }

      const { data, error } = await query.limit(5000);
      if (error) throw error;
      const rows = ((data as unknown) as Row[]) ?? [];

      const unitIds = Array.from(new Set(rows.map((r) => r.unit_id).filter(Boolean))) as string[];
      const desigIds = Array.from(new Set(rows.map((r) => r.designation_id).filter(Boolean))) as string[];
      const [{ data: units }, { data: desigs }] = await Promise.all([
        unitIds.length
          ? supabase.from("units").select("id,name,code").in("id", unitIds)
          : Promise.resolve({ data: [] as Array<{ id: string; name: string; code: string }> }),
        desigIds.length
          ? supabase.from("designations").select("id,name").in("id", desigIds)
          : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      ]);
      const unitNameById = new Map(
        (((units as unknown) as Array<{ id: string; name: string; code: string }>) ?? []).map((u) => [u.id, u.name || u.code]),
      );
      const desigNameById = new Map(
        (((desigs as unknown) as Array<{ id: string; name: string }>) ?? []).map((d) => [d.id, d.name]),
      );
      return { rows, unitNameById, desigNameById };
    },
  });

  const derived = useMemo(() => {
    const rows = q.data?.rows ?? [];
    const unitNameById = q.data?.unitNameById ?? new Map<string, string>();
    const desigNameById = q.data?.desigNameById ?? new Map<string, string>();

    const enrich = (r: Row): InsightPerson => ({
      ...r,
      unit_name: r.unit_id ? unitNameById.get(r.unit_id) ?? "" : "",
      designation_name: r.designation_id ? desigNameById.get(r.designation_id) ?? "" : "",
    });

    const birthdays: BirthdayEntry[] = [];
    const anniversaries: AnniversaryEntry[] = [];
    const sixtyPlus: SixtyPlusEntry[] = [];

    for (const r of rows) {
      const p = enrich(r);
      if (r.date_of_birth) {
        const { next, days } = nextOccurrence(r.date_of_birth);
        if (days <= HORIZON_DAYS) {
          birthdays.push({ ...p, daysUntil: days, nextDate: next, turningAge: yearsBetween(r.date_of_birth, next) });
        }
        const age = ageFrom(r.date_of_birth);
        if (age >= 60) sixtyPlus.push({ ...p, age });
      }
      const startedAt = r.approved_at || r.created_at;
      if (startedAt) {
        const { next, days } = nextOccurrence(startedAt);
        const years = yearsBetween(startedAt, next);
        if (days <= HORIZON_DAYS && years >= 1) {
          anniversaries.push({ ...p, daysUntil: days, nextDate: next, years });
        }
      }
    }

    birthdays.sort((a, b) => a.daysUntil - b.daysUntil || a.full_name.localeCompare(b.full_name));
    anniversaries.sort((a, b) => a.daysUntil - b.daysUntil || b.years - a.years);
    sixtyPlus.sort((a, b) => b.age - a.age || a.full_name.localeCompare(b.full_name));

    return { birthdays, anniversaries, sixtyPlus };
  }, [q.data]);

  return {
    isLoading: q.isLoading,
    showSixtyPlus,
    birthdays: derived.birthdays,
    anniversaries: derived.anniversaries,
    sixtyPlus: derived.sixtyPlus,
  };
}
