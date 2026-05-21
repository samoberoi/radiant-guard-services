import { useState } from "react";
import { Plus, X, Filter as FilterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  type FilterCondition,
  type FilterField,
  type Op,
  OPS_BY_TYPE,
  OP_LABEL,
  describeCondition,
  newCondition,
} from "@/lib/advanced-filters";

type Props = {
  fields: FilterField[];
  value: FilterCondition[];
  onChange: (next: FilterCondition[]) => void;
  className?: string;
};

export function AdvancedFilters({ fields, value, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const [draftField, setDraftField] = useState<string>(fields[0]?.key ?? "");
  const [draftOp, setDraftOp] = useState<Op>(fields[0] ? OPS_BY_TYPE[fields[0].type][0] : "eq");
  const [draftValue, setDraftValue] = useState("");
  const [draftValue2, setDraftValue2] = useState("");

  const currentField = fields.find((f) => f.key === draftField) ?? fields[0];
  const allowedOps = currentField ? OPS_BY_TYPE[currentField.type] : [];

  const reset = () => {
    const first = fields[0];
    setDraftField(first?.key ?? "");
    setDraftOp(first ? OPS_BY_TYPE[first.type][0] : "eq");
    setDraftValue("");
    setDraftValue2("");
  };

  const handleAdd = () => {
    if (!currentField) return;
    const c: FilterCondition = {
      ...newCondition(currentField.key, currentField.type),
      op: draftOp,
      value: draftValue,
      value2: draftOp === "between" ? draftValue2 : undefined,
    };
    onChange([...value, c]);
    setOpen(false);
    reset();
  };

  const removeAt = (id: string) => onChange(value.filter((c) => c.id !== id));
  const clearAll = () => onChange([]);

  const needsNoValue = draftOp === "is_empty" || draftOp === "not_empty" || draftOp === "is_true" || draftOp === "is_false";
  const inputType =
    currentField?.type === "number" ? "number" : currentField?.type === "date" ? "date" : "text";

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 rounded-lg">
              <FilterIcon className="mr-1.5 h-3.5 w-3.5" />
              Add filter
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[340px] p-3">
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                New filter condition
              </div>
              <Select
                value={draftField}
                onValueChange={(v) => {
                  setDraftField(v);
                  const fd = fields.find((f) => f.key === v);
                  if (fd) setDraftOp(OPS_BY_TYPE[fd.type][0]);
                  setDraftValue("");
                  setDraftValue2("");
                }}
              >
                <SelectTrigger className="h-9"><SelectValue placeholder="Field" /></SelectTrigger>
                <SelectContent>
                  {fields.map((f) => (
                    <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={draftOp} onValueChange={(v) => setDraftOp(v as Op)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Operator" /></SelectTrigger>
                <SelectContent>
                  {allowedOps.map((op) => (
                    <SelectItem key={op} value={op}>{OP_LABEL[op]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {!needsNoValue && (
                currentField?.type === "enum" && currentField.options ? (
                  draftOp === "in" || draftOp === "not_in" ? (
                    <Input
                      placeholder="value1, value2, value3"
                      value={draftValue}
                      onChange={(e) => setDraftValue(e.target.value)}
                      className="h-9"
                    />
                  ) : (
                    <Select value={draftValue} onValueChange={setDraftValue}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Value" /></SelectTrigger>
                      <SelectContent>
                        {currentField.options.map((o) => (
                          <SelectItem key={o} value={o}>{o}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )
                ) : draftOp === "in" || draftOp === "not_in" ? (
                  <Input
                    placeholder="value1, value2, value3"
                    value={draftValue}
                    onChange={(e) => setDraftValue(e.target.value)}
                    className="h-9"
                  />
                ) : draftOp === "between" ? (
                  <div className="flex gap-2">
                    <Input type={inputType} value={draftValue} onChange={(e) => setDraftValue(e.target.value)} className="h-9" />
                    <Input type={inputType} value={draftValue2} onChange={(e) => setDraftValue2(e.target.value)} className="h-9" />
                  </div>
                ) : (
                  <Input
                    type={inputType}
                    value={draftValue}
                    onChange={(e) => setDraftValue(e.target.value)}
                    className="h-9"
                  />
                )
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={handleAdd} disabled={!currentField}>
                  <Plus className="mr-1 h-3.5 w-3.5" />Add
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {value.length > 0 && (
          <>
            {value.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-medium text-foreground"
              >
                {describeCondition(fields, c)}
                <button
                  type="button"
                  onClick={() => removeAt(c.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={clearAll}>
              Clear all
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
