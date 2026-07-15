import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function MiniStat({
  label,
  value,
  tone,
  subtle,
  trend,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  tone?: "accent" | "warning" | "destructive";
  subtle?: string;
  /** { delta: "+12%" | "-3", direction: "up" | "down" | "flat" } */
  trend?: { delta: string; direction?: "up" | "down" | "flat"; label?: string };
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const valueTone =
    tone === "destructive"
      ? "text-destructive"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "accent"
          ? "text-accent"
          : "text-foreground";

  const dir = trend?.direction ?? "flat";
  const TrendIcon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;
  const trendTone =
    dir === "up"
      ? "text-emerald-600 bg-emerald-500/10 ring-emerald-500/20"
      : dir === "down"
        ? "text-rose-600 bg-rose-500/10 ring-rose-500/20"
        : "text-muted-foreground bg-muted ring-border";

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card/90 px-4 py-3.5 shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset,0_10px_28px_-18px_rgba(15,23,42,0.18)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[0_1px_0_0_rgba(255,255,255,0.7)_inset,0_18px_36px_-20px_color-mix(in_oklab,var(--accent)_35%,transparent)]">
      <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-accent/5 blur-2xl transition-opacity group-hover:bg-accent/10" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </div>
          <div
            className={cn(
              "mt-1 font-display text-[26px] font-bold leading-none tracking-tight tabular-nums",
              valueTone,
            )}
          >
            {value}
          </div>
        </div>
        {Icon && (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-inset ring-accent/20">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="relative mt-2.5 flex items-center gap-2">
        {trend && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset tabular-nums",
              trendTone,
            )}
          >
            <TrendIcon className="h-3 w-3" />
            {trend.delta}
          </span>
        )}
        {(trend?.label || subtle) && (
          <span className="truncate text-[11px] text-muted-foreground">
            {trend?.label ?? subtle}
          </span>
        )}
      </div>
    </div>
  );
}
