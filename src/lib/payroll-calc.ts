// Shared payroll computation helpers used by the Payroll section.
//
// Wage formulas mirror the attendance page derivations: a candidate's earned
// gross for a period is `per-day × T Days`, where per-day is derived from the
// contract resource's monthly gross divided by the configured payroll-day
// base. Percentage deductions/contributions are recalculated from their
// configured contract base components, while fixed statutory rows stay fixed.

export type AttendanceEntryLike = {
  candidate_id: string;
  entry_date: string;
  code: string;
  ot_hours: number | string | null;
};

export type AttendanceCodeLike = {
  code: string;
  counts_as_present: boolean;
  is_paid: boolean;
};

export type AttendanceTotals = {
  pDays: number;
  otHours: number;
  otDays: number;
  phDays: number;
  otherPaidDays: number;
  tDays: number;
};

export const UNIT_DUTY_HOURS = 8;

/**
 * Strip trailing percentage / numeric qualifiers from a component name so
 * variants like "HRA 5%", "HRA 15 %", "HRA (10%)" all collapse to "HRA".
 * Idempotent and safe on names without a suffix.
 */
export function canonicalComponentName(name: string): string {
  const raw = String(name ?? "").trim();
  if (!raw) return raw;
  // Remove trailing "[(]?<num>[%]?[)]?" segments, possibly repeated.
  let out = raw;
  for (let i = 0; i < 3; i++) {
    const next = out
      .replace(/[\s\-_]*[\(\[]?\s*\d+(?:\.\d+)?\s*%\s*[\)\]]?\s*$/g, "")
      .replace(/[\s\-_]+\d+(?:\.\d+)?\s*$/g, "")
      .trim();
    if (next === out) break;
    out = next;
  }
  return out || raw;
}

/**
 * Sum amounts of items whose names canonicalize to the same value.
 * Preserves first-seen order; display name = canonical form.
 */
export function mergeByCanonicalName<T extends { name: string; amount: number | string | null | undefined }>(
  items: T[] | null | undefined,
): { name: string; amount: number }[] {
  if (!items || items.length === 0) return [];
  const map = new Map<string, { name: string; amount: number }>();
  for (const it of items) {
    const key = canonicalComponentName(it.name);
    if (!key) continue;
    const prev = map.get(key);
    if (prev) prev.amount = Math.round((prev.amount + (Number(it.amount) || 0)) * 100) / 100;
    else map.set(key, { name: key, amount: Math.round((Number(it.amount) || 0) * 100) / 100 });
  }
  return Array.from(map.values());
}

export function computeAttendanceTotals(
  candidateId: string,
  periodDates: string[],
  entries: AttendanceEntryLike[],
  codes: AttendanceCodeLike[],
): AttendanceTotals {
  const codeMap = new Map(codes.map((c) => [c.code, c]));
  const entryMap = new Map<string, AttendanceEntryLike>();
  for (const e of entries) {
    if (e.candidate_id === candidateId) entryMap.set(e.entry_date, e);
  }

  let pDays = 0;
  let otHours = 0;
  let phCount = 0;
  let otherPaidDays = 0;

  for (const date of periodDates) {
    const e = entryMap.get(date);
    if (!e) continue;
    otHours += Number(e.ot_hours) || 0;
    const c = codeMap.get(e.code);
    if (!c) continue;
    if (e.code === "PH") {
      phCount += 1;
      continue;
    }
    if (c.counts_as_present) pDays += 1;
    else if (c.is_paid) otherPaidDays += 1;
  }

  const phDays = phCount * 2;
  const otDays = Math.round((otHours / UNIT_DUTY_HOURS) * 100) / 100;
  const tDays = pDays + phDays + otherPaidDays + otDays;
  return { pDays, otHours, otDays, phDays, otherPaidDays, tDays };
}

export type WageComponent = {
  name: string;
  amount: number;
  calcType?: "percentage" | "fixed" | string;
  percentage?: number | string | null;
  baseComponents?: { label: string; operator: "+" | "-" }[];
  capAmount?: number | string | null;
  capFlatAmount?: number | string | null;
};
export type BenefitLike = {
  name: string;
  amount: number | string | null;
  calcType?: "percentage" | "fixed" | string;
  percentage?: number | string | null;
  baseComponents?: { label: string; operator: "+" | "-" }[];
  capAmount?: number | string | null;
  capFlatAmount?: number | string | null;
};

export type ContractResourceLike = {
  designationId: string;
  components: WageComponent[];
  benefits: BenefitLike[];
  deductions: BenefitLike[];
  employerContributions: BenefitLike[];
  payrollDayBase: {
    method: "actual_days" | "fixed_days" | "actual_minus_weekly_off";
    fixedDays: number | null;
    weeklyOffDay: number | null;
  } | null;
};

export type WageComputation = {
  contractGross: number;
  perDayRate: number;
  baseDays: number;
  earnedGross: number;
  ratio: number;
  components: WageComponent[];
  benefits: WageComponent[];
  deductions: WageComponent[];
  employerContributions: WageComponent[];
  totalDeductions: number;
  totalEmployerContributions: number;
  netPay: number;
  employerCost: number;
};

const ESI_NAME_RE = /\besi(c)?\b/i;
const ESI_EARNED_GROSS_CEILING = 21000;
const EPF_NAME_RE = /\bepf\b/i;

const round2 = (n: number) => Math.round(n * 100) / 100;

function applyEsiRule(
  items: WageComponent[],
  share: number,
  defaultName: string,
): WageComponent[] {
  const hasEsi = items.some((i) => ESI_NAME_RE.test(i.name));
  // Only the FIRST matching row carries the statutory amount; any other
  // ESI-named rows are zeroed so the contract can't double-count ESI.
  let placed = false;
  const mapped = items.map((i) => {
    if (!ESI_NAME_RE.test(i.name)) return i;
    if (placed) return { ...i, amount: 0 };
    placed = true;
    return { ...i, amount: share };
  });
  // Auto-inject statutory ESI row when contract omits it and the employee is
  // eligible, so export reflects the statutory shares without stale contract rows.
  if (!hasEsi && share > 0) mapped.push({ name: defaultName, amount: share });
  return mapped;
}

export function calculateEsiAmounts(
  earnedGross: number,
  earnedComponents: WageComponent[],
  options: { employeePct?: number; employerPct?: number; ceiling?: number } = {},
): { base: number; employee: number; employer: number } {
  const earnedComponentAmount = (pattern: RegExp) =>
    earnedComponents
      .filter((c) => pattern.test(c.name))
      .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  const earnedWashing = earnedComponentAmount(/\bwashing\b/i);
  const earnedConveyance = earnedComponentAmount(/\bconveyance\b|\bconv\.?\b/i);
  const base = Math.max(0, earnedGross - earnedWashing - earnedConveyance);
  const ceiling = options.ceiling && options.ceiling > 0 ? options.ceiling : ESI_EARNED_GROSS_CEILING;
  if (base > ceiling) {
    return { base, employee: 0, employer: 0 };
  }
  // Statutory ESIC rule: only up to ₹21,000 earned gross; contributions are
  // rounded UP to the next rupee.
  const employeePct = options.employeePct && options.employeePct > 0 ? options.employeePct : 0.75;
  const employerPct = options.employerPct && options.employerPct > 0 ? options.employerPct : 3.25;
  return {
    base,
    employee: base > 0 ? Math.ceil(base * (employeePct / 100)) : 0,
    employer: base > 0 ? Math.ceil(base * (employerPct / 100)) : 0,
  };
}

export function applyEsiToWageComputation(wages: WageComputation): WageComputation {
  const firstEsi = (items: WageComponent[]) => items.find((i) => ESI_NAME_RE.test(i.name));
  const employeeEsi = firstEsi(wages.deductions);
  const employerEsi = firstEsi(wages.employerContributions);
  const esi = calculateEsiAmounts(wages.earnedGross, wages.components, {
    employeePct: Number(employeeEsi?.percentage) || 0.75,
    employerPct: Number(employerEsi?.percentage) || 3.25,
    ceiling:
      Number(employeeEsi?.capAmount) ||
      Number(employerEsi?.capAmount) ||
      ESI_EARNED_GROSS_CEILING,
  });
  const deductions = applyEsiRule(wages.deductions, esi.employee, "ESI Employee Contribution");
  const employerContributions = applyEsiRule(
    wages.employerContributions,
    esi.employer,
    "ESI Employer Contribution",
  );
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  const totalEmployerContributions = employerContributions.reduce((s, d) => s + d.amount, 0);
  return {
    ...wages,
    deductions,
    employerContributions,
    totalDeductions: round2(totalDeductions),
    totalEmployerContributions: round2(totalEmployerContributions),
    netPay: round2(wages.earnedGross - totalDeductions),
    employerCost: round2(wages.earnedGross + totalEmployerContributions),
  };
}

// ---- Professional Tax (PT) ----
// PT is resolved per employee from the Professional Tax Manager slabs using:
//   - Unit billing state (with optional pincode for region disambiguation)
//   - Candidate gender (fallback "all")
//   - Earned gross for the period (monthly)
// The matching slab's tax_per_month becomes that employee's PT for the period.

export type PtSlabLike = {
  id?: string;
  state: string;
  region_label: string;
  salary_min: number;
  salary_max: number | null;
  tax_per_month: number;
  gender: string;
};

export type PincodeRangeLike = {
  state: string;
  region_label: string;
  range_start: number;
  range_end: number;
  is_excluded: boolean;
};

const PT_NAME_RE = /\bprofessional\s*tax\b|\bpt\b/i;
const ptNorm = (s: string) =>
  s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

export type PtResolveInput = {
  state?: string | null;
  pincode?: string | null;
  gender?: string | null;
  earnedGross: number;
  slabs: PtSlabLike[];
  ranges?: PincodeRangeLike[];
};

export type PtResolveResult = {
  amount: number;
  state: string | null;
  regionLabel: string | null;
  slabId: string | null;
  source: "resolved" | "no_state" | "no_slab" | "no_match";
};

export function resolvePtAmount(input: PtResolveInput): PtResolveResult {
  const { state, pincode, gender, earnedGross, slabs, ranges } = input;
  const stateStr = (state ?? "").trim();
  if (!stateStr) {
    return { amount: 0, state: null, regionLabel: null, slabId: null, source: "no_state" };
  }

  // 1) Narrow to slabs of this state.
  const stateSlabs = slabs.filter((s) => ptNorm(s.state) === ptNorm(stateStr));
  if (stateSlabs.length === 0) {
    return { amount: 0, state: stateStr, regionLabel: null, slabId: null, source: "no_slab" };
  }

  // 2) Pick region using pincode → range lookup; else most common region in state.
  let regionLabel: string | null = null;
  const pinTrim = (pincode ?? "").trim();
  if (pinTrim.length === 6 && ranges && ranges.length > 0) {
    const pin = parseInt(pinTrim, 10);
    if (Number.isFinite(pin)) {
      const containing = ranges.filter(
        (r) => ptNorm(r.state) === ptNorm(stateStr) && pin >= r.range_start && pin <= r.range_end,
      );
      const candidates: Array<{ region_label: string; span: number }> = [];
      for (const r of containing) {
        if (r.is_excluded) continue;
        const excluded = containing.some(
          (x) =>
            x.is_excluded &&
            ptNorm(x.region_label) === ptNorm(r.region_label),
        );
        if (excluded) continue;
        candidates.push({ region_label: r.region_label, span: r.range_end - r.range_start });
      }
      candidates.sort((a, b) => a.span - b.span);
      if (candidates.length > 0) regionLabel = candidates[0].region_label;
    }
  }

  let regionSlabs = regionLabel
    ? stateSlabs.filter((s) => ptNorm(s.region_label) === ptNorm(regionLabel!))
    : stateSlabs;
  if (regionSlabs.length === 0) {
    // Fallback: "All Pincodes" if present, else any region in the state.
    const allPincodes = stateSlabs.filter((s) => /all\s*pincodes/i.test(s.region_label));
    regionSlabs = allPincodes.length > 0 ? allPincodes : stateSlabs;
    regionLabel = regionSlabs[0]?.region_label ?? regionLabel;
  }

  // 3) Filter by gender. Try exact match, then "all".
  const g = (gender ?? "").trim().toLowerCase();
  let genderSlabs = regionSlabs.filter((s) => s.gender.toLowerCase() === g);
  if (genderSlabs.length === 0) {
    genderSlabs = regionSlabs.filter((s) => s.gender.toLowerCase() === "all");
  }
  if (genderSlabs.length === 0) {
    return { amount: 0, state: stateStr, regionLabel, slabId: null, source: "no_match" };
  }

  // 4) Find slab whose salary range covers earnedGross.
  const hit = genderSlabs.find(
    (s) =>
      earnedGross >= Number(s.salary_min || 0) &&
      (s.salary_max == null || earnedGross <= Number(s.salary_max)),
  );
  if (!hit) {
    return { amount: 0, state: stateStr, regionLabel, slabId: null, source: "no_match" };
  }
  return {
    amount: Number(hit.tax_per_month) || 0,
    state: stateStr,
    regionLabel,
    slabId: hit.id ?? null,
    source: "resolved",
  };
}

function applyPtRule(items: WageComponent[], amount: number, defaultName: string): WageComponent[] {
  const hasPt = items.some((i) => PT_NAME_RE.test(i.name));
  let placed = false;
  const mapped = items.map((i) => {
    if (!PT_NAME_RE.test(i.name)) return i;
    if (placed) return { ...i, amount: 0 };
    placed = true;
    return { ...i, amount };
  });
  if (!hasPt && amount > 0) mapped.push({ name: defaultName, amount });
  return mapped;
}

export function applyPtToWageComputation(
  wages: WageComputation,
  ptAmount: number,
): WageComputation {
  const deductions = applyPtRule(wages.deductions, ptAmount, "Professional Tax (PT)");
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  return {
    ...wages,
    deductions,
    totalDeductions: round2(totalDeductions),
    netPay: round2(wages.earnedGross - totalDeductions),
  };
}

function scaleItems(items: BenefitLike[], ratio: number): WageComponent[] {
  return items.map((i) => ({
    ...i,
    name: i.name,
    amount: round2((Number(i.amount) || 0) * ratio),
  }));
}

function benefitAmountFromConfig(
  item: BenefitLike | undefined,
  earnedComponents: WageComponent[],
  contractComponents: WageComponent[],
  ratio: number,
): number {
  if (!item) return 0;
  if (item.calcType !== "percentage") return round2(Number(item.amount) || 0);

  const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const amountMap = (items: WageComponent[]) => {
    const map = new Map<string, number>();
    for (const c of items) {
      const amount = Number(c.amount) || 0;
      const keys = new Set([norm(c.name), norm(canonicalComponentName(c.name))].filter(Boolean));
      keys.forEach((key) => map.set(key, round2((map.get(key) ?? 0) + amount)));
    }
    return map;
  };
  const earnedByName = amountMap(earnedComponents);
  const contractByName = amountMap(contractComponents);
  const bases = Array.isArray(item.baseComponents) ? item.baseComponents : [];
  const base = bases.reduce((sum, b) => {
    const key = norm(String(b.label ?? ""));
    const contractValue = contractByName.get(key) ?? 0;
    const earnedValue = earnedByName.get(key) ?? round2(contractValue * ratio);
    return b.operator === "-" ? sum - earnedValue : sum + earnedValue;
  }, 0);
  let amount = (Number(item.percentage) || 0) * Math.max(0, base) / 100;
  const capAmount = Number(item.capAmount) || 0;
  if (capAmount > 0 && base > capAmount) {
    amount = Number(item.capFlatAmount) > 0
      ? Number(item.capFlatAmount) || 0
      : (Number(item.percentage) || 0) * capAmount / 100;
  }
  return round2(amount);
}

export function computeWages(
  totals: AttendanceTotals,
  resource: ContractResourceLike,
  periodDayCount: number,
): WageComputation {
  const contractGross = resource.components.reduce(
    (s, c) => s + (Number(c.amount) || 0),
    0,
  );

  // Resolve base days from payroll-day-base method.
  let baseDays = periodDayCount;
  const pdb = resource.payrollDayBase;
  if (pdb) {
    if (pdb.method === "fixed_days" && pdb.fixedDays && pdb.fixedDays > 0) {
      baseDays = pdb.fixedDays;
    } else if (pdb.method === "actual_minus_weekly_off") {
      // Rough approximation: assume ~4 weekly offs in the period.
      baseDays = Math.max(periodDayCount - 4, 1);
    } else {
      baseDays = periodDayCount;
    }
  }
  if (baseDays <= 0) baseDays = 30;

  const perDayRate = contractGross / baseDays;
  const earnedGross = Math.round(perDayRate * totals.tDays * 100) / 100;
  const ratio = contractGross > 0 ? earnedGross / contractGross : 0;

  const components = resource.components.map((c) => ({
    ...c,
    name: c.name,
    amount: round2((Number(c.amount) || 0) * ratio),
  }));
  // Fixed (non-prorated) deduction/contribution names. These stay at the
  // contract amount regardless of attendance — e.g. Uniform Charges is a
  // flat monthly recovery, LWF is a flat statutory monthly contribution.
  // Management Fee is intentionally NOT fixed — it prorates by T Days
  // like other earnings/contributions.
  const isFixedItem = (name: string) =>
    /\buniform\b/i.test(name) ||
    /\blwf\b/i.test(name) ||
    /labour\s*welfare/i.test(name);
  const scaleItemsRespectingFixed = (items: BenefitLike[]): WageComponent[] =>
    items.map((i) => ({
      ...i,
      name: i.name,
      amount: isFixedItem(i.name)
        ? round2(Number(i.amount) || 0)
        : round2((Number(i.amount) || 0) * ratio),
    }));
  const benefits = scaleItems(resource.benefits, ratio);
  const deductionsScaled = scaleItemsRespectingFixed(resource.deductions);
  const employerContributionsScaled = scaleItemsRespectingFixed(resource.employerContributions);

  const findEpf = (items: BenefitLike[]) =>
    items.find((i) => EPF_NAME_RE.test(i.name));
  const employeeEpfItem = findEpf(resource.deductions);
  const employerEpfItem = findEpf(resource.employerContributions);
  const employeeEpfAmount = benefitAmountFromConfig(
    employeeEpfItem,
    components,
    resource.components,
    ratio,
  );
  const employerEpfAmount = benefitAmountFromConfig(
    employerEpfItem,
    components,
    resource.components,
    ratio,
  );

  // Only the FIRST EPF-named row carries the statutory amount; any other
  // EPF-named rows are zeroed so a contract listing multiple EPF lines
  // can't double-deduct.
  const applyEpfRule = (items: WageComponent[], amount: number) => {
    let placed = false;
    return items.map((i) => {
      if (!EPF_NAME_RE.test(i.name)) return i;
      if (placed) return { ...i, amount: 0 };
      placed = true;
      return { ...i, amount };
    });
  };


  // ---- Statutory ESI override ----
  // Rule: ESI is computed on earned Gross minus earned Washing and
  // Conveyance allowances. Employee share = 0.75%, employer share = 3.25%.
  // Applied to any row whose name contains "ESI".
  const findEsi = (items: BenefitLike[]) => items.find((i) => ESI_NAME_RE.test(i.name));
  const employeeEsiItem = findEsi(resource.deductions);
  const employerEsiItem = findEsi(resource.employerContributions);
  const esi = calculateEsiAmounts(earnedGross, components, {
    employeePct: Number(employeeEsiItem?.percentage) || 0.75,
    employerPct: Number(employerEsiItem?.percentage) || 3.25,
    ceiling:
      Number(employeeEsiItem?.capAmount) ||
      Number(employerEsiItem?.capAmount) ||
      ESI_EARNED_GROSS_CEILING,
  });

  const deductions = applyEsiRule(
    applyEpfRule(deductionsScaled, employeeEpfAmount),
    esi.employee,
    "ESI Employee Contribution",
  );
  const employerContributions = applyEsiRule(
    applyEpfRule(employerContributionsScaled, employerEpfAmount),
    esi.employer,
    "ESI Employer Contribution",
  );

  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
  const totalEmployerContributions = employerContributions.reduce(
    (s, d) => s + d.amount,
    0,
  );

  const netPay = round2(earnedGross - totalDeductions);
  const employerCost =
    round2(earnedGross + totalEmployerContributions);

  return {
    contractGross,
    perDayRate: round2(perDayRate),
    baseDays,
    earnedGross,
    ratio,
    components,
    benefits,
    deductions,
    employerContributions,
    totalDeductions: round2(totalDeductions),
    totalEmployerContributions: round2(totalEmployerContributions),
    netPay,
    employerCost,
  };
}

export function fmtINR(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}
