import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DEFAULT_PRESET,
  FORMULA_VARIABLES,
  slugifyVar,
  type CompositeComponent,
  type FormulaConfig,
  type PresetBase,
  type PresetDivisor,
  type PresetFormula,
  type PresetMultiplier,
  evaluateFormula,
  presetToExpression,
  validateExpression,
} from "@/lib/formula-engine";

type Props = {
  value: FormulaConfig | null;
  onChange: (next: FormulaConfig | null) => void;
  availableBases?: string[];
};

const MULTIPLIER_OPTIONS: { value: PresetMultiplier; label: string }[] = [
  { value: "present", label: "Present Duties" },
  { value: "worked",  label: "Worked Duties" },
  { value: "ot",      label: "OT Duties" },
  { value: "ph",      label: "PH Duties" },
  { value: "wo",      label: "Weekly Off" },
  { value: "el",      label: "Earned Leave" },
  { value: "pl",      label: "Paid Leave" },
];

const BASE_KIND_OPTIONS: { value: PresetBase["kind"]; label: string }[] = [
  { value: "composite",     label: "Combine components (Basic + DA + …)" },
  { value: "basic",         label: "Basic only" },
  { value: "da",            label: "DA only" },
  { value: "basic_plus_da", label: "Basic + DA" },
  { value: "gross",         label: "Gross" },
  { value: "fixed_amount",  label: "Fixed Amount (₹)" },
  { value: "variable",      label: "Custom Variable" },
];

const DEFAULT_AVAILABLE_BASES = ["Basic", "DA", "HRA", "Special Allowance", "Conveyance", "Gross"];

const DIVISOR_OPTIONS: { value: string; label: string }[] = [
  { value: "none",          label: "—" },
  { value: "fixed_days",    label: "Fixed Days (client)" },
  { value: "working_days",  label: "Working Days" },
  { value: "payable_days",  label: "Payable Days" },
  { value: "month_26",      label: "Fixed 26" },
  { value: "month_28",      label: "Fixed 28" },
  { value: "month_30",      label: "Fixed 30" },
  { value: "month_31",      label: "Fixed 31" },
];

function divisorFromUi(v: string): PresetDivisor {
  if (v.startsWith("month_")) {
    const d = Number(v.split("_")[1]);
    return { kind: "fixed_days_month", days: d as 26 | 28 | 30 | 31 };
  }
  return v as PresetDivisor;
}

function divisorToUi(d: PresetDivisor | undefined): string {
  if (!d || d === "none") return "none";
  if (typeof d === "string") return d;
  return `month_${d.days}`;
}

const SAMPLE_CTX = {
  basic: 10000, da: 2000, gross: 15000, fixed_amount: 200,
  fixed_days: 26, working_days: 30, payable_days: 26,
  present: 24, worked: 24, ot: 2, ph: 1, wo: 4, el: 0, pl: 0,
};

export function FormulaBuilder({ value, onChange, availableBases }: Props) {
  const baseChoices = (availableBases && availableBases.length > 0 ? availableBases : DEFAULT_AVAILABLE_BASES);
  const mode = value?.mode ?? "preset";
  const preset = value?.mode === "preset" ? value.preset : DEFAULT_PRESET;
  const expression = value?.mode === "advanced" ? value.expression : "";

  const setMode = (m: "preset" | "advanced") => {
    if (m === "preset") onChange({ mode: "preset", preset });
    else onChange({ mode: "advanced", expression: expression || presetToExpression(preset) });
  };

  const updatePreset = (p: Partial<PresetFormula>) =>
    onChange({ mode: "preset", preset: { ...preset, ...p } });

  const compiledPreview = useMemo(() => {
    if (!value) return { expr: "", amount: 0, error: undefined as string | undefined };
    if (value.mode === "preset") {
      const expr = presetToExpression(value.preset);
      const res = evaluateFormula(value, SAMPLE_CTX);
      return { expr, amount: res.amount, error: res.error };
    }
    const v = validateExpression(value.expression);
    if (!v.ok) return { expr: value.expression, amount: 0, error: v.error };
    const res = evaluateFormula(value, SAMPLE_CTX);
    return { expr: value.expression, amount: res.amount, error: res.error };
  }, [value]);

  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Hybrid Formula</Label>
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          <button
            type="button"
            className={`px-3 py-1 text-xs ${mode === "preset" ? "bg-primary text-primary-foreground" : "bg-background"}`}
            onClick={() => setMode("preset")}
          >Preset</button>
          <button
            type="button"
            className={`px-3 py-1 text-xs ${mode === "advanced" ? "bg-primary text-primary-foreground" : "bg-background"}`}
            onClick={() => setMode("advanced")}
          >Advanced</button>
        </div>
      </div>

      {mode === "preset" && (
        <div className="grid gap-3">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">Base</Label>
              <Select
                value={preset.base.kind}
                onValueChange={(v) => {
                  const k = v as PresetBase["kind"];
                  let next: PresetBase;
                  if (k === "fixed_amount") next = { kind: "fixed_amount", value: 0 };
                  else if (k === "variable") next = { kind: "variable", name: "basic" };
                  else if (k === "composite") next = { kind: "composite", components: [{ name: "Basic", operator: "+" }, { name: "DA", operator: "+" }] };
                  else next = { kind: k } as PresetBase;
                  updatePreset({ base: next });
                }}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BASE_KIND_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {preset.base.kind === "fixed_amount" && (
                <Input
                  type="number"
                  className="h-9"
                  value={preset.base.value}
                  onChange={(e) => updatePreset({ base: { kind: "fixed_amount", value: Number(e.target.value) || 0 } })}
                  placeholder="₹"
                />
              )}
              {preset.base.kind === "variable" && (
                <Select
                  value={String(preset.base.name)}
                  onValueChange={(v) => updatePreset({ base: { kind: "variable", name: v as never } })}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FORMULA_VARIABLES.map((v) => (
                      <SelectItem key={String(v.key)} value={String(v.key)}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              {preset.base.kind === "composite" && (() => {
                const comps: CompositeComponent[] = preset.base.components ?? [];
                const setComps = (next: CompositeComponent[]) =>
                  updatePreset({ base: { kind: "composite", components: next } });
                const selectedNames = new Set(comps.map((c) => c.name));
                const remaining = baseChoices.filter((b) => !selectedNames.has(b));
                return (
                  <div className="rounded-md border border-border bg-card p-2 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {comps.map((c, idx) => (
                        <span key={`${c.name}-${idx}`} className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-2 py-0.5 text-xs">
                          <button
                            type="button"
                            className="font-mono text-[11px] text-muted-foreground hover:text-foreground"
                            title="Toggle + / −"
                            onClick={() => {
                              const next = comps.slice();
                              next[idx] = { ...c, operator: c.operator === "+" ? "-" : "+" };
                              setComps(next);
                            }}
                          >{c.operator}</button>
                          <span>{c.name}</span>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setComps(comps.filter((_, i) => i !== idx))}
                          ><X className="h-3 w-3" /></button>
                        </span>
                      ))}
                      {comps.length === 0 && (
                        <span className="text-[11px] text-muted-foreground">Pick one or more components below…</span>
                      )}
                    </div>
                    {remaining.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 border-t border-border pt-2">
                        {remaining.map((b) => (
                          <button
                            key={b}
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                            onClick={() => setComps([...comps, { name: b, operator: "+" }])}
                          ><Plus className="h-3 w-3" /> {b}</button>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground">Click the +/− chip to subtract a component. Resolved variable: <code>{comps.map((c) => `${c.operator === "-" ? "-" : "+"}${slugifyVar(c.name)}`).join(" ") || "0"}</code></p>
                  </div>
                );
              })()}
            </div>


            <div className="grid gap-1.5">
              <Label className="text-xs">Operator</Label>
              <Select
                value={preset.operator}
                onValueChange={(v) => updatePreset({ operator: v as PresetFormula["operator"] })}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="flat">Flat amount</SelectItem>
                  <SelectItem value="percent">% of base</SelectItem>
                  <SelectItem value="per_day">Per day × multiplier</SelectItem>
                  <SelectItem value="divide">Divide by</SelectItem>
                </SelectContent>
              </Select>
              {preset.operator === "percent" && (
                <Input
                  type="number" step="0.01" className="h-9"
                  value={preset.percent ?? 0}
                  onChange={(e) => updatePreset({ percent: Number(e.target.value) || 0 })}
                  placeholder="e.g. 12"
                />
              )}
            </div>
          </div>

          {(preset.operator === "per_day" || preset.operator === "divide") && (
            <div className="grid gap-1.5">
              <Label className="text-xs">Divisor (day basis)</Label>
              <Select value={divisorToUi(preset.divisor)} onValueChange={(v) => updatePreset({ divisor: divisorFromUi(v) })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIVISOR_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label className="text-xs">Multipliers (summed)</Label>
            <div className="flex flex-wrap gap-1.5 rounded-md border border-border bg-card p-2 min-h-[40px]">
              {(preset.multipliers ?? []).map((m, idx) => {
                const opt = MULTIPLIER_OPTIONS.find((o) => o.value === m);
                return (
                  <span key={`${m}-${idx}`} className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-2 py-0.5 text-xs">
                    {opt?.label ?? m}
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => updatePreset({ multipliers: (preset.multipliers ?? []).filter((_, i) => i !== idx) })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
              {MULTIPLIER_OPTIONS.filter((o) => !(preset.multipliers ?? []).includes(o.value)).map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                  onClick={() => updatePreset({ multipliers: [...(preset.multipliers ?? []), o.value] })}
                >
                  <Plus className="h-3 w-3" /> {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Cap (max ₹)</Label>
              <Input
                type="number" className="h-9"
                value={preset.capAmount ?? ""}
                onChange={(e) => updatePreset({ capAmount: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Floor (min ₹)</Label>
              <Input
                type="number" className="h-9"
                value={preset.floorAmount ?? ""}
                onChange={(e) => updatePreset({ floorAmount: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
          </div>
        </div>
      )}

      {mode === "advanced" && (
        <div className="grid gap-2">
          <Textarea
            rows={3}
            className="font-mono text-xs"
            value={expression}
            onChange={(e) => onChange({ mode: "advanced", expression: e.target.value })}
            placeholder="e.g. (basic + da) * 0.12  or  min(15000, basic) * 0.05"
          />
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Available variables & functions</summary>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 md:grid-cols-3">
              {FORMULA_VARIABLES.map((v) => (
                <div key={String(v.key)} className="text-[11px]"><code className="text-foreground">{v.label}</code> — <span className="text-muted-foreground">{v.desc}</span></div>
              ))}
              <div className="text-[11px] col-span-full mt-1"><code>min(a,b)</code> · <code>max(a,b)</code> · <code>round(x)</code> · <code>floor(x)</code> · <code>ceil(x)</code> · operators <code>+ − × ÷ ( )</code></div>
            </div>
          </details>
        </div>
      )}

      <div className="rounded-md border border-dashed border-border bg-card p-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="uppercase tracking-wider text-muted-foreground">Resolved · </span>
            <code className="text-foreground">{compiledPreview.expr || "—"}</code>
          </div>
          <div className="text-right">
            <div className="text-muted-foreground">Sample → ₹</div>
            <div className={`font-semibold tabular-nums ${compiledPreview.error ? "text-destructive" : "text-emerald-700"}`}>
              {compiledPreview.error ? compiledPreview.error : compiledPreview.amount.toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FormulaBuilderToggle({
  enabled,
  onToggle,
  value,
  onChange,
}: {
  enabled: boolean;
  onToggle: (v: boolean) => void;
  value: FormulaConfig | null;
  onChange: (next: FormulaConfig | null) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
        <div>
          <div className="text-sm font-medium">Use Hybrid Formula (advanced)</div>
          <div className="text-xs text-muted-foreground">Override the standard calc with a preset row or free-form expression.</div>
        </div>
        <Switch checked={enabled} onCheckedChange={(v) => { onToggle(v); if (v && !value) onChange({ mode: "preset", preset: DEFAULT_PRESET }); }} />
      </div>
      {enabled && <FormulaBuilder value={value} onChange={onChange} />}
    </div>
  );
}

// Re-export for callers that don't need the toggle.
export { useState };
