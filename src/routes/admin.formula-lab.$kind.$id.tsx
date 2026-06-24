/**
 * Shared "Formula Lab" page — drives the customizable formula engine
 * for any of the four manager tables:
 *   - /admin/formula-lab/allowance/$id
 *   - /admin/formula-lab/cost/$id
 *   - /admin/formula-lab/addition/$id
 *   - /admin/formula-lab/deduction/$id
 *
 * Loads the row, lets the user edit the engine fields (name, short_code/code,
 * formula JSON, day_driver, counts_in_t_days, include_in_ot when present),
 * and saves them back. Legacy fields (calc_type/percentage/base_components/
 * cap_amount/default_amount) are left untouched so old payroll logic keeps
 * working until the engine field is set.
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity-log";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  ComponentEditor,
  type ComponentEditorValue,
  type ComponentKind,
  type TagOption,
} from "@/components/ComponentEditor";
import type { Formula, DayDriver } from "@/lib/formula-engine";

type KindConfig = {
  table: string;
  module: string;
  shortCol: "short_code" | "code";
  hasTDays: boolean;
  hasIncludeOT: boolean;
};

const KIND_MAP: Record<ComponentKind, KindConfig> = {
  allowance: { table: "allowance_types",  module: "Allowance Manager",       shortCol: "short_code", hasTDays: true,  hasIncludeOT: true  },
  cost:      { table: "cost_components",  module: "Cost Component Manager",  shortCol: "code",       hasTDays: false, hasIncludeOT: false },
  addition:  { table: "addition_types",   module: "Addition Type Manager",   shortCol: "code",       hasTDays: true,  hasIncludeOT: false },
  deduction: { table: "deduction_types",  module: "Deduction Type Manager",  shortCol: "code",       hasTDays: false, hasIncludeOT: false },
};

export const Route = createFileRoute("/admin/formula-lab/$kind/$id")({
  component: FormulaLabPage,
});

function isKind(k: string): k is ComponentKind {
  return k === "allowance" || k === "cost" || k === "addition" || k === "deduction";
}

function FormulaLabPage() {
  const { kind, id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  if (!isKind(kind)) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">Unknown component kind: {kind}</p>
        <Link to="/admin/control-center" className="text-primary hover:underline">Back to Control Center</Link>
      </div>
    );
  }

  const cfg = KIND_MAP[kind];

  // ---- load row ----
  const { data: row, isLoading } = useQuery({
    queryKey: ["formula-lab", cfg.table, id] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(cfg.table as never)
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    },
  });

  // ---- load sibling rows for cycle detection + chip suggestions ----
  const { data: siblings = [] } = useQuery({
    queryKey: ["formula-lab", cfg.table, "siblings"] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(cfg.table as never)
        .select(`id,name,${cfg.shortCol},formula`)
        .neq("id", id);
      if (error) throw error;
      return (data as unknown) as Array<Record<string, unknown>>;
    },
  });

  // ---- editor state ----
  const [value, setValue] = useState<ComponentEditorValue | null>(null);

  useEffect(() => {
    if (!row) return;
    const f = (row.formula && typeof row.formula === "object" && Object.keys(row.formula as object).length > 0)
      ? (row.formula as Formula)
      : ({ mode: "flat", amount: Number(row.default_amount ?? row.amount ?? 0) || 0 } as Formula);
    setValue({
      name: String(row.name ?? ""),
      shortCode: String(row[cfg.shortCol] ?? ""),
      formula: f,
      dayDriver: (String(row.day_driver ?? "ratio") || "ratio") as DayDriver,
      countsInTDays: Boolean(row.counts_in_t_days ?? false),
      includeInOT: Boolean(row.include_in_ot ?? false),
    });
  }, [row, cfg.shortCol]);

  // ---- chip suggestions (built-ins + every other component) ----
  const availableTags: TagOption[] = useMemo(() => {
    const out: TagOption[] = [
      { tag: "BASIC", label: "BASIC" },
      { tag: "DA", label: "DA" },
    ];
    const seen = new Set(out.map((o) => o.tag));
    for (const s of siblings) {
      const t = String(s[cfg.shortCol] ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (t && !seen.has(t)) {
        seen.add(t);
        out.push({ tag: t, label: String(s.name ?? t) });
      }
    }
    return out;
  }, [siblings, cfg.shortCol]);

  const otherFormulas = useMemo(() => siblings.map((s) => ({
    tag: String(s[cfg.shortCol] ?? ""),
    formula: (s.formula as Formula | null) ?? null,
  })), [siblings, cfg.shortCol]);

  // ---- save ----
  const saveMut = useMutation({
    mutationFn: async (v: ComponentEditorValue) => {
      const patch: Record<string, unknown> = {
        name: v.name.trim(),
        [cfg.shortCol]: v.shortCode.trim(),
        formula: v.formula,
        day_driver: v.dayDriver,
      };
      if (cfg.hasTDays) patch.counts_in_t_days = v.countsInTDays;
      if (cfg.hasIncludeOT) patch.include_in_ot = v.includeInOT;
      const { error } = await supabase
        .from(cfg.table as never)
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
      void logActivity({
        module: cfg.module,
        action: "update",
        entityType: cfg.table,
        entityId: id,
        entityLabel: v.name,
        details: { formula: v.formula, day_driver: v.dayDriver },
      });
    },
    onSuccess: () => {
      toast.success("Formula saved");
      qc.invalidateQueries({ queryKey: ["formula-lab", cfg.table] });
      qc.invalidateQueries({ queryKey: ["admin", "allowance-types"] });
      qc.invalidateQueries({ queryKey: ["admin", "cost-components"] });
      qc.invalidateQueries({ queryKey: ["admin", "addition-types"] });
      qc.invalidateQueries({ queryKey: ["admin", "deduction-types"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  if (isLoading || !value) {
    return (
      <div className="p-6">
        <PageHeader title="Formula Lab" description="Loading…" />
      </div>
    );
  }

  const backHref =
    kind === "allowance" ? "/admin/allowance-manager"
    : kind === "cost"      ? "/admin/cost-component-manager"
    : kind === "addition"  ? "/admin/addition-type-manager"
    :                        "/admin/deduction-type-manager";

  return (
    <div>
      <PageHeader
        title={`Formula Lab — ${row?.name ?? ""}`}
        description="Build or edit how this component is calculated. Changes apply to every contract and payroll using it."
        crumbs={[
          { label: "Control Center", to: "/admin/control-center" },
          { label: KIND_MAP[kind].module, to: backHref },
          { label: "Formula" },
        ]}
      />

      <div className="mb-3 flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={() => navigate({ to: backHref })}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
        </Button>
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => value && saveMut.mutate(value)}
          disabled={saveMut.isPending}
        >
          <Save className="mr-1.5 h-4 w-4" /> {saveMut.isPending ? "Saving…" : "Save formula"}
        </Button>
      </div>

      <ComponentEditor
        value={value}
        onChange={setValue}
        availableTags={availableTags}
        kind={kind}
        otherFormulas={otherFormulas}
      />
    </div>
  );
}
