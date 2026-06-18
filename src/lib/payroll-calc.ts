// Shared payroll computation helpers used by the Payroll section.
//
// Wage formulas mirror the attendance page derivations: a candidate's earned
// gross for a period is `per-day × T Days`, where per-day is derived from the
// contract resource's monthly gross divided by the configured payroll-day
// base. All component / deduction / employer-contribution amounts in the
// contract resource are scaled by the same ratio so the breakdown reconciles
// to the earned gross.

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

export type WageComponent = { name: string; amount: number };
export type BenefitLike = { name: string; amount: number | string | null };

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

const round2 = (n: number) => Math.round(n * 100) / 100;

function applyEsiRule(
  items: WageComponent[],
  share: number,
  defaultName: string,
): WageComponent[] {
  const hasEsi = items.some((i) => ESI_NAME_RE.test(i.name));
  const mapped = items.map((i) =>
    ESI_NAME_RE.test(i.name) ? { ...i, amount: share } : i,
  );
  // Auto-inject statutory ESI row when contract omits it, so export always
  // reflects the rule: 0.75% / 3.25% of (Earned Gross − Washing − Conveyance).
  if (!hasEsi && share > 0) mapped.push({ name: defaultName, amount: share });
  return mapped;
}

export function calculateEsiAmounts(
  earnedGross: number,
  earnedComponents: WageComponent[],
): { base: number; employee: number; employer: number } {
  const earnedWashing = earnedComponents
    .filter((c) => /washing/i.test(c.name))
    .reduce((s, c) => s + c.amount, 0);
  const earnedConveyance = earnedComponents
    .filter((c) => /convey/i.test(c.name))
    .reduce((s, c) => s + c.amount, 0);
  const base = Math.max(0, earnedGross - earnedWashing - earnedConveyance);
  // Statutory ESIC rule: contributions are rounded UP to the next rupee.
  return {
    base,
    employee: base > 0 ? Math.ceil(base * 0.0075) : 0,
    employer: base > 0 ? Math.ceil(base * 0.0325) : 0,
  };
}

export function applyEsiToWageComputation(wages: WageComputation): WageComputation {
  const esi = calculateEsiAmounts(wages.earnedGross, wages.components);
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

function scaleItems(items: BenefitLike[], ratio: number): WageComponent[] {
  return items.map((i) => ({
    name: i.name,
    amount: round2((Number(i.amount) || 0) * ratio),
  }));
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
    name: c.name,
    amount: round2((Number(c.amount) || 0) * ratio),
  }));
  const benefits = scaleItems(resource.benefits, ratio);
  const deductionsScaled = scaleItems(resource.deductions, ratio);
  const employerContributionsScaled = scaleItems(resource.employerContributions, ratio);

  // ---- Statutory EPF override ----
  // Rule: EPF = 12% of (earned Gross − earned HRA), capped at a ₹15,000
  // wage ceiling. So if (Gross − HRA) ≤ 15,000 → 12% of (Gross − HRA);
  // otherwise flat ₹1,800. Applied to any deduction OR employer-contribution
  // row whose name contains "EPF".
  const earnedHRA = components
    .filter((c) => /\bhra\b/i.test(c.name))
    .reduce((s, c) => s + c.amount, 0);
  const epfBase = Math.max(0, earnedGross - earnedHRA);
  const epfAmount =
    epfBase <= 15000 ? Math.round(epfBase * 0.12 * 100) / 100 : 1800;
  const applyEpfRule = (items: WageComponent[]) =>
    items.map((i) => (/\bepf\b/i.test(i.name) ? { ...i, amount: epfAmount } : i));

  // ---- Statutory ESI override ----
  // Rule: ESI is computed on (earned Gross − earned Washing Allowance −
  // earned Conveyance Allowance). Employee share = 0.75%, employer share
  // = 3.25%. Washing & conveyance allowances are statutorily excluded
  // from ESI wages. Applied to any row whose name contains "ESI".
  const esi = calculateEsiAmounts(earnedGross, components);

  const deductions = applyEsiRule(
    applyEpfRule(deductionsScaled),
    esi.employee,
    "ESI Employee Contribution",
  );
  const employerContributions = applyEsiRule(
    applyEpfRule(employerContributionsScaled),
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
