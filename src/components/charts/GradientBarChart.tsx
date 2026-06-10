import * as React from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";

export type GradientBarDatum = { label: string; value: number };

type Props = {
  data: GradientBarDatum[];
  height?: number;
  gradientFrom?: string;
  gradientTo?: string;
  formatValue?: (n: number) => string;
  id?: string;
};

export function GradientBarChart({
  data,
  height = 220,
  gradientFrom = "oklch(0.72 0.16 262)",
  gradientTo = "oklch(0.62 0.20 295)",
  formatValue,
  id = "grad-bar",
}: Props) {
  const fmt = formatValue ?? ((n: number) => n.toLocaleString());
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 12, right: 8, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={gradientFrom} stopOpacity={1} />
              <stop offset="100%" stopColor={gradientTo} stopOpacity={0.55} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="oklch(0.92 0.01 250)" vertical={false} strokeDasharray="3 6" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "oklch(0.55 0.02 250)", fontSize: 11, fontWeight: 600 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            tick={{ fill: "oklch(0.60 0.02 250)", fontSize: 11 }}
            tickFormatter={(v) => (typeof v === "number" ? fmt(v) : String(v))}
          />
          <Tooltip
            cursor={{ fill: "oklch(0.96 0.01 250 / 0.5)" }}
            contentStyle={{
              borderRadius: 14,
              border: "1px solid oklch(0.92 0.01 250)",
              background: "oklch(1 0 0 / 0.92)",
              backdropFilter: "blur(12px)",
              boxShadow: "0 20px 50px -30px rgba(10,20,40,0.25)",
              fontSize: 12,
            }}
            formatter={(v: number) => [fmt(v), ""]}
            labelStyle={{ fontWeight: 600, color: "oklch(0.30 0.02 250)" }}
          />
          <Bar dataKey="value" radius={[8, 8, 4, 4]} fill={`url(#${id})`}>
            {data.map((_, i) => <Cell key={i} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
