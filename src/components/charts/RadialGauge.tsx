import * as React from "react";
import { useEffect, useState } from "react";

type Props = {
  value: number;          // 0-100
  label?: string;
  sublabel?: string;
  size?: number;
  stroke?: number;
  from?: string;
  to?: string;
};

/**
 * Semi-circle speedometer-style gauge with gradient sweep and animated needle/fill.
 */
export function RadialGauge({
  value,
  label,
  sublabel,
  size = 220,
  stroke = 18,
  from = "oklch(0.78 0.18 200)",
  to = "oklch(0.62 0.22 295)",
}: Props) {
  const clamped = Math.max(0, Math.min(100, value));
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const dur = 900;
    const step = (ts: number) => {
      const t = Math.min(1, (ts - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimated(clamped * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [clamped]);

  const w = size;
  const h = size / 2 + stroke;
  const cx = w / 2;
  const cy = size / 2;
  const r = (size - stroke) / 2;
  const circumference = Math.PI * r;
  const offset = circumference - (animated / 100) * circumference;
  const gid = React.useId();

  return (
    <div className="relative inline-flex flex-col items-center" style={{ width: w }}>
      <svg width={w} height={h + 8} viewBox={`0 0 ${w} ${h + 8}`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        {/* track */}
        <path
          d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${w - stroke / 2} ${cy}`}
          fill="none"
          stroke="oklch(0.94 0.01 250)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {/* progress */}
        <path
          d={`M ${stroke / 2} ${cy} A ${r} ${r} 0 0 1 ${w - stroke / 2} ${cy}`}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ filter: "drop-shadow(0 6px 14px oklch(0.7 0.18 280 / 0.35))" }}
        />
      </svg>
      <div className="-mt-12 flex flex-col items-center">
        <div className="font-display text-4xl font-bold tabular-nums tracking-tight text-foreground">
          {Math.round(animated)}<span className="text-xl text-muted-foreground">%</span>
        </div>
        {label && <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{label}</div>}
        {sublabel && <div className="mt-0.5 text-[11px] text-muted-foreground/80">{sublabel}</div>}
      </div>
    </div>
  );
}
