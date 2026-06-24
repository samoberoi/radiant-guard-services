import { describe, it, expect } from "vitest";
import {
  evaluateFormula,
  compileExpression,
  detectCycle,
  formulaDependencies,
  canonTag,
  type EvalContext,
  type Formula,
} from "./formula-engine";

const ctx = (over: Partial<EvalContext> = {}): EvalContext => ({
  components: { BASIC: 10000, DA: 5000, HRA: 4000 },
  contractComponents: { BASIC: 10000, DA: 5000, HRA: 4000 },
  pDays: 26,
  otDays: 0,
  phDays: 0,
  otherPaidDays: 0,
  tDays: 26,
  baseDays: 26,
  perDay: 730.77,
  earnedGross: 19000,
  gross: 19000,
  qty: 1,
  ...over,
});

describe("formula-engine", () => {
  describe("canonTag", () => {
    it("uppercases and strips non-alnum", () => {
      expect(canonTag("Basic - Salary")).toBe("BASICSALARY");
      expect(canonTag("HRA 5%")).toBe("HRA5");
    });
  });

  describe("flat", () => {
    it("returns amount directly when flat driver", () => {
      const f: Formula = { mode: "flat", amount: 500, dayDriver: "flat" };
      expect(evaluateFormula(f, ctx())).toBe(500);
    });
    it("prorates by P/baseDays on ratio driver", () => {
      const f: Formula = { mode: "flat", amount: 520, dayDriver: "ratio" };
      // 520 * 13/26 = 260
      expect(evaluateFormula(f, ctx({ pDays: 13 }))).toBe(260);
    });
    it("per_duty driver multiplies by bucket days", () => {
      const f: Formula = { mode: "flat", amount: 100, dayDriver: "per_duty:ph_days" };
      expect(evaluateFormula(f, ctx({ phDays: 4 }))).toBe(400);
    });
  });

  describe("percentage", () => {
    it("computes percent of summed bases", () => {
      const f: Formula = {
        mode: "percentage",
        percent: 12,
        bases: [{ tag: "BASIC", op: "+" }, { tag: "DA", op: "+" }],
        dayDriver: "flat",
      };
      // 12% of (10000+5000) = 1800
      expect(evaluateFormula(f, ctx())).toBe(1800);
    });
    it("respects whenBaseExceeds → thenFlat cap", () => {
      const f: Formula = {
        mode: "percentage",
        percent: 12,
        bases: [{ tag: "BASIC", op: "+" }, { tag: "DA", op: "+" }],
        cap: { whenBaseExceeds: 14000, thenFlat: 1200 },
        dayDriver: "flat",
      };
      expect(evaluateFormula(f, ctx())).toBe(1200);
    });
  });

  describe("composition (C = A + B)", () => {
    it("adds tagged components", () => {
      const f: Formula = {
        mode: "composition",
        terms: [{ tag: "BASIC", op: "+" }, { tag: "DA", op: "+" }],
        dayDriver: "flat",
      };
      expect(evaluateFormula(f, ctx())).toBe(15000);
    });
    it("supports subtraction", () => {
      const f: Formula = {
        mode: "composition",
        terms: [{ tag: "HRA", op: "+" }, { tag: "BASIC", op: "-" }],
        dayDriver: "flat",
      };
      expect(evaluateFormula(f, ctx())).toBe(-6000);
    });
  });

  describe("slabs", () => {
    const slabF: Formula = {
      mode: "slabs",
      driver: "EARNED_GROSS",
      slabs: [
        {
          min: null,
          max: 15000,
          kind: "pct",
          value: 12,
          bases: [{ tag: "BASIC", op: "+" }, { tag: "DA", op: "+" }],
        },
        { min: 15000.01, max: null, kind: "flat", value: 1200 },
      ],
      dayDriver: "flat",
    };
    it("picks first matching slab (low)", () => {
      // earnedGross 14000 → 12% of (BASIC+DA) = 1800
      expect(evaluateFormula(slabF, ctx({ earnedGross: 14000 }))).toBe(1800);
    });
    it("picks first matching slab (high)", () => {
      expect(evaluateFormula(slabF, ctx({ earnedGross: 19000 }))).toBe(1200);
    });
    it("returns 0 when no slab matches", () => {
      const noMatch: Formula = {
        mode: "slabs",
        driver: "EARNED_GROSS",
        slabs: [{ min: 100000, max: null, kind: "flat", value: 999 }],
      };
      expect(evaluateFormula(noMatch, ctx())).toBe(0);
    });
  });

  describe("expression", () => {
    it("parses arithmetic with parens and precedence", () => {
      const fn = compileExpression("0.12 * (BASIC + DA)");
      expect(fn(ctx())).toBe(1800);
    });
    it("supports percent suffix", () => {
      const fn = compileExpression("12% * (BASIC + DA)");
      expect(fn(ctx())).toBeCloseTo(1800);
    });
    it("safe division by zero", () => {
      const fn = compileExpression("BASIC / 0");
      expect(fn(ctx())).toBe(0);
    });
  });

  describe("cycle detection", () => {
    it("detects A→B→A", () => {
      const rows = [
        { tag: "A", formula: { mode: "composition", terms: [{ tag: "B", op: "+" }] } as Formula },
        { tag: "B", formula: { mode: "composition", terms: [{ tag: "A", op: "+" }] } as Formula },
      ];
      const chain = detectCycle(rows);
      expect(chain).not.toBeNull();
      expect(chain!.length).toBeGreaterThan(1);
    });
    it("returns null when no cycle", () => {
      const rows = [
        { tag: "C", formula: { mode: "composition", terms: [{ tag: "A", op: "+" }, { tag: "B", op: "+" }] } as Formula },
        { tag: "A", formula: null },
        { tag: "B", formula: null },
      ];
      expect(detectCycle(rows)).toBeNull();
    });
  });

  describe("formulaDependencies", () => {
    it("ignores reserved tokens", () => {
      const f: Formula = { mode: "expression", expr: "BASIC + GROSS + P_DAYS" };
      expect(formulaDependencies(f)).toEqual(["BASIC"]);
    });
  });
});
