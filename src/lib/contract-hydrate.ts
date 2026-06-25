// Hydrate contract_resources JSONB lines with the latest formula_mode /
// formula_expression / formula_version from the Control Center masters
// (allowance_types, cost_components) by allowanceId / costComponentId.
//
// Why: contract_resources are a snapshot of monetary amounts and base
// configuration, but the FORMULA itself should always evaluate against the
// latest master so that "change the formula in Allowance Manager → payroll
// recalculates" works without re-saving every contract.
//
// Used by Payroll detail and Invoice/Paysheet routes right after the raw
// resources are loaded and before computeWages runs.

import { supabase } from "@/integrations/supabase/client";

type LineWithIds = {
  name: string;
  amount: number | string | null;
  allowanceId?: string | null;
  costComponentId?: string | null;
  formulaMode?: string | null;
  formulaExpression?: string | null;
  formulaVersion?: number | null;
  [k: string]: unknown;
};

type ResourceShape = {
  components: LineWithIds[];
  benefits?: LineWithIds[];
  deductions?: LineWithIds[];
  employerContributions?: LineWithIds[];
  [k: string]: unknown;
};

type ResourceShape = {
  components: LineWithIds[];
  benefits?: LineWithIds[];
  deductions?: LineWithIds[];
  employerContributions?: LineWithIds[];
};

export async function hydrateFormulasFromMaster<T extends ResourceShape>(
  resources: T[],
): Promise<T[]> {
  if (!resources.length) return resources;

  const allowanceIds = new Set<string>();
  const costIds = new Set<string>();
  for (const r of resources) {
    for (const c of r.components ?? []) {
      if (c.allowanceId) allowanceIds.add(String(c.allowanceId));
    }
    for (const list of [r.benefits ?? [], r.deductions ?? [], r.employerContributions ?? []]) {
      for (const it of list) {
        if (it.allowanceId) allowanceIds.add(String(it.allowanceId));
        if (it.costComponentId && !String(it.costComponentId).startsWith("__")) {
          costIds.add(String(it.costComponentId));
        }
      }
    }
  }

  type Master = { mode: string | null; expr: string | null; version: number | null };
  const masterById = new Map<string, Master>();

  if (allowanceIds.size > 0) {
    const { data } = await supabase
      .from("allowance_types")
      .select("id, formula_mode, formula_expression, formula_version")
      .in("id", Array.from(allowanceIds));
    for (const m of (data ?? []) as Array<{ id: string; formula_mode: string | null; formula_expression: string | null; formula_version: number | null }>) {
      masterById.set(String(m.id), {
        mode: m.formula_mode,
        expr: m.formula_expression,
        version: m.formula_version,
      });
    }
  }
  if (costIds.size > 0) {
    const { data } = await supabase
      .from("cost_components")
      .select("id, formula_mode, formula_expression, formula_version")
      .in("id", Array.from(costIds));
    for (const m of (data ?? []) as Array<{ id: string; formula_mode: string | null; formula_expression: string | null; formula_version: number | null }>) {
      masterById.set(String(m.id), {
        mode: m.formula_mode,
        expr: m.formula_expression,
        version: m.formula_version,
      });
    }
  }

  const overlay = (line: LineWithIds): LineWithIds => {
    const id = line.allowanceId ?? line.costComponentId;
    if (!id) return line;
    const m = masterById.get(String(id));
    if (!m || !m.expr || !m.expr.trim()) return line;
    return {
      ...line,
      formulaMode: m.mode,
      formulaExpression: m.expr,
      formulaVersion: m.version,
    };
  };

  return resources.map((r) => ({
    ...r,
    components: (r.components ?? []).map(overlay),
    benefits: (r.benefits ?? []).map(overlay),
    deductions: (r.deductions ?? []).map(overlay),
    employerContributions: (r.employerContributions ?? []).map(overlay),
  })) as T[];
}
