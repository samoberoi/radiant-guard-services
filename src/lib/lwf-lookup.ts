import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePincodeRanges, type PincodeRange } from "@/lib/pt-lookup";

export type LwfRow = {
  id: string;
  state: string;
  deduction_months: number[];
  frequency: string;
  employee_contribution: number;
  employer_contribution: number;
  enabled: boolean;
  notes: string;
};

const norm = (s: string) =>
  s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

export function useLwfRows() {
  return useQuery({
    queryKey: ["labour_welfare_funds"],
    queryFn: async (): Promise<LwfRow[]> => {
      const { data, error } = await supabase
        .from("labour_welfare_funds")
        .select("*")
        .order("state");
      if (error) throw error;
      return (data ?? []) as LwfRow[];
    },
  });
}

export function useLwfPincodeData() {
  const r = usePincodeRanges();
  const l = useLwfRows();
  return { ranges: r.data, lwf: l.data, isLoading: r.isLoading || l.isLoading };
}

export type LwfResolution =
  | { kind: "no_pincode" }
  | { kind: "invalid" }
  | { kind: "no_state"; pincode: number }
  | { kind: "no_lwf"; pincode: number; state: string }
  | { kind: "match"; pincode: number; state: string; lwf: LwfRow };

export function resolveLwf(
  pincodeStr: string,
  ranges: PincodeRange[],
  lwfRows: LwfRow[],
): LwfResolution {
  if (!pincodeStr.trim()) return { kind: "no_pincode" };
  const pin = parseInt(pincodeStr.trim(), 10);
  if (!Number.isFinite(pin) || pincodeStr.trim().length !== 6) return { kind: "invalid" };

  const containing = ranges.filter((r) => pin >= r.range_start && pin <= r.range_end);
  if (containing.length === 0) return { kind: "no_state", pincode: pin };

  // Pick most specific non-excluded range (smallest span)
  const eligible = containing
    .filter((r) => !r.is_excluded)
    .filter((r) => {
      const isExcluded = containing.some(
        (x) =>
          x.is_excluded &&
          norm(x.state) === norm(r.state) &&
          norm(x.region_label) === norm(r.region_label),
      );
      return !isExcluded;
    })
    .sort((a, b) => a.range_end - a.range_start - (b.range_end - b.range_start));

  if (eligible.length === 0) return { kind: "no_state", pincode: pin };
  const state = eligible[0].state;

  const match = lwfRows.find((l) => norm(l.state) === norm(state));
  if (!match) return { kind: "no_lwf", pincode: pin, state };
  return { kind: "match", pincode: pin, state, lwf: match };
}

export const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
