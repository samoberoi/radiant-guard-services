import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PincodeRange = {
  state: string;
  region_label: string;
  range_start: number;
  range_end: number;
  is_excluded: boolean;
};

export type PtSlab = {
  id: string;
  state: string;
  region_label: string;
  pincode_coverage: string;
  salary_min: number;
  salary_max: number | null;
  tax_per_month: number;
  gender: string;
  working_days: string;
  period: string;
};

const norm = (s: string) =>
  s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

export function usePincodeRanges() {
  return useQuery({
    queryKey: ["pincode_ranges"],
    queryFn: async (): Promise<PincodeRange[]> => {
      const { data, error } = await supabase
        .from("pincode_ranges")
        .select("state, region_label, range_start, range_end, is_excluded");
      if (error) throw error;
      return (data ?? []) as PincodeRange[];
    },
  });
}

export function usePtSlabs() {
  return useQuery({
    queryKey: ["pt_slabs"],
    queryFn: async (): Promise<PtSlab[]> => {
      const { data, error } = await supabase
        .from("professional_tax_slabs")
        .select("*")
        .order("salary_min");
      if (error) throw error;
      return (data ?? []) as PtSlab[];
    },
  });
}

export type PtResolution =
  | { kind: "no_pincode" }
  | { kind: "invalid" }
  | { kind: "no_match"; pincode: number }
  | { kind: "match"; pincode: number; state: string; regionLabel: string; slabs: PtSlab[] };

export function resolvePt(
  pincodeStr: string,
  ranges: PincodeRange[],
  slabs: PtSlab[],
): PtResolution {
  if (!pincodeStr.trim()) return { kind: "no_pincode" };
  const pin = parseInt(pincodeStr.trim(), 10);
  if (!Number.isFinite(pin) || pincodeStr.trim().length !== 6) return { kind: "invalid" };

  const containing = ranges.filter((r) => pin >= r.range_start && pin <= r.range_end);
  if (containing.length === 0) return { kind: "no_match", pincode: pin };

  // Group by state. Find regions excluded for this pincode.
  const candidates: Array<{ state: string; region_label: string; span: number }> = [];
  for (const r of containing) {
    if (r.is_excluded) continue; // exclusion marker
    // Check if there's an is_excluded=true row in same state+region matching this pin
    const isExcluded = containing.some(
      (x) =>
        x.is_excluded &&
        norm(x.state) === norm(r.state) &&
        norm(x.region_label) === norm(r.region_label),
    );
    if (isExcluded) continue;
    candidates.push({ state: r.state, region_label: r.region_label, span: r.range_end - r.range_start });
  }
  if (candidates.length === 0) return { kind: "no_match", pincode: pin };
  // Most specific = smallest span
  candidates.sort((a, b) => a.span - b.span);
  const pick = candidates[0];

  const matched = slabs.filter(
    (s) => norm(s.state) === norm(pick.state) && norm(s.region_label) === norm(pick.region_label),
  );
  return {
    kind: "match",
    pincode: pin,
    state: pick.state,
    regionLabel: pick.region_label,
    slabs: matched,
  };
}
