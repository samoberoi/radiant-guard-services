import * as React from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * HeroTile — the unified page hero used across every admin page.
 * Mirrors the dashboard "Leadership snapshot" tile.
 *
 *  ┌────────────────────────────────────────────────────────┐
 *  │ ◦ EYEBROW                            [right slot]      │
 *  │ Big Title       chip / subtitle                        │
 *  │ optional description line                              │
 *  └────────────────────────────────────────────────────────┘
 */
export interface HeroTileProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  chip?: React.ReactNode;
  description?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export function HeroTile({
  eyebrow,
  title,
  subtitle,
  chip,
  description,
  right,
  className,
  icon: Icon = Sparkles,
}: HeroTileProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-border/70 bg-card/85 p-6 backdrop-blur-xl shadow-[0_1px_0_0_rgba(255,255,255,0.7)_inset,0_20px_60px_-30px_rgba(10,20,40,0.18)] sm:p-8",
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[oklch(0.7_0.16_262/0.18)] blur-3xl" />
      <div className="pointer-events-none absolute -left-20 -bottom-24 h-64 w-64 rounded-full bg-[oklch(0.75_0.12_200/0.15)] blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />

      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-3">
          {eyebrow && (
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground backdrop-blur">
              <Icon className="h-3.5 w-3.5 text-accent" />
              {eyebrow}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <div className="font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              {title}
            </div>
            {subtitle && (
              <div className="pb-1.5 text-xl font-semibold text-muted-foreground/80 sm:text-2xl">
                {subtitle}
              </div>
            )}
            {chip && (
              <span className="mb-2 inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent ring-1 ring-inset ring-accent/30">
                {chip}
              </span>
            )}
          </div>
          {description && (
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        {right && <div className="flex shrink-0 flex-wrap items-center gap-2">{right}</div>}
      </div>
    </div>
  );
}
