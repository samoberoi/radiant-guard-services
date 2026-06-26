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

  type Master = {
    mode: string | null;
    expr: string | null;
    version: number | null;
    fixedCalcMethod?: string | null;
    fixedDutyComponents?: string[] | null;
    fixedDutyDivisor?: string | null;
  };
  const masterById = new Map<string, Master>();

  if (allowanceIds.size > 0) {
    const { data } = await supabase
      .from("allowance_types")
      .select("id, formula_mode, formula_expression, formula_version, fixed_calc_method, fixed_duty_components, fixed_duty_divisor")
      .in("id", Array.from(allowanceIds));
    for (const m of (data ?? []) as Array<Record<string, unknown>>) {
      masterById.set(String(m.id), {
        mode: (m.formula_mode as string | null) ?? null,
        expr: (m.formula_expression as string | null) ?? null,
        version: m.formula_version == null ? null : Number(m.formula_version),
        fixedCalcMethod: (m.fixed_calc_method as string | null) ?? null,
        fixedDutyComponents: Array.isArray(m.fixed_duty_components) ? (m.fixed_duty_components as string[]) : null,
        fixedDutyDivisor: (m.fixed_duty_divisor as string | null) ?? null,
      });
    }
  }
  if (costIds.size > 0) {
    const { data } = await supabase
      .from("cost_components")
      .select("id, formula_mode, formula_expression, formula_version, fixed_calc_method, fixed_duty_components, fixed_duty_divisor")
      .in("id", Array.from(costIds));
    for (const m of (data ?? []) as Array<Record<string, unknown>>) {
      masterById.set(String(m.id), {
        mode: (m.formula_mode as string | null) ?? null,
        expr: (m.formula_expression as string | null) ?? null,
        version: m.formula_version == null ? null : Number(m.formula_version),
        fixedCalcMethod: (m.fixed_calc_method as string | null) ?? null,
        fixedDutyComponents: Array.isArray(m.fixed_duty_components) ? (m.fixed_duty_components as string[]) : null,
        fixedDutyDivisor: (m.fixed_duty_divisor as string | null) ?? null,
      });
    }
  }

  const overlay = (line: LineWithIds): LineWithIds => {
    const id = line.allowanceId ?? line.costComponentId;
    if (!id) return line;
    const m = masterById.get(String(id));
    if (!m) return line;
    const next: LineWithIds = { ...line };
    if (m.expr && m.expr.trim()) {
      next.formulaMode = m.mode;
      next.formulaExpression = m.expr;
      next.formulaVersion = m.version;
    }
    if (m.fixedCalcMethod) next.fixedCalcMethod = m.fixedCalcMethod;
    if (m.fixedDutyComponents) next.fixedDutyComponents = m.fixedDutyComponents;
    if (m.fixedDutyDivisor) next.fixedDutyDivisor = m.fixedDutyDivisor;
    return next;
  };

  return resources.map((r) => ({
    ...r,
    components: (r.components ?? []).map(overlay),
    benefits: (r.benefits ?? []).map(overlay),
    deductions: (r.deductions ?? []).map(overlay),
    employerContributions: (r.employerContributions ?? []).map(overlay),
  })) as T[];
}
