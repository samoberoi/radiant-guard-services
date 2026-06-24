import { Link } from "@tanstack/react-router";
import { ChevronRight, Home } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Crumb = { label: string; to?: string };

export function PageHeader({
  title,
  description,
  crumbs,
  actions,
  icon: Icon,
  eyebrow,
}: {
  title: string;
  description?: string;
  crumbs: Crumb[];
  actions?: React.ReactNode;
  icon?: LucideIcon;
  eyebrow?: string;
}) {
  return (
    <div className="relative mb-6">
      <nav aria-label="Breadcrumb" className="mb-2.5">
        <ol className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
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
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
        <div className="flex min-w-0 items-start gap-3.5">
          {Icon && (
            <div className="relative mt-0.5 hidden shrink-0 sm:block">
              <div className="absolute inset-0 -z-10 rounded-2xl bg-gradient-to-br from-accent/30 to-accent/0 blur-md" />
              <div className="grid h-11 w-11 place-items-center rounded-2xl border border-accent/25 bg-gradient-to-br from-white to-accent/[0.06] text-accent shadow-sm">
                <Icon className="h-5 w-5" />
              </div>
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && (
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-accent">
                {eyebrow}
              </div>
            )}
            <h1 className="truncate font-display text-[22px] font-bold tracking-tight text-foreground sm:text-[26px]">
              {title}
            </h1>
            {description && (
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2 self-end">{actions}</div>
        )}
      </div>
      <div className="mt-5 h-px w-full bg-gradient-to-r from-border via-border/60 to-transparent" />
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
    <div className="glass rounded-2xl p-10 text-center sm:p-14">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15 text-accent">
        <Icon className="h-7 w-7" />
      </div>
      <h2 className="mt-5 font-display text-xl font-bold tracking-tight text-foreground">
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{message}</p>
      <span className="mt-5 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
        Coming soon
      </span>
    </div>
  );
}
