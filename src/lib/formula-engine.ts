/**
 * Payroll formula engine.
 *
 * Pure, deterministic, no I/O. Safe to run inside payroll loops and SSR.
 * Used by Allowance Manager, Cost Component Manager, Addition Type Manager,
 * and Deduction Type Manager. The UI never shows JSON — it picks one of
 * four "modes" (tiles) and the editor produces a `Formula` value.
 *
 *  - flat        : { mode: 'flat', amount, dayDriver? }
 *  - percentage  : { mode: 'percentage', percent, bases: [{tag,op}], cap? }
 *  - composition : { mode: 'composition', terms: [{tag,op}] }            // C = A + B - D
 *  - slabs       : { mode: 'slabs', baseExpr?, slabs: [{min,max,kind,value,bases?,percent?}] }
 *  - expression  : { mode: 'expression', expr: '0.12*(BASIC+DA)' }       // advanced (collapsed)
 *
 * Empty / missing formula => caller must fall back to legacy fields.
 *
 * Tokens available in expressions and `bases`:
 *  - any registered component tag (case-insensitive, alnum only): BASIC, DA, HRA, ...
 *  - reserved: GROSS, EARNED_GROSS, P_DAYS, OT_DAYS, PH_DAYS, OTHER_PAID_DAYS,
 *              T_DAYS, BASE_DAYS, PER_DAY, QTY, PER_HOUR.
 */

export type DayDriverFlat = "flat";
export type DayDriverRatio = "ratio";
export type DayDriverPerDuty = `per_duty:${
  | "p_days"
  | "ot_days"
  | "ph_days"
  | "other_paid_days"
  | "t_days"}`;
export type DayDriver = DayDriverFlat | DayDriverRatio | DayDriverPerDuty;

export type Operator = "+" | "-";

export type BaseTerm = { tag: string; op: Operator };

export type SlabRow = {
  /** lower bound inclusive (null = -infinity) */
  min: number | null;
  /** upper bound inclusive (null = +infinity) */
  max: number | null;
  /** payout kind */
  kind: "flat" | "pct";
  /** for 'flat': rupee value. for 'pct': percent applied to baseExpr / bases */
  value: number;
  /** optional override of the parent baseExpr for this row */
  bases?: BaseTerm[];
};

export type Formula =
  | { mode: "flat"; amount: number; dayDriver?: DayDriver }
  | {
      mode: "percentage";
      percent: number;
      bases: BaseTerm[];
      cap?: { whenBaseExceeds: number; thenFlat?: number; thenPct?: number } | null;
      dayDriver?: DayDriver;
    }
  | { mode: "composition"; terms: BaseTerm[]; dayDriver?: DayDriver }
  | {
      mode: "slabs";
      /** what we look up the slab against (e.g. BASIC+DA, or GROSS) */
      driver: BaseTerm[] | "EARNED_GROSS" | "GROSS";
      slabs: SlabRow[];
      dayDriver?: DayDriver;
    }
  | { mode: "expression"; expr: string; dayDriver?: DayDriver };

export type EvalContext = {
  /** resolved amounts of other components, keyed by canonical tag (upper, alnum) */
  components: Record<string, number>;
  /** resolved amounts at full-contract level (no proration). Same keys. */
  contractComponents: Record<string, number>;
  /** attendance and derived totals */
  pDays: number;
  otDays: number;
  phDays: number;
  otherPaidDays: number;
  tDays: number;
  baseDays: number;
  perDay: number;
  earnedGross: number;
  gross: number;
  /** quantity (additions/deductions); 1 by default */
  qty?: number;
};

export const RESERVED_TOKENS = [
  "GROSS",
  "EARNED_GROSS",
  "P_DAYS",
  "OT_DAYS",
  "PH_DAYS",
  "OTHER_PAID_DAYS",
  "T_DAYS",
  "BASE_DAYS",
  "PER_DAY",
  "QTY",
  "PER_HOUR",
] as const;

export type ReservedToken = (typeof RESERVED_TOKENS)[number];

const round2 = (n: number) => Math.round(n * 100) / 100;

export function canonTag(s: string): string {
  return String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function resolveToken(token: string, ctx: EvalContext): number {
  const t = token.toUpperCase();
  switch (t) {
    case "GROSS":
      return ctx.gross;
    case "EARNED_GROSS":
      return ctx.earnedGross;
    case "P_DAYS":
      return ctx.pDays;
    case "OT_DAYS":
      return ctx.otDays;
    case "PH_DAYS":
      return ctx.phDays;
    case "OTHER_PAID_DAYS":
      return ctx.otherPaidDays;
    case "T_DAYS":
      return ctx.tDays;
    case "BASE_DAYS":
      return ctx.baseDays;
    case "PER_DAY":
      return ctx.perDay;
    case "QTY":
      return ctx.qty ?? 1;
    default: {
      const key = canonTag(token);
      if (key in ctx.components) return ctx.components[key];
      // unresolved tag => 0 (engine never throws at eval time; cycles caught at save)
      return 0;
    }
  }
}

function sumBases(bases: BaseTerm[], ctx: EvalContext): number {
  return bases.reduce((sum, b) => {
    const v = resolveToken(b.tag, ctx);
    return b.op === "-" ? sum - v : sum + v;
  }, 0);
}

// ---------------- expression parser (precedence climbing) ----------------

type Tok =
  | { type: "num"; v: number }
  | { type: "id"; v: string }
  | { type: "op"; v: "+" | "-" | "*" | "/" }
  | { type: "lp" }
  | { type: "rp" }
  | { type: "pct" }
  | { type: "end" };

function tokenize(src: string): Tok[] {
  const tokens: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n") { i++; continue; }
    if (c === "(") { tokens.push({ type: "lp" }); i++; continue; }
    if (c === ")") { tokens.push({ type: "rp" }); i++; continue; }
    if (c === "+" || c === "-" || c === "*" || c === "/") { tokens.push({ type: "op", v: c }); i++; continue; }
    if (c === "%") { tokens.push({ type: "pct" }); i++; continue; }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      tokens.push({ type: "num", v: parseFloat(src.slice(i, j)) });
      i = j; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      tokens.push({ type: "id", v: src.slice(i, j) });
      i = j; continue;
    }
    throw new ExpressionError(`Unexpected character "${c}" at position ${i}`);
  }
  tokens.push({ type: "end" });
  return tokens;
}

export class ExpressionError extends Error {}

class Parser {
  private pos = 0;
  constructor(private tokens: Tok[]) {}
  private peek(): Tok { return this.tokens[this.pos]; }
  private eat(): Tok { return this.tokens[this.pos++]; }

  parse(): (ctx: EvalContext) => number {
    const fn = this.parseExpr(0);
    if (this.peek().type !== "end") throw new ExpressionError("Unexpected trailing input");
    return fn;
  }

  // pratt-style precedence climbing
  private parseExpr(minPrec: number): (ctx: EvalContext) => number {
    let left = this.parseUnary();
    while (true) {
      const t = this.peek();
      if (t.type === "pct") {
        this.eat();
        const lhs = left;
        left = (ctx) => lhs(ctx) / 100;
        continue;
      }
      if (t.type !== "op") break;
      const prec = t.v === "+" || t.v === "-" ? 1 : 2;
      if (prec < minPrec) break;
      this.eat();
      const right = this.parseExpr(prec + 1);
      const lhs = left;
      const op = t.v;
      left = (ctx) => {
        const a = lhs(ctx);
        const b = right(ctx);
        switch (op) {
          case "+": return a + b;
          case "-": return a - b;
          case "*": return a * b;
          case "/": return b === 0 ? 0 : a / b;
        }
      };
    }
    return left;
  }

  private parseUnary(): (ctx: EvalContext) => number {
    const t = this.peek();
    if (t.type === "op" && (t.v === "+" || t.v === "-")) {
      this.eat();
      const inner = this.parseUnary();
      return t.v === "-" ? (ctx) => -inner(ctx) : inner;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): (ctx: EvalContext) => number {
    const t = this.eat();
    if (t.type === "num") return () => t.v;
    if (t.type === "id") return (ctx) => resolveToken(t.v, ctx);
    if (t.type === "lp") {
      const inner = this.parseExpr(0);
      const close = this.eat();
      if (close.type !== "rp") throw new ExpressionError("Missing closing parenthesis");
      return inner;
    }
    throw new ExpressionError(`Unexpected token: ${JSON.stringify(t)}`);
  }
}

export function compileExpression(expr: string): (ctx: EvalContext) => number {
  if (!expr || !expr.trim()) return () => 0;
  const tokens = tokenize(expr);
  return new Parser(tokens).parse();
}

/** Identifiers referenced in an expression, lowercased. */
export function expressionIdentifiers(expr: string): string[] {
  if (!expr || !expr.trim()) return [];
  const out = new Set<string>();
  for (const t of tokenize(expr)) {
    if (t.type === "id") out.add(t.v.toUpperCase());
  }
  return Array.from(out);
}

// ---------------- evaluator ----------------

function applyDayDriver(amount: number, driver: DayDriver | undefined, ctx: EvalContext): number {
  if (!driver || driver === "flat") return amount;
  if (driver === "ratio") {
    const r = ctx.baseDays > 0 ? ctx.pDays / ctx.baseDays : 0;
    return amount * r;
  }
  // per_duty:*
  const bucket = driver.slice("per_duty:".length);
  const days =
    bucket === "p_days" ? ctx.pDays :
    bucket === "ot_days" ? ctx.otDays :
    bucket === "ph_days" ? ctx.phDays :
    bucket === "other_paid_days" ? ctx.otherPaidDays :
    bucket === "t_days" ? ctx.tDays : 0;
  return amount * days;
}

/** Evaluate a formula → rupee amount (rounded to 2dp). */
export function evaluateFormula(formula: Formula | null | undefined, ctx: EvalContext): number {
  if (!formula || !(formula as { mode?: string }).mode) return 0;
  switch (formula.mode) {
    case "flat":
      return round2(applyDayDriver(Number(formula.amount) || 0, formula.dayDriver, ctx));

    case "percentage": {
      const base = Math.max(0, sumBases(formula.bases ?? [], ctx));
      let amount = (Number(formula.percent) || 0) * base / 100;
      const cap = formula.cap;
      if (cap && cap.whenBaseExceeds > 0 && base > cap.whenBaseExceeds) {
        if (typeof cap.thenFlat === "number") amount = cap.thenFlat;
        else if (typeof cap.thenPct === "number")
          amount = (cap.thenPct * cap.whenBaseExceeds) / 100;
      }
      return round2(applyDayDriver(amount, formula.dayDriver, ctx));
    }

    case "composition":
      return round2(applyDayDriver(sumBases(formula.terms ?? [], ctx), formula.dayDriver, ctx));

    case "slabs": {
      const driverVal =
        formula.driver === "EARNED_GROSS" ? ctx.earnedGross :
        formula.driver === "GROSS" ? ctx.gross :
        sumBases(formula.driver, ctx);
      for (const slab of formula.slabs) {
        const minOk = slab.min == null || driverVal >= slab.min;
        const maxOk = slab.max == null || driverVal <= slab.max;
        if (!minOk || !maxOk) continue;
        let amount: number;
        if (slab.kind === "flat") {
          amount = Number(slab.value) || 0;
        } else {
          const base = slab.bases ? Math.max(0, sumBases(slab.bases, ctx)) : driverVal;
          amount = (Number(slab.value) || 0) * base / 100;
        }
        return round2(applyDayDriver(amount, formula.dayDriver, ctx));
      }
      return 0;
    }

    case "expression": {
      const fn = compileExpression(formula.expr);
      return round2(applyDayDriver(fn(ctx), formula.dayDriver, ctx));
    }
  }
}

/** Tag references a formula depends on, for cycle detection. */
export function formulaDependencies(formula: Formula | null | undefined): string[] {
  if (!formula) return [];
  const ids = new Set<string>();
  const add = (t: string) => { const c = canonTag(t); if (c && !(RESERVED_TOKENS as readonly string[]).includes(t.toUpperCase())) ids.add(c); };
  const addTerms = (terms: BaseTerm[] | undefined) => terms?.forEach((b) => add(b.tag));
  switch (formula.mode) {
    case "flat":
      break;
    case "percentage":
      addTerms(formula.bases);
      break;
    case "composition":
      addTerms(formula.terms);
      break;
    case "slabs":
      if (Array.isArray(formula.driver)) addTerms(formula.driver);
      formula.slabs.forEach((s) => addTerms(s.bases));
      break;
    case "expression":
      for (const tok of expressionIdentifiers(formula.expr)) {
        if (!(RESERVED_TOKENS as readonly string[]).includes(tok)) add(tok);
      }
      break;
  }
  return Array.from(ids);
}

/**
 * Detect cycles in a set of (tag, formula) rows.
 * Returns the chain when a cycle exists, e.g. ["C","A","B","C"], else null.
 */
export function detectCycle(
  rows: Array<{ tag: string; formula: Formula | null | undefined }>,
): string[] | null {
  const graph = new Map<string, string[]>();
  for (const r of rows) {
    graph.set(canonTag(r.tag), formulaDependencies(r.formula));
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string>();
  let cycleNode: string | null = null;
  let cycleParent: string | null = null;

  function dfs(node: string): boolean {
    color.set(node, GRAY);
    for (const dep of graph.get(node) ?? []) {
      const depKey = canonTag(dep);
      if (!graph.has(depKey)) continue; // dep isn't a formula row
      const c = color.get(depKey) ?? WHITE;
      if (c === GRAY) {
        cycleNode = depKey;
        cycleParent = node;
        return true;
      }
      if (c === WHITE) {
        parent.set(depKey, node);
        if (dfs(depKey)) return true;
      }
    }
    color.set(node, BLACK);
    return false;
  }

  for (const node of graph.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE && dfs(node)) {
      const chain: string[] = [cycleNode!];
      let cur: string | null = cycleParent;
      while (cur && cur !== cycleNode) {
        chain.unshift(cur);
        cur = parent.get(cur) ?? null;
      }
      chain.unshift(cycleNode!);
      return chain;
    }
  }
  return null;
}

/**
 * Topologically sort formula tags. Dependencies first.
 * Tags whose deps aren't in the set are kept (with deps treated as leaves).
 */
export function topoSort(
  rows: Array<{ tag: string; formula: Formula | null | undefined }>,
): string[] {
  const graph = new Map<string, string[]>();
  for (const r of rows) graph.set(canonTag(r.tag), formulaDependencies(r.formula).map(canonTag));
  const visited = new Set<string>();
  const out: string[] = [];
  function visit(n: string) {
    if (visited.has(n)) return;
    visited.add(n);
    for (const d of graph.get(n) ?? []) if (graph.has(d)) visit(d);
    out.push(n);
  }
  for (const n of graph.keys()) visit(n);
  return out;
}
