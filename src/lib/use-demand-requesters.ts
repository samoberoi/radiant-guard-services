import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DemandRequesterInfo = {
  demandNumber: string;
  requesterName: string;
  requesterRole: string;
  requesterCode: string | null;
};

/**
 * Given a list of demand ids, returns a Map<demand_id, info> with the
 * demand number plus its requester (candidate full_name + role + employee code).
 * Used to render "Requested By" alongside any downstream document
 * (transfer, issuance, delivery challan) that points at a demand.
 */
export function useDemandRequesters(demandIds: (string | null | undefined)[]) {
  const ids = useMemo(
    () => Array.from(new Set(demandIds.filter((x): x is string => !!x))).sort(),
    [demandIds],
  );

  const { data: demands = [] } = useQuery({
    queryKey: ["inv", "demand-requester-lookup", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inv_demands" as never)
        .select("id,demand_number,requester_candidate_id")
        .in("id", ids);
      if (error) throw error;
      return (data as unknown as { id: string; demand_number: string; requester_candidate_id: string | null }[]) ?? [];
    },
  });

  const candidateIds = useMemo(
    () => Array.from(new Set(demands.map((d) => d.requester_candidate_id).filter((x): x is string => !!x))).sort(),
    [demands],
  );

  const { data: candidates = [] } = useQuery({
    queryKey: ["inv", "demand-requester-candidates", candidateIds.join(",")],
    enabled: candidateIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidates" as never)
        .select("id,full_name,role_key,employee_code")
        .in("id", candidateIds);
      if (error) throw error;
      return (data as unknown as { id: string; full_name: string; role_key: string; employee_code: string | null }[]) ?? [];
    },
  });

  return useMemo(() => {
    const cMap = new Map(candidates.map((c) => [c.id, c]));
    const out = new Map<string, DemandRequesterInfo>();
    for (const d of demands) {
      const c = d.requester_candidate_id ? cMap.get(d.requester_candidate_id) : null;
      out.set(d.id, {
        demandNumber: d.demand_number,
        requesterName: c?.full_name ?? "—",
        requesterRole: (c?.role_key ?? "").replace(/_/g, " "),
        requesterCode: c?.employee_code ?? null,
      });
    }
    return out;
  }, [demands, candidates]);
}
