import { useMemo, useState } from "react";
import { ChevronDown, Settings2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  type FilterCondition,
  type FilterField,
  type Op,
  OPS_BY_TYPE,
  OP_LABEL,
  newCondition,
} from "@/lib/advanced-filters";

type Props = {
  fields: FilterField[];
  value: FilterCondition[];
  onChange: (next: FilterCondition[]) => void;
  className?: string;
  /** Field keys to hide by default; user can toggle from the gear menu. */
  defaultHidden?: string[];
};

function defaultPlaceholder(f: FilterField): string {
  switch (f.type) {
    case "enum":
      return `All ${f.label.toLowerCase()}`;
    case "boolean":
      return f.label;
    default:
      return f.label;
  }
}

function chipSummary(f: FilterField, c: FilterCondition | undefined): string {
  if (!c) return defaultPlaceholder(f);
  if (c.op === "is_empty" || c.op === "not_empty" || c.op === "is_true" || c.op === "is_false") {
    return `${f.label} · ${OP_LABEL[c.op]}`;
  }
  if (c.op === "between") {
    return `${f.label}: ${c.value || "…"} – ${c.value2 || "…"}`;
  }
  if (c.op === "eq" && (f.type === "enum" || f.type === "text") && c.value) {
    return `${f.label}: ${c.value}`;
  }
  return `${f.label} ${OP_LABEL[c.op]} ${c.value || "…"}`;
}

function FieldChip({
  field,
  condition,
  onApply,
  onClear,
}: {
  field: FilterField;
  condition: FilterCondition | undefined;
  onApply: (c: FilterCondition) => void;
  onClear: () => void;
}) {
  const allowedOps = OPS_BY_TYPE[field.type];
  const [open, setOpen] = useState(false);
  const [op, setOp] = useState<Op>(condition?.op ?? allowedOps[0]);
  const [val, setVal] = useState(condition?.value ?? "");
  const [val2, setVal2] = useState(condition?.value2 ?? "");

  const active = !!condition;
  const needsNoValue = op === "is_empty" || op === "not_empty" || op === "is_true" || op === "is_false";
  const inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : "text";

  const apply = () => {
    const c: FilterCondition = {
      ...newCondition(field.key, field.type),
      op,
      value: val,
      value2: op === "between" ? val2 : undefined,
    };
    onApply(c);
    setOpen(false);
  };

  const reset = () => {
    setOp(allowedOps[0]);
    setVal("");
    setVal2("");
    onClear();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => {
      setOpen(o);
      if (o) {
        setOp(condition?.op ?? allowedOps[0]);
        setVal(condition?.value ?? "");
        setVal2(condition?.value2 ?? "");
      }
    }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "h-9 justify-between rounded-xl border-border/70 bg-card px-3 text-xs font-medium shadow-sm",
            active ? "border-amber-400/60 bg-amber-50 text-foreground dark:bg-amber-500/10" : "text-muted-foreground",
            "min-w-[150px]"
          )}
        >
          <span className="truncate">{chipSummary(field, condition)}</span>
          <ChevronDown className="ml-1.5 h-3.5 w-3.5 opacity-60 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] p-3">
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {field.label}
          </div>

          {field.type !== "boolean" && (
            <Select value={op} onValueChange={(v) => setOp(v as Op)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {allowedOps.map((o) => (
                  <SelectItem key={o} value={o} className="text-xs">{OP_LABEL[o]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {field.type === "boolean" ? (
            <Select value={op} onValueChange={(v) => setOp(v as Op)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="is_true" className="text-xs">True</SelectItem>
                <SelectItem value="is_false" className="text-xs">False</SelectItem>
              </SelectContent>
            </Select>
          ) : needsNoValue ? null : field.type === "enum" && field.options ? (
            op === "in" || op === "not_in" ? (
              <Input placeholder="value1, value2" value={val} onChange={(e) => setVal(e.target.value)} className="h-9 text-xs" />
            ) : (
              <Select value={val} onValueChange={setVal}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {field.options.map((o) => (
                    <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          ) : op === "between" ? (
            <div className="flex gap-2">
              <Input type={inputType} value={val} onChange={(e) => setVal(e.target.value)} className="h-9 text-xs" placeholder="From" />
              <Input type={inputType} value={val2} onChange={(e) => setVal2(e.target.value)} className="h-9 text-xs" placeholder="To" />
            </div>
          ) : op === "in" || op === "not_in" ? (
            <Input placeholder="value1, value2" value={val} onChange={(e) => setVal(e.target.value)} className="h-9 text-xs" />
          ) : (
            <Input type={inputType} value={val} onChange={(e) => setVal(e.target.value)} className="h-9 text-xs" placeholder="Value" />
          )}

          <div className="flex justify-between gap-2 pt-1">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={reset}>Clear</Button>
            <Button size="sm" className="h-8 text-xs" onClick={apply}>Apply</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AdvancedFilters({ fields, value, onChange, className, defaultHidden = [] }: Props) {
  const [visible, setVisible] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const f of fields) init[f.key] = !defaultHidden.includes(f.key);
    return init;
  });

  const conditionByField = useMemo(() => {
    const map = new Map<string, FilterCondition>();
    for (const c of value) map.set(c.field, c);
    return map;
  }, [value]);

  const upsert = (c: FilterCondition) => {
    const next = value.filter((x) => x.field !== c.field);
    next.push(c);
    onChange(next);
  };
  const clearField = (key: string) => onChange(value.filter((c) => c.field !== key));
  const resetAll = () => onChange([]);

  const visibleFields = fields.filter((f) => visible[f.key]);

  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card/60 p-3 shadow-sm", className)}>
      {visibleFields.map((f) => (
        <FieldChip
          key={f.key}
          field={f}
          condition={conditionByField.get(f.key)}
          onApply={upsert}
          onClear={() => clearField(f.key)}
        />
      ))}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={resetAll}
        disabled={value.length === 0}
        className="h-9 gap-1.5 text-xs text-muted-foreground"
      >
        <RotateCcw className="h-3.5 w-3.5" /> Reset
      </Button>

      <div className="ml-auto">
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-xl" title="Show / hide filters">
              <Settings2 className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-2">
            <div className="space-y-1">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Show filters
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {fields.map((f) => (
                  <label key={f.key} className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-secondary">
                    <span className="truncate pr-2">{f.label}</span>
                    <Switch
                      checked={!!visible[f.key]}
                      onCheckedChange={(v) => {
                        setVisible((s) => ({ ...s, [f.key]: v }));
                        if (!v) clearField(f.key);
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
