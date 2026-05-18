import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * A delete check. `column` is the FK column on `table` that references the parent record id/value.
 * `extra` is an optional additional equality filter (e.g. only count "active" rows).
 */
export type DeleteCheck = {
  table: string;
  column: string;
  label: string; // human noun, plural e.g. "units", "client contracts"
  value?: string; // override the value to look for (defaults to the `id` prop)
  extra?: { column: string; value: string | number | boolean };
};

type Props = {
  id: string | undefined;
  entityLabel: string; // singular, e.g. "organization"
  checks: DeleteCheck[];
  onDelete: () => void;
  disabled?: boolean; // hard disable independent of dependency state
  disabledReason?: string;
  className?: string;
  size?: "sm" | "icon";
  ariaLabel?: string;
};

const COUNT_QUERY_KEY = (id: string | undefined, checks: DeleteCheck[]) => [
  "delete-guard",
  id,
  checks.map((c) => `${c.table}.${c.column}=${c.value ?? id ?? ""}|${c.extra?.column ?? ""}=${c.extra?.value ?? ""}`).join("&"),
];

export function useDependencyCounts(id: string | undefined, checks: DeleteCheck[]) {
  return useQuery({
    queryKey: COUNT_QUERY_KEY(id, checks),
    enabled: !!id && checks.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const results = await Promise.all(
        checks.map(async (c) => {
          const lookup = c.value ?? id!;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let q: any = (supabase as any)
            .from(c.table)
            .select("id", { count: "exact", head: true })
            .eq(c.column, lookup);
          if (c.extra) q = q.eq(c.extra.column, c.extra.value);
          const { count, error } = await q;
          if (error) {
            // Don't block the UI on a stray query error — log and assume 0
            console.warn(`[DeleteGuard] count failed for ${c.table}.${c.column}`, error);
            return { label: c.label, count: 0 };
          }
          return { label: c.label, count: count ?? 0 };
        }),
      );
      const total = results.reduce((s, r) => s + r.count, 0);
      const breakdown = results.filter((r) => r.count > 0);
      return { total, breakdown };
    },
  });
}

export function DeleteGuardButton({
  id,
  entityLabel,
  checks,
  onDelete,
  disabled,
  disabledReason,
  className,
  size = "sm",
  ariaLabel = "Delete",
}: Props) {
  const { data } = useDependencyCounts(id, checks);
  const total = data?.total ?? 0;
  const breakdown = data?.breakdown ?? [];
  const blockedByDeps = total > 0;
  const isDisabled = !!disabled || blockedByDeps;

  const message = disabled
    ? (disabledReason ?? "Delete disabled")
    : blockedByDeps
      ? `Cannot delete — ${breakdown
          .map((b) => `${b.count} ${b.label}`)
          .join(", ")} still linked to this ${entityLabel}. Remove them first.`
      : "Delete";

  const btn = (
    <Button
      size={size}
      variant="ghost"
      className={cn(
        "h-8 w-8 p-0 text-muted-foreground hover:text-destructive",
        isDisabled && "cursor-not-allowed opacity-40 hover:text-muted-foreground",
        className,
      )}
      onClick={(e) => {
        if (isDisabled) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        onDelete();
      }}
      aria-label={ariaLabel}
      aria-disabled={isDisabled}
      type="button"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{btn}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs leading-snug">
          {message}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
