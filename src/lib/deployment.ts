import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ScopeType = "state" | "customer" | "branch" | "unit";

export type ScopeAssignment = {
  id: string;
  candidate_id: string;
  scope_type: ScopeType;
  scope_id: string;
  scope_label: string;
};

export type EmployeeLite = {
  id: string;
  full_name: string;
  employee_code: string;
  photo_url: string;
  role_key: string;
  unit_id: string | null;
  reports_to: string | null;
  is_enabled: boolean;
  status: string;
};

export const QK_SCOPE_ASSIGNMENTS = ["admin", "employee_scope_assignments"] as const;
export const QK_EMPLOYEES_LITE = ["admin", "employees-lite"] as const;

export function useScopeAssignments() {
  return useQuery({
    queryKey: QK_SCOPE_ASSIGNMENTS,
    staleTime: 30_000,
    queryFn: async (): Promise<ScopeAssignment[]> => {
      const { data, error } = await supabase
        .from("employee_scope_assignments" as never)
        .select("id,candidate_id,scope_type,scope_id,scope_label")
        .limit(5000);
      if (error) throw error;
      return ((data as unknown) as ScopeAssignment[]) ?? [];
    },
  });
}

export function useEmployeesLite() {
  return useQuery({
    queryKey: QK_EMPLOYEES_LITE,
    staleTime: 30_000,
    queryFn: async (): Promise<EmployeeLite[]> => {
      const { data, error } = await supabase
        .from("candidates" as never)
        .select("id,full_name,employee_code,photo_url,role_key,unit_id,reports_to,is_enabled,status")
        .in("status", ["approved", "active"])
        .limit(2000);
      if (error) throw error;
      return ((data as unknown) as EmployeeLite[]) ?? [];
    },
  });
}

export type CandidateUnit = { candidate_id: string; unit_id: string; is_primary: boolean };
export const QK_CANDIDATE_UNITS = ["admin", "candidate_units"] as const;

export function useCandidateUnits() {
  return useQuery({
    queryKey: QK_CANDIDATE_UNITS,
    staleTime: 30_000,
    queryFn: async (): Promise<CandidateUnit[]> => {
      const { data, error } = await supabase
        .from("candidate_units" as never)
        .select("candidate_id,unit_id,is_primary")
        .limit(5000);
      if (error) throw error;
      return ((data as unknown) as CandidateUnit[]) ?? [];
    },
  });
}


export type UnitContext = {
  id: string;
  branch_id: string | null;
  customer_id: string | null;
  state_name: string; // billing state name
};

export function resolveFieldManagersForUnit(
  unit: UnitContext,
  assignments: ScopeAssignment[],
  employees: EmployeeLite[],
  candidateUnits: CandidateUnit[] = [],
): Array<{ fm: EmployeeLite; sources: ScopeType[] }> {
  const fmIndex = new Map<string, Set<ScopeType>>();
  for (const a of assignments) {
    let match: ScopeType | null = null;
    if (a.scope_type === "unit" && a.scope_id === unit.id) match = "unit";
    else if (a.scope_type === "branch" && unit.branch_id && a.scope_id === unit.branch_id) match = "branch";
    else if (a.scope_type === "customer" && unit.customer_id && a.scope_id === unit.customer_id) match = "customer";
    else if (a.scope_type === "state" && unit.state_name && a.scope_id === unit.state_name) match = "state";
    if (!match) continue;
    if (!fmIndex.has(a.candidate_id)) fmIndex.set(a.candidate_id, new Set());
    fmIndex.get(a.candidate_id)!.add(match);
  }
  // Also treat direct candidate_units mappings as a "unit" scope source.
  for (const cu of candidateUnits) {
    if (cu.unit_id !== unit.id) continue;
    if (!fmIndex.has(cu.candidate_id)) fmIndex.set(cu.candidate_id, new Set());
    fmIndex.get(cu.candidate_id)!.add("unit");
  }
  const out: Array<{ fm: EmployeeLite; sources: ScopeType[] }> = [];
  for (const [cid, sources] of fmIndex) {
    const fm = employees.find((e) => e.id === cid);
    if (!fm || fm.role_key !== "field_manager") continue;
    out.push({ fm, sources: Array.from(sources) });
  }
  return out.sort((a, b) => a.fm.full_name.localeCompare(b.fm.full_name));
}

export function resolveGuardsForUnit(
  unit: UnitContext,
  employees: EmployeeLite[],
  assignments: ScopeAssignment[],
  candidateUnits: CandidateUnit[] = [],
): EmployeeLite[] {
  const guardIdsFromAssign = new Set(
    assignments.filter((a) => a.scope_type === "unit" && a.scope_id === unit.id).map((a) => a.candidate_id),
  );
  const guardIdsFromCU = new Set(
    candidateUnits.filter((c) => c.unit_id === unit.id).map((c) => c.candidate_id),
  );
  return employees.filter(
    (e) =>
      e.role_key === "guard" &&
      (e.unit_id === unit.id || guardIdsFromAssign.has(e.id) || guardIdsFromCU.has(e.id)),
  );
}


export const SCOPE_TYPE_LABEL: Record<ScopeType, string> = {
  state: "State",
  customer: "Organization",
  branch: "Branch",
  unit: "Unit",
};
