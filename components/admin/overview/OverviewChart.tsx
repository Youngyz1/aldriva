"use client";

/**
 * Recharts time-series for the admin Overview (client wrapper around server
 * data). Fixed-height container with ResponsiveContainer minHeight so the
 * chart can never collapse to zero height.
 */

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "./data";

export type ChartRow = {
  label: string;
  current: number;
  previous: number | null;
};

function ChartTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ value: number | string; dataKey: string }>;
  label?: string;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  const cur = payload.find((p) => p.dataKey === "current")?.value;
  const prev = payload.find((p) => p.dataKey === "previous")?.value;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      {typeof cur === "number" && (
        <p className="text-sm font-bold text-zinc-900">{formatMoney(cur, currency)}</p>
      )}
      {typeof prev === "number" && (
        <p className="text-xs font-semibold text-zinc-400">
          {formatMoney(prev, currency)} previous
        </p>
      )}
    </div>
  );
}

export default function OverviewChart({
  data,
  summary,
  compare,
  currency,
}: {
  data: ChartRow[];
  summary: string;
  compare: boolean;
  currency: string;
}) {
  return (
    <div className="h-[320px] min-h-[320px] w-full">
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        minHeight={320}
        initialDimension={{ width: -1, height: 320 }}
      >
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#f4f4f5" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#a1a1aa" }}
            axisLine={false}
            tickLine={false}
            minTickGap={32}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#a1a1aa" }}
            axisLine={false}
            tickLine={false}
            width={64}
            tickFormatter={(v: number) => formatMoney(v, currency)}
          />
          <Tooltip content={<ChartTooltip currency={currency} />} />
          <Line
            type="monotone"
            dataKey="current"
            name="Current period"
            stroke="#c2410c"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#c2410c", strokeWidth: 2, stroke: "#fff" }}
          />
          {compare && (
            <Line
              type="monotone"
              dataKey="previous"
              name="Previous period"
              stroke="#a1a1aa"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={false}
              activeDot={{ r: 3, fill: "#a1a1aa", strokeWidth: 2, stroke: "#fff" }}
              connectNulls
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      <p className="sr-only">{summary}</p>
    </div>
  );
}
