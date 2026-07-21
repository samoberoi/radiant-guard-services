import { Link } from "@tanstack/react-router";
import { ChevronRight, Home } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Crumb = { label: string; to?: string };

export function PageHeader({
  title,
  description,
  crumbs,
  actions,
  icon: Icon,
  eyebrow,
  kpis,
  className,
}: {
  title: string;
  description?: string;
  crumbs: Crumb[];
  actions?: React.ReactNode;
  icon?: LucideIcon;
  eyebrow?: string;
  /** Optional KPI/stat row rendered below the title inside the hero */
  kpis?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative mb-6", className)}>
      <nav aria-label="Breadcrumb" className="mb-3">
        <ol className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <li>
            <Link
              to="/admin/customers"
              className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
            >
              <Home className="h-3 w-3" />
              <span>Home</span>
            </Link>
          </li>
          {crumbs.map((c, i) => (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
              <ChevronRight className="h-3 w-3 opacity-50" />
              {c.to && i < crumbs.length - 1 ? (
                <Link to={c.to} className="transition-colors hover:text-foreground">
                  {c.label}
                </Link>
              ) : (
                <span className="text-foreground/90">{c.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <div className="app-section-panel relative overflow-hidden p-4 sm:p-6">
        <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
          <div className="flex min-w-0 items-start gap-3.5">
            {Icon && (
              <div className="mt-0.5 hidden shrink-0 sm:block">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 ring-1 ring-inset ring-primary-foreground/15">
                  <Icon className="h-[18px] w-[18px]" />
                </div>
              </div>
            )}
            <div className="min-w-0">
              {eyebrow && (
                <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary ring-1 ring-inset ring-primary/15">
                  {eyebrow}
                </div>
              )}
              <h1 className="truncate font-display text-[22px] font-semibold leading-[1.15] text-foreground sm:text-[24px]">
                {title}
              </h1>
              {description && (
                <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
          </div>
          {actions && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 self-start">{actions}</div>
          )}
        </div>

        {kpis && (
          <div className="relative mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">{kpis}</div>
        )}
      </div>
    </div>
  );
}

/**
 * Compact stat pill used inside <PageHeader kpis={...}>.
 */
export function PageStat({
  label,
  value,
  tone = "default",
  icon: Icon,
  trend,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "accent" | "success" | "warning" | "destructive";
  icon?: LucideIcon;
  trend?: { delta: string; direction?: "up" | "down" | "flat" };
}) {
  const toneClasses =
    tone === "accent"
      ? "text-accent"
      : tone === "success"
        ? "text-emerald-600"
        : tone === "warning"
          ? "text-amber-600"
          : tone === "destructive"
            ? "text-destructive"
            : "text-foreground";
  const trendCls =
    trend?.direction === "down"
      ? "text-rose-600 bg-rose-500/10 ring-rose-500/20"
      : trend?.direction === "flat"
        ? "text-muted-foreground bg-muted ring-border"
        : "text-emerald-600 bg-emerald-500/10 ring-emerald-500/20";
  return (
    <div className="group relative overflow-hidden rounded-3xl border border-border/70 bg-card px-3.5 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md">
      <div className="relative flex items-center gap-2.5">
        {Icon && (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
          <div className={cn("mt-0.5 whitespace-nowrap font-display text-[20px] font-semibold leading-none tabular-nums", toneClasses)}>{value}</div>
        </div>
        {trend && (
          <span
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset tabular-nums",
              trendCls,
            )}
          >
            {trend.delta}
          </span>
        )}
      </div>
    </div>
  );
}

export function ComingSoonCard({
  icon: Icon,
  title,
  message,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  message: string;
}) {
  return (
    <div className="app-section-panel p-10 text-center sm:p-14">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
        <Icon className="h-7 w-7" />
      </div>
      <h2 className="mt-5 font-display text-xl tracking-tight text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{message}</p>
      <span className="mt-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-primary">
        Coming soon
      </span>
    </div>
  );
}
