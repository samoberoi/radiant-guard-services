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
        "relative overflow-hidden rounded-[32px] border border-border/60 bg-gradient-to-br from-card/90 via-card/70 to-accent/[0.04] p-6 backdrop-blur-2xl shadow-[0_1px_0_0_rgba(255,255,255,0.9)_inset,0_30px_80px_-40px_rgba(10,20,40,0.25)] sm:p-9",
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-[oklch(0.65_0.22_262/0.25)] blur-3xl aurora-blob" />
      <div className="pointer-events-none absolute -left-24 -bottom-32 h-72 w-72 rounded-full bg-[oklch(0.78_0.13_200/0.22)] blur-3xl aurora-blob" style={{ animationDelay: "3s" }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
      <div className="pointer-events-none absolute inset-0 rounded-[32px] ring-1 ring-inset ring-border/40" />

      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-3">
          {eyebrow && (
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-foreground/70 shadow-sm backdrop-blur">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-accent/15 text-accent">
                <Icon className="h-2.5 w-2.5" />
              </span>
              {eyebrow}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <div className="font-display text-[38px] font-bold leading-[1.05] tracking-tight text-foreground sm:text-[46px]">
              {title}
            </div>
            {subtitle && (
              <div className="pb-1.5 text-xl font-semibold text-muted-foreground/85 sm:text-2xl">
                {subtitle}
              </div>
            )}
            {chip && (
              <span className="mb-2 inline-flex items-center rounded-full bg-accent/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent ring-1 ring-inset ring-accent/30">
                {chip}
              </span>
            )}
          </div>
          {description && (
            <p className="max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        {right && <div className="flex shrink-0 flex-wrap items-center gap-2">{right}</div>}
      </div>
    </div>
  );
}
