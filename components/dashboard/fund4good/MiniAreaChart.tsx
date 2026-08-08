"use client";

// Isolated in its own file so the dashboard can lazy-load Recharts (a sizable
// dependency) only once a chart tab actually needs to render, instead of
// pulling it into the initial dashboard bundle.

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface ChartPoint {
  date: string;
  value: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  valueFormatter?: (value: number) => string;
}

// Declared at module scope (not inside MiniAreaChart) — Recharts clones this
// element and injects active/payload/label at render time, so defining it
// inside the component would recreate the component type on every render.
function CustomTooltip({ active, payload, label, valueFormatter }: TooltipProps) {
  if (!active || !payload?.length || !valueFormatter) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="text-sm font-bold text-slate-900">{valueFormatter(payload[0].value)}</p>
    </div>
  );
}

interface MiniAreaChartProps {
  data: ChartPoint[];
  color?: string;
  gradientId: string;
  valueFormatter: (value: number) => string;
}

export default function MiniAreaChart({
  data,
  color = "#7c3aed",
  gradientId,
  valueFormatter,
}: MiniAreaChartProps) {
  return (
    <div className="h-36 w-full overflow-hidden">
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        minHeight={144}
        initialDimension={{ width: -1, height: 144 }}
      >
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.15} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            interval={3}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`)}
          />
          <Tooltip content={<CustomTooltip valueFormatter={valueFormatter} />} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4, fill: color, strokeWidth: 2, stroke: "#fff" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
