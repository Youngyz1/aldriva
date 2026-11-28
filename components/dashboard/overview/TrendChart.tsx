"use client";

/**
 * components/dashboard/overview/TrendChart.tsx
 *
 * Recharts area trend with accessible table fallback.
 * docs/design/dashboard-overview/04-components.md §11 and 01 §1.5.
 */

import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatMoney } from "@/lib/money";

export interface TrendPoint {
  bucket: string; // YYYY-MM-DD
  value: number;
}

export interface TrendChartProps {
  data: TrendPoint[];
  currency?: string;
  color?: string;
  valueFormatter?: (v: number) => string;
  timezone?: string;
  periodLabel?: string;
  fallbackRows?: React.ReactNode;
  height?: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  valueFormatter?: (v: number) => string;
}

function CustomTooltip({ active, payload, label, valueFormatter }: CustomTooltipProps) {
  if (!active || !payload?.length || !valueFormatter) return null;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-xs">
      <p className="text-[11px] font-medium text-zinc-500">{label}</p>
      <p className="text-sm font-bold text-zinc-950">{valueFormatter(payload[0].value)}</p>
    </div>
  );
}

export function TrendChart({
  data,
  currency = "USD",
  color = "#c2410c",
  valueFormatter,
  timezone,
  periodLabel = "Last 7 days",
  fallbackRows,
  height = 196,
}: TrendChartProps) {
  const formatter =
    valueFormatter || ((val: number) => formatMoney(Math.round(val), currency));

  // If fewer than 2 buckets, show fallback rows rather than a misleading single-point chart
  if (!data || data.length < 2) {
    if (fallbackRows) return <>{fallbackRows}</>;
    return (
      <div className="h-36 flex items-center justify-center border border-dashed border-zinc-200 rounded-xl text-xs text-zinc-500">
        Not enough activity data in this period to display a trend.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{periodLabel}</span>
        {timezone && <span>Times in {timezone}</span>}
      </div>

      <div style={{ height: `${height}px` }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
            <CartesianGrid stroke="#f4f4f5" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="bucket"
              tick={{ fontSize: 10, fill: "#71717a" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#71717a" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatter(Number(v))}
            />
            <Tooltip content={<CustomTooltip valueFormatter={formatter} />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={color}
              fillOpacity={0.1}
              dot={false}
              activeDot={{ r: 4, fill: color, strokeWidth: 2, stroke: "#fff" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Accessible table fallback for screen readers */}
      <div className="sr-only">
        <table>
          <caption>Trend data for {periodLabel}</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {data.map((pt) => (
              <tr key={pt.bucket}>
                <td>{pt.bucket}</td>
                <td>{formatter(pt.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
