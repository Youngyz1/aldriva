/**
 * app/dashboard/reports/DashboardCharts.tsx
 * Client component — recharts charts wrapped in ResponsiveContainer.
 * Receives pre-fetched data from the server page.
 */

"use client";

import {
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

export type DailyPoint = { date: string; value: number };
export type TopEvent = { title: string; revenue: number };
export type NamedValue = { name: string; value: number };

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white p-3 shadow-sm sm:rounded-2xl sm:p-6">
      <h2 className="mb-3 text-[10px] font-black uppercase tracking-wide text-zinc-500 sm:mb-5 sm:text-sm">{title}</h2>
      {children}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-52 items-center justify-center rounded-2xl bg-zinc-50/60 text-sm font-semibold text-zinc-400">
      {message}
    </div>
  );
}

const tickStyle = { fontSize: 11, fill: "#71717a", fontWeight: 700 };
const gridProps = { stroke: "#e4e4e7", strokeDasharray: "3 3" };
const tooltipStyle = {
  contentStyle: { borderRadius: 12, border: "1px solid #e4e4e7", fontSize: 12, fontWeight: 700 },
  cursor: { fill: "rgba(249,115,22,0.05)" },
};

export function TicketsChart({ data }: { data: DailyPoint[] }) {
  if (!data.length) return <EmptyChart message="No ticket sales in the last 30 days." />;
  return (
    <div className="h-44 sm:h-56">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid {...gridProps} vertical={false} />
          <XAxis dataKey="date" tick={tickStyle} tickLine={false} axisLine={false} />
          <YAxis tick={tickStyle} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip {...tooltipStyle} formatter={(v: unknown) => [Number(v), "Tickets"]} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#f97316"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, fill: "#f97316" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RevenueChart({ data }: { data: DailyPoint[] }) {
  if (!data.length) return <EmptyChart message="No revenue data in the last 30 days." />;
  return (
    <div className="h-44 sm:h-56">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid {...gridProps} vertical={false} />
          <XAxis dataKey="date" tick={tickStyle} tickLine={false} axisLine={false} />
          <YAxis tick={tickStyle} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
          <Tooltip {...tooltipStyle} formatter={(v: unknown) => [`$${Number(v).toFixed(2)}`, "Revenue"]} />
          <Bar dataKey="value" fill="#f97316" radius={[6, 6, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonationsChart({ data }: { data: DailyPoint[] }) {
  if (!data.length) return <EmptyChart message="No donations in the last 30 days." />;
  return (
    <div className="h-44 sm:h-56">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid {...gridProps} vertical={false} />
          <XAxis dataKey="date" tick={tickStyle} tickLine={false} axisLine={false} />
          <YAxis tick={tickStyle} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
          <Tooltip {...tooltipStyle} formatter={(v: unknown) => [`$${Number(v).toFixed(2)}`, "Donations"]} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#10b981"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, fill: "#10b981" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TopEventsChart({ data }: { data: TopEvent[] }) {
  if (!data.length) return <EmptyChart message="No event revenue to rank yet." />;
  return (
    <div className="space-y-3">
      {data.map((ev, i) => {
        const max = data[0].revenue || 1;
        const pct = Math.round((ev.revenue / max) * 100);
        return (
          <div key={ev.title}>
            <div className="mb-1 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-black text-orange-700">
                  {i + 1}
                </span>
                <span className="truncate text-sm font-bold text-zinc-900">{ev.title}</span>
              </div>
              <span className="shrink-0 text-sm font-black text-emerald-700">
                ${Number(ev.revenue).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-orange-400 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function NamedBarChart({ data, valuePrefix = "" }: { data: NamedValue[]; valuePrefix?: string }) {
  if (!data.length) return <EmptyChart message="No data for this period." />;
  return (
    <div className="h-44 sm:h-56">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 4, left: 8, bottom: 0 }}>
          <CartesianGrid {...gridProps} horizontal={false} />
          <XAxis type="number" tick={tickStyle} tickLine={false} axisLine={false} tickFormatter={(v) => `${valuePrefix}${v}`} />
          <YAxis type="category" dataKey="name" width={100} tick={tickStyle} tickLine={false} axisLine={false} />
          <Tooltip {...tooltipStyle} formatter={(v: unknown) => [`${valuePrefix}${Number(v).toLocaleString()}`, "Total"]} />
          <Bar dataKey="value" fill="#8b5cf6" radius={[0, 6, 6, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChartsGrid({
  tickets,
  revenue,
  donations,
  topEvents,
  revenueByEvent = [],
  ticketsByEvent = [],
  donationsByCampaign = [],
  topOrganizers = [],
}: {
  tickets: DailyPoint[];
  revenue: DailyPoint[];
  donations: DailyPoint[];
  topEvents: TopEvent[];
  revenueByEvent?: NamedValue[];
  ticketsByEvent?: NamedValue[];
  donationsByCampaign?: NamedValue[];
  topOrganizers?: NamedValue[];
}) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid gap-4 sm:gap-6 xl:grid-cols-2">
        <ChartCard title="Tickets Sold">
          <TicketsChart data={tickets} />
        </ChartCard>
        <ChartCard title="Revenue">
          <RevenueChart data={revenue} />
        </ChartCard>
      </div>
      <div className="grid gap-4 sm:gap-6 xl:grid-cols-2">
        <ChartCard title="Donations">
          <DonationsChart data={donations} />
        </ChartCard>
        <ChartCard title="Top 5 Events by Revenue">
          <div className="py-2">
            <TopEventsChart data={topEvents} />
          </div>
        </ChartCard>
      </div>
      <div className="grid gap-4 sm:gap-6 xl:grid-cols-2">
        <ChartCard title="Revenue by Event">
          <NamedBarChart data={revenueByEvent} valuePrefix="$" />
        </ChartCard>
        <ChartCard title="Tickets by Event">
          <NamedBarChart data={ticketsByEvent} />
        </ChartCard>
      </div>
      <div className="grid gap-4 sm:gap-6 xl:grid-cols-2">
        <ChartCard title="Donations by Campaign">
          <NamedBarChart data={donationsByCampaign} valuePrefix="$" />
        </ChartCard>
        <ChartCard title="Top Organizations">
          <NamedBarChart data={topOrganizers} valuePrefix="$" />
        </ChartCard>
      </div>
    </div>
  );
}