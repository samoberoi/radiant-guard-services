/**
 * <ComponentEditor> — shared 4-card editor for Allowances, Cost Components,
 * Addition Types and Deduction Types. Produces a `Formula` value plus
 * day-driver + T-Days flags. Designed to be fast to use (no JSON, big tiles,
 * inline templates, keyboard-friendly).
 *
 * Usage:
 *   <ComponentEditor
 *     value={state}
 *     onChange={setState}
 *     availableTags={[{tag:'BASIC',label:'Basic'}, ...]}
 *     kind="allowance"   // controls labels + templates
 *     onSave={async (v) => { ... }}
 *   />
 */

import { useMemo, useState } from "react";
import { Calculator, GitBranch, Layers, Percent, Plus, Trash2, Wand2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Formula,
  BaseTerm,
  DayDriver,
  EvalContext,
  evaluateFormula,
  detectCycle,
  canonTag,
  RESERVED_TOKENS,
} from "@/lib/formula-engine";

export type ComponentKind = "allowance" | "cost" | "addition" | "deduction";

export type ComponentEditorValue = {
  name: string;
  shortCode: string;
  formula: Formula;
  dayDriver: DayDriver;
  countsInTDays: boolean;
  includeInOT: boolean;
};

export type TagOption = {
  /** canonical (BASIC, DA …) */
  tag: string;
  /** human label */
  label: string;
};

const MODE_TILES: Array<{
  mode: Formula["mode"];
  title: string;
  hint: string;
  icon: typeof Calculator;
}> = [
  { mode: "flat",        title: "Fixed amount",   hint: "₹ amount typed per contract",       icon: Calculator },
  { mode: "percentage",  title: "% of components", hint: "e.g. 40% of Basic + DA",            icon: Percent },
  { mode: "composition", title: "Combine others",  hint: "A + B − C chip builder",            icon: GitBranch },
  { mode: "slabs",       title: "Slab table",      hint: "Bracket-based (PT, ESI, EPF …)",    icon: Layers },
];

const DAY_DRIVERS: { value: DayDriver; label: string; hint: string }[] = [
  { value: "flat",                  label: "Same every payroll",            hint: "Doesn't change with attendance" },
  { value: "ratio",                 label: "Scale with present days",       hint: "× P-Days ÷ Base Days" },
  { value: "per_duty:p_days",       label: "Per present day",               hint: "× P-Days" },
  { value: "per_duty:ot_days",      label: "Per OT day",                    hint: "× OT-Days" },
  { value: "per_duty:ph_days",      label: "Per PH (paid holiday) day",     hint: "× PH-Days" },
  { value: "per_duty:other_paid_days", label: "Per other-paid day",         hint: "× Other paid days" },
  { value: "per_duty:t_days",       label: "Per total (T) day",             hint: "× T-Days" },
];

function blankFormula(mode: Formula["mode"]): Formula {
  switch (mode) {
    case "flat":        return { mode: "flat", amount: 0 };
    case "percentage":  return { mode: "percentage", percent: 0, bases: [] };
    case "composition": return { mode: "composition", terms: [] };
    case "slabs":       return { mode: "slabs", driver: "EARNED_GROSS", slabs: [] };
    case "expression":  return { mode: "expression", expr: "" };
  }
}

function autoShortCode(name: string): string {
  const c = canonTag(name);
  return c.slice(0, 8);
}

// -------- Templates (start-from-template tiles) --------
const TEMPLATES: Record<ComponentKind, { id: string; label: string; build: () => ComponentEditorValue }[]> = {
  allowance: [
    { id: "hra40basic", label: "HRA 40% of Basic", build: () => ({
        name: "HRA", shortCode: "HRA", includeInOT: false, countsInTDays: false, dayDriver: "ratio",
        formula: { mode: "percentage", percent: 40, bases: [{ tag: "BASIC", op: "+" }], dayDriver: "ratio" },
    }) },
    { id: "wash100", label: "Washing ₹100 flat", build: () => ({
        name: "Washing Allowance", shortCode: "WASH", includeInOT: false, countsInTDays: false, dayDriver: "flat",
        formula: { mode: "flat", amount: 100, dayDriver: "flat" },
    }) },
    { id: "da10",   label: "DA 10% of Basic", build: () => ({
        name: "DA", shortCode: "DA", includeInOT: true, countsInTDays: false, dayDriver: "ratio",
        formula: { mode: "percentage", percent: 10, bases: [{ tag: "BASIC", op: "+" }], dayDriver: "ratio" },
    }) },
  ],
  cost: [
    { id: "epf12", label: "EPF 12% of Basic (cap 15k)", build: () => ({
        name: "EPF Employer", shortCode: "EPF", includeInOT: false, countsInTDays: false, dayDriver: "ratio",
        formula: { mode: "percentage", percent: 12, bases: [{ tag: "BASIC", op: "+" }],
          cap: { whenBaseExceeds: 15000, thenPct: 12 }, dayDriver: "ratio" },
    }) },
    { id: "esi325", label: "ESI Employer 3.25% of Gross", build: () => ({
        name: "ESI Employer", shortCode: "ESIE", includeInOT: false, countsInTDays: false, dayDriver: "ratio",
        formula: { mode: "percentage", percent: 3.25, bases: [{ tag: "GROSS", op: "+" }], dayDriver: "ratio" },
    }) },
  ],
  addition: [
    { id: "ph_perday", label: "PH per day × PER_DAY (adds to T)", build: () => ({
        name: "Public Holiday", shortCode: "PH", includeInOT: false, countsInTDays: true, dayDriver: "per_duty:ph_days",
        formula: { mode: "expression", expr: "PER_DAY", dayDriver: "per_duty:ph_days" },
    }) },
    { id: "bonus_flat", label: "One-off bonus", build: () => ({
        name: "Bonus", shortCode: "BONUS", includeInOT: false, countsInTDays: false, dayDriver: "flat",
        formula: { mode: "flat", amount: 0, dayDriver: "flat" },
    }) },
  ],
  deduction: [
    { id: "epf12d", label: "EPF Employee 12% of Basic", build: () => ({
        name: "EPF Employee", shortCode: "EPFE", includeInOT: false, countsInTDays: false, dayDriver: "ratio",
        formula: { mode: "percentage", percent: 12, bases: [{ tag: "BASIC", op: "+" }],
          cap: { whenBaseExceeds: 15000, thenPct: 12 }, dayDriver: "ratio" },
    }) },
    { id: "loan_emi", label: "Loan EMI (flat)", build: () => ({
        name: "Loan EMI", shortCode: "LOAN", includeInOT: false, countsInTDays: false, dayDriver: "flat",
        formula: { mode: "flat", amount: 0, dayDriver: "flat" },
    }) },
  ],
};

export function ComponentEditor({
  value,
  onChange,
  availableTags,
  kind,
  otherFormulas = [],
}: {
  value: ComponentEditorValue;
  onChange: (next: ComponentEditorValue) => void;
  availableTags: TagOption[];
  kind: ComponentKind;
  /** other formulas in the same family — used to validate cycles */
  otherFormulas?: Array<{ tag: string; formula: Formula | null }>;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(value.formula.mode === "expression");
  const [preview, setPreview] = useState({ gross: 25000, pDays: 26, baseDays: 30 });

  const update = (patch: Partial<ComponentEditorValue>) => onChange({ ...value, ...patch });
  const updateFormula = (patch: Partial<Formula>) =>
    update({ formula: { ...value.formula, ...patch } as Formula });

  // ---- preview eval ----
  const previewResult = useMemo(() => {
    const components: Record<string, number> = {};
    for (const t of availableTags) {
      // crude defaults so preview shows something
      if (t.tag === "BASIC") components[t.tag] = preview.gross * 0.5;
      else if (t.tag === "DA") components[t.tag] = preview.gross * 0.1;
      else components[t.tag] = 0;
    }
    const ctx: EvalContext = {
      components,
      contractComponents: components,
      pDays: preview.pDays,
      otDays: 0,
      phDays: 0,
      otherPaidDays: 0,
      tDays: preview.pDays,
      baseDays: preview.baseDays,
      perDay: preview.baseDays ? preview.gross / preview.baseDays : 0,
      earnedGross: preview.gross * (preview.pDays / preview.baseDays || 1),
      gross: preview.gross,
    };
    try {
      return { ok: true as const, value: evaluateFormula(value.formula, ctx) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Eval error" };
    }
  }, [value.formula, availableTags, preview]);

  const cycle = useMemo(() => {
    const tag = canonTag(value.shortCode || value.name);
    if (!tag) return null;
    return detectCycle([
      { tag, formula: value.formula },
      ...otherFormulas.filter((r) => canonTag(r.tag) !== tag),
    ]);
  }, [value.formula, value.shortCode, value.name, otherFormulas]);

  return (
    <div className="space-y-4">
      {/* template strip */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-secondary/30 p-2">
        <span className="inline-flex items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground">
          <Wand2 className="h-3.5 w-3.5" /> Start from template:
        </span>
        {TEMPLATES[kind].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.build())}
            className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-accent/10"
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ---- Card 1 — Name it ---- */}
      <Card title="1. Name it" subtitle="What employees see on the payslip.">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              value={value.name}
              onChange={(e) => {
                const name = e.target.value;
                update({ name, shortCode: value.shortCode || autoShortCode(name) });
              }}
              placeholder="e.g. House Rent Allowance"
              className="h-11 text-base"
            />
          </div>
          <div>
            <Label className="text-xs">Short tag</Label>
            <Input
              value={value.shortCode}
              onChange={(e) => update({ shortCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
              placeholder="HRA"
              className="h-11 font-mono uppercase"
              maxLength={10}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Used inside formulas (no spaces).</p>
          </div>
        </div>
      </Card>

      {/* ---- Card 2 — How is it paid? ---- */}
      <Card title="2. How is it paid?" subtitle="Pick one — switch any time, your data is kept.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {MODE_TILES.map((t) => {
            const active = value.formula.mode === t.mode;
            const Icon = t.icon;
            return (
              <button
                key={t.mode}
                type="button"
                onClick={() => update({ formula: { ...blankFormula(t.mode), dayDriver: value.formula.dayDriver } })}
                className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition ${
                  active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:bg-secondary/40"
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
                <span className="text-sm font-semibold">{t.title}</span>
                <span className="text-[11px] text-muted-foreground">{t.hint}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 rounded-lg border border-border bg-secondary/20 p-3">
          {value.formula.mode === "flat" && (
            <FlatEditor amount={value.formula.amount} onChange={(amount) => updateFormula({ amount })} />
          )}
          {value.formula.mode === "percentage" && (
            <PercentageEditor formula={value.formula} availableTags={availableTags} onChange={updateFormula} />
          )}
          {value.formula.mode === "composition" && (
            <CompositionEditor terms={value.formula.terms} availableTags={availableTags}
              onChange={(terms) => updateFormula({ terms })} />
          )}
          {value.formula.mode === "slabs" && (
            <SlabsEditor formula={value.formula} availableTags={availableTags} onChange={updateFormula} />
          )}
          {value.formula.mode === "expression" && (
            <ExpressionEditor expr={value.formula.expr} onChange={(expr) => updateFormula({ expr })} />
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            setAdvancedOpen((v) => !v);
            if (!advancedOpen && value.formula.mode !== "expression")
              update({ formula: { mode: "expression", expr: "", dayDriver: value.formula.dayDriver } });
          }}
          className="mt-2 text-xs font-medium text-primary hover:underline"
        >
          {advancedOpen ? "Hide advanced (raw expression)" : "Advanced — write a raw expression"}
        </button>
      </Card>

      {/* ---- Card 3 — When does it count? ---- */}
      <Card title="3. When does it count?" subtitle="Attendance behaviour and payroll inclusion.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Day behaviour</Label>
            <Select value={value.dayDriver}
              onValueChange={(v) => {
                const driver = v as DayDriver;
                update({ dayDriver: driver, formula: { ...value.formula, dayDriver: driver } as Formula });
              }}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DAY_DRIVERS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    <div className="flex flex-col">
                      <span className="font-medium">{d.label}</span>
                      <span className="text-[11px] text-muted-foreground">{d.hint}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3">
            <ToggleRow
              label="Include in OT base"
              hint="Adds this component when computing overtime per-hour rate."
              checked={value.includeInOT}
              onChange={(v) => update({ includeInOT: v })}
            />
            {(kind === "addition" || kind === "allowance") && (
              <ToggleRow
                label="Add quantity to T Days"
                hint="e.g. PH days bump total paid days for downstream proration."
                checked={value.countsInTDays}
                onChange={(v) => update({ countsInTDays: v })}
              />
            )}
          </div>
        </div>
      </Card>

      {/* ---- Card 4 — Live preview ---- */}
      <Card title="4. Live preview" subtitle="Numbers update as you type.">
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberSlider label="Gross (₹)" value={preview.gross} min={5000} max={100000} step={500}
            onChange={(gross) => setPreview((p) => ({ ...p, gross }))} />
          <NumberSlider label="P-Days" value={preview.pDays} min={0} max={31} step={1}
            onChange={(pDays) => setPreview((p) => ({ ...p, pDays }))} />
          <NumberSlider label="Base Days" value={preview.baseDays} min={26} max={31} step={1}
            onChange={(baseDays) => setPreview((p) => ({ ...p, baseDays }))} />
        </div>

        <div className="mt-3 rounded-lg border border-border bg-gradient-to-br from-primary/5 to-accent/5 p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Computes to</div>
          {previewResult.ok ? (
            <div className="text-2xl font-bold tabular-nums text-foreground">
              ₹ {previewResult.value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
          ) : (
            <div className="text-sm font-medium text-destructive">{previewResult.error}</div>
          )}
        </div>

        {cycle && (
          <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <strong>Circular reference:</strong> {cycle.join(" → ")}. Break the loop before saving.
          </div>
        )}
      </Card>
    </div>
  );
}

// -------------- sub-editors --------------

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="mb-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border bg-card p-3 hover:bg-secondary/30">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function NumberSlider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs font-mono tabular-nums">{value.toLocaleString("en-IN")}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-primary" />
    </div>
  );
}

function FlatEditor({ amount, onChange }: { amount: number; onChange: (v: number) => void }) {
  return (
    <div className="max-w-xs">
      <Label className="text-xs">Amount (₹)</Label>
      <Input type="number" inputMode="decimal" value={amount}
        onChange={(e) => onChange(Number(e.target.value) || 0)} className="h-11 text-base" />
    </div>
  );
}

function PercentageEditor({
  formula, availableTags, onChange,
}: { formula: Extract<Formula, { mode: "percentage" }>; availableTags: TagOption[]; onChange: (patch: Partial<Formula>) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input type="number" inputMode="decimal" value={formula.percent} className="h-11 w-24 text-base"
          onChange={(e) => onChange({ percent: Number(e.target.value) || 0 } as Partial<Formula>)} />
        <span className="text-sm">% of</span>
        <ChipBuilder terms={formula.bases} availableTags={availableTags}
          onChange={(bases) => onChange({ bases } as Partial<Formula>)} />
      </div>

      <div className="rounded-md bg-card p-2 text-xs text-muted-foreground">
        Cap (optional): when base &gt; <input type="number"
          className="mx-1 w-24 rounded border border-border bg-background px-1.5 py-0.5"
          value={formula.cap?.whenBaseExceeds ?? 0}
          onChange={(e) => onChange({ cap: { whenBaseExceeds: Number(e.target.value) || 0, thenPct: formula.cap?.thenPct, thenFlat: formula.cap?.thenFlat } } as Partial<Formula>)} />
        then use {" "}
        <select className="rounded border border-border bg-background px-1 py-0.5"
          value={typeof formula.cap?.thenFlat === "number" ? "flat" : "pct"}
          onChange={(e) => {
            const v = e.target.value;
            const c = formula.cap ?? { whenBaseExceeds: 0 };
            onChange({ cap: v === "flat" ? { whenBaseExceeds: c.whenBaseExceeds, thenFlat: 0 } : { whenBaseExceeds: c.whenBaseExceeds, thenPct: formula.percent } } as Partial<Formula>);
          }}>
          <option value="pct">% of cap</option><option value="flat">flat ₹</option>
        </select>
        {" "}
        <input type="number" className="mx-1 w-24 rounded border border-border bg-background px-1.5 py-0.5"
          value={formula.cap?.thenFlat ?? formula.cap?.thenPct ?? 0}
          onChange={(e) => {
            const v = Number(e.target.value) || 0;
            const c = formula.cap ?? { whenBaseExceeds: 0 };
            const isFlat = typeof c.thenFlat === "number";
            onChange({ cap: isFlat ? { ...c, thenFlat: v } : { ...c, thenPct: v } } as Partial<Formula>);
          }} />
        {formula.cap && (
          <button type="button" className="ml-2 text-destructive hover:underline"
            onClick={() => onChange({ cap: null } as Partial<Formula>)}>clear</button>
        )}
      </div>
    </div>
  );
}

function CompositionEditor({
  terms, availableTags, onChange,
}: { terms: BaseTerm[]; availableTags: TagOption[]; onChange: (terms: BaseTerm[]) => void }) {
  return <ChipBuilder terms={terms} availableTags={availableTags} onChange={onChange} />;
}

function ChipBuilder({ terms, availableTags, onChange }: { terms: BaseTerm[]; availableTags: TagOption[]; onChange: (t: BaseTerm[]) => void }) {
  const add = (tag: string, op: "+" | "-" = "+") => onChange([...terms, { tag, op }]);
  const remove = (i: number) => onChange(terms.filter((_, idx) => idx !== i));
  const flip = (i: number) => onChange(terms.map((t, idx) => idx === i ? { ...t, op: t.op === "+" ? "-" : "+" } : t));
  const labelFor = (tag: string) => availableTags.find((a) => a.tag === tag)?.label ?? tag;
  return (
    <div className="flex flex-1 flex-wrap items-center gap-1.5">
      {terms.length === 0 && <span className="text-xs text-muted-foreground">No components — add some →</span>}
      {terms.map((t, i) => (
        <span key={i} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs">
          <button type="button" onClick={() => flip(i)} className={`h-5 w-5 rounded font-bold ${t.op === "+" ? "bg-emerald-500/15 text-emerald-700" : "bg-destructive/15 text-destructive"}`}>
            {t.op}
          </button>
          <span className="font-mono">{labelFor(t.tag)}</span>
          <button type="button" onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
        </span>
      ))}
      <Select onValueChange={(v) => add(v)}>
        <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="+ add component" /></SelectTrigger>
        <SelectContent>
          {availableTags.map((a) => (<SelectItem key={a.tag} value={a.tag}>{a.label}</SelectItem>))}
          {RESERVED_TOKENS.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SlabsEditor({
  formula, availableTags, onChange,
}: { formula: Extract<Formula, { mode: "slabs" }>; availableTags: TagOption[]; onChange: (patch: Partial<Formula>) => void }) {
  const update = (slabs: typeof formula.slabs) => onChange({ slabs } as Partial<Formula>);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <span>Look up against:</span>
        <Select value={typeof formula.driver === "string" ? formula.driver : "CUSTOM"}
          onValueChange={(v) => onChange({ driver: v === "CUSTOM" ? [{ tag: "BASIC", op: "+" }] : (v as "EARNED_GROSS" | "GROSS") } as Partial<Formula>)}>
          <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="EARNED_GROSS">EARNED_GROSS</SelectItem>
            <SelectItem value="GROSS">GROSS</SelectItem>
            <SelectItem value="CUSTOM">Custom (chips)</SelectItem>
          </SelectContent>
        </Select>
        {Array.isArray(formula.driver) && (
          <ChipBuilder terms={formula.driver} availableTags={availableTags}
            onChange={(driver) => onChange({ driver } as Partial<Formula>)} />
        )}
      </div>
      <table className="w-full text-xs">
        <thead className="text-left text-muted-foreground"><tr>
          <th className="py-1">From ₹</th><th>To ₹</th><th>Kind</th><th>Value</th><th></th>
        </tr></thead>
        <tbody>
          {formula.slabs.map((s, i) => (
            <tr key={i} className="border-t border-border">
              <td className="py-1 pr-1"><Input type="number" value={s.min ?? ""} placeholder="-∞"
                onChange={(e) => { const slabs=[...formula.slabs]; slabs[i] = { ...s, min: e.target.value === "" ? null : Number(e.target.value) }; update(slabs); }}
                className="h-8" /></td>
              <td className="py-1 pr-1"><Input type="number" value={s.max ?? ""} placeholder="+∞"
                onChange={(e) => { const slabs=[...formula.slabs]; slabs[i] = { ...s, max: e.target.value === "" ? null : Number(e.target.value) }; update(slabs); }}
                className="h-8" /></td>
              <td className="py-1 pr-1">
                <Select value={s.kind} onValueChange={(v) => { const slabs=[...formula.slabs]; slabs[i] = { ...s, kind: v as "flat" | "pct" }; update(slabs); }}>
                  <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="flat">₹</SelectItem><SelectItem value="pct">%</SelectItem></SelectContent>
                </Select>
              </td>
              <td className="py-1 pr-1"><Input type="number" value={s.value}
                onChange={(e) => { const slabs=[...formula.slabs]; slabs[i] = { ...s, value: Number(e.target.value) || 0 }; update(slabs); }}
                className="h-8" /></td>
              <td className="py-1"><Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0"
                onClick={() => update(formula.slabs.filter((_, idx) => idx !== i))}><Trash2 className="h-3.5 w-3.5" /></Button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button type="button" size="sm" variant="outline"
        onClick={() => update([...formula.slabs, { min: null, max: null, kind: "flat", value: 0 }])}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Add slab
      </Button>
    </div>
  );
}

function ExpressionEditor({ expr, onChange }: { expr: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs">Raw expression</Label>
      <Textarea value={expr} onChange={(e) => onChange(e.target.value)}
        placeholder="e.g.  0.12 * (BASIC + DA)   or   PER_DAY * PH_DAYS"
        className="font-mono text-sm" rows={3} />
      <p className="mt-1 text-[11px] text-muted-foreground">
        Tokens: any short tag (BASIC, DA …) plus GROSS, EARNED_GROSS, P_DAYS, OT_DAYS, PH_DAYS, T_DAYS, BASE_DAYS, PER_DAY, QTY.
      </p>
    </div>
  );
}
