import { cn } from "@/lib/utils";

export function MiniStat({
  label,
  value,
  tone,
  subtle,
}: {
  label: string;
  value: number | string;
  tone?: "accent" | "warning" | "destructive";
  subtle?: string;
}) {
  const valueTone =
    tone === "destructive"
      ? "text-destructive"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "accent"
          ? "text-accent"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 font-display text-2xl font-bold tracking-tight tabular-nums", valueTone)}>
        {value}
      </div>
      {subtle && <div className="mt-0.5 text-[11px] text-muted-foreground">{subtle}</div>}
    </div>
  );
}
