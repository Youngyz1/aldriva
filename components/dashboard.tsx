"use client";

import Link from "next/link";
import * as Avatar from "@radix-ui/react-avatar";
import * as Separator from "@radix-ui/react-separator";
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Ticket,
  Heart,
  DollarSign,
  Calendar,
  MoreHorizontal,
  ChevronRight,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/* ─── Mock data ──────────────────────────────────────────────────── */

const revenueData = [
  { month: "Jan", revenue: 3200, donations: 1100 },
  { month: "Feb", revenue: 4800, donations: 1600 },
  { month: "Mar", revenue: 3900, donations: 1400 },
  { month: "Apr", revenue: 6200, donations: 2100 },
  { month: "May", revenue: 5400, donations: 1900 },
  { month: "Jun", revenue: 8100, donations: 2800 },
  { month: "Jul", revenue: 7600, donations: 2500 },
];

const ticketData = [
  { day: "Mon", tickets: 14 },
  { day: "Tue", tickets: 28 },
  { day: "Wed", tickets: 21 },
  { day: "Thu", tickets: 39 },
  { day: "Fri", tickets: 55 },
  { day: "Sat", tickets: 72 },
  { day: "Sun", tickets: 48 },
];

const recentActivity = [
  {
    name: "Sarah Mitchell",
    action: "Donated to Hope Gala",
    amount: "$250",
    time: "2m ago",
    avatar:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&fit=crop&crop=face",
    type: "donation",
  },
  {
    name: "James Carter",
    action: "Bought 2 tickets · Annual Gala",
    amount: "$120",
    time: "18m ago",
    avatar:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=64&h=64&fit=crop&crop=face",
    type: "ticket",
  },
  {
    name: "Priya Sharma",
    action: "Donated to Community Fund",
    amount: "$500",
    time: "1h ago",
    avatar:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=64&h=64&fit=crop&crop=face",
    type: "donation",
  },
  {
    name: "Michael Torres",
    action: "Bought 4 tickets · Music Festival",
    amount: "$200",
    time: "3h ago",
    avatar:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=64&h=64&fit=crop&crop=face",
    type: "ticket",
  },
  {
    name: "Emma Johnson",
    action: "Donated to Youth Programs",
    amount: "$75",
    time: "5h ago",
    avatar:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=64&h=64&fit=crop&crop=face",
    type: "donation",
  },
];

const upcomingEvents = [
  {
    title: "Annual Charity Gala",
    date: "Jul 28, 2025",
    tickets: 142,
    capacity: 200,
    color: "from-orange-500 to-orange-600",
  },
  {
    title: "Summer Music Festival",
    date: "Aug 5, 2025",
    tickets: 88,
    capacity: 500,
    color: "from-violet-500 to-violet-600",
  },
  {
    title: "Community 5K Run",
    date: "Aug 15, 2025",
    tickets: 231,
    capacity: 300,
    color: "from-emerald-500 to-emerald-600",
  },
];

/* ─── Sub-components ─────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  sub,
  change,
  positive,
  icon: Icon,
  gradient,
}: {
  label: string;
  value: string;
  sub: string;
  change: string;
  positive: boolean;
  icon: React.ElementType;
  gradient: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#16161d] p-5 ring-1 ring-white/[0.06]">
      <div
        className={`absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${gradient} opacity-10 blur-2xl`}
      />
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} shadow-lg`}
        >
          <Icon size={18} className="text-white" />
        </div>
        <span
          className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
            positive
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-red-500/10 text-red-400"
          }`}
        >
          {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {change}
        </span>
      </div>
      <p className="mt-4 text-2xl font-black tracking-tight text-white">
        {value}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-white/40">{label}</p>
      <p className="mt-3 text-xs text-white/25">{sub}</p>
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#1e1e28] px-3 py-2 text-xs shadow-2xl">
      <p className="mb-1 font-bold text-white/50">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name === "revenue" || p.name === "donations"
            ? `$${p.value.toLocaleString()}`
            : p.value}{" "}
          <span className="font-normal capitalize text-white/30">{p.name}</span>
        </p>
      ))}
    </div>
  );
}

/* ─── Main Dashboard ─────────────────────────────────────────────── */

export function Dashboard() {
  const now = new Date();
  const formatted = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-orange-400">
            Overview
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">
            Welcome back 👋
          </h1>
          <p className="mt-1 text-sm text-white/40">{formatted}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/events/new"
            className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600"
          >
            <Calendar size={15} />
            New Event
          </Link>
          <Link
            href="/dashboard/fundraisers/new"
            className="flex items-center gap-2 rounded-xl bg-white/[0.05] px-4 py-2.5 text-sm font-bold text-white/70 ring-1 ring-white/[0.08] transition hover:bg-white/[0.08] hover:text-white"
          >
            <Heart size={15} />
            Fundraiser
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Revenue"
          value="$39,200"
          sub="From ticket sales this year"
          change="+18.4%"
          positive={true}
          icon={DollarSign}
          gradient="from-orange-500 to-orange-600"
        />
        <StatCard
          label="Tickets Sold"
          value="1,284"
          sub="Across all active events"
          change="+12.1%"
          positive={true}
          icon={Ticket}
          gradient="from-violet-500 to-violet-600"
        />
        <StatCard
          label="Total Donations"
          value="$14,850"
          sub="Raised via fundraisers"
          change="+9.7%"
          positive={true}
          icon={Heart}
          gradient="from-emerald-500 to-emerald-600"
        />
        <StatCard
          label="Active Campaigns"
          value="7"
          sub="Events & fundraisers live"
          change="-1"
          positive={false}
          icon={TrendingUp}
          gradient="from-sky-500 to-sky-600"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Revenue + Donations Area Chart */}
        <div className="xl:col-span-2 rounded-2xl bg-[#16161d] p-5 ring-1 ring-white/[0.06]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-white">Revenue & Donations</p>
              <p className="text-xs text-white/30">Last 7 months</p>
            </div>
            <button className="flex items-center gap-1 rounded-lg bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-white/50 transition hover:text-white">
              <MoreHorizontal size={14} />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={revenueData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradDonations" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2} fill="url(#gradRevenue)" />
              <Area type="monotone" dataKey="donations" stroke="#10b981" strokeWidth={2} fill="url(#gradDonations)" />
            </AreaChart>
          </ResponsiveContainer>
          <div className="mt-3 flex items-center gap-5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-white/40">
              <span className="h-2 w-2 rounded-full bg-orange-500" />
              Revenue
            </span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-white/40">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Donations
            </span>
          </div>
        </div>

        {/* Ticket Sales Bar Chart */}
        <div className="rounded-2xl bg-[#16161d] p-5 ring-1 ring-white/[0.06]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-white">Ticket Sales</p>
              <p className="text-xs text-white/30">This week</p>
            </div>
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
              <TrendingUp size={11} />
              +24%
            </span>
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={ticketData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="tickets" fill="#a78bfa" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Row: Activity + Upcoming Events */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        {/* Recent Activity */}
        <div className="xl:col-span-3 rounded-2xl bg-[#16161d] p-5 ring-1 ring-white/[0.06]">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-black text-white">Recent Activity</p>
            <Link
              href="/dashboard/donations"
              className="flex items-center gap-1 text-xs font-bold text-orange-400 transition hover:text-orange-300"
            >
              View all <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="space-y-3">
            {recentActivity.map((item, i) => (
              <div key={i}>
                <div className="flex items-center gap-3">
                  <Avatar.Root className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl">
                    <Avatar.Image src={item.avatar} alt={item.name} className="h-full w-full object-cover" />
                    <Avatar.Fallback className="flex h-full w-full items-center justify-center bg-white/10 text-xs font-bold text-white">
                      {item.name[0]}
                    </Avatar.Fallback>
                  </Avatar.Root>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{item.name}</p>
                    <p className="truncate text-xs text-white/35">{item.action}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-black ${item.type === "donation" ? "text-emerald-400" : "text-violet-400"}`}>
                      {item.amount}
                    </p>
                    <p className="text-xs text-white/25">{item.time}</p>
                  </div>
                </div>
                {i < recentActivity.length - 1 && (
                  <Separator.Root className="mt-3 h-px bg-white/[0.04]" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Events */}
        <div className="xl:col-span-2 rounded-2xl bg-[#16161d] p-5 ring-1 ring-white/[0.06]">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-black text-white">Upcoming Events</p>
            <Link
              href="/dashboard/events"
              className="flex items-center gap-1 text-xs font-bold text-orange-400 transition hover:text-orange-300"
            >
              View all <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="space-y-3">
            {upcomingEvents.map((event, i) => {
              const pct = Math.round((event.tickets / event.capacity) * 100);
              return (
                <div key={i} className="rounded-xl bg-white/[0.03] p-3.5 ring-1 ring-white/[0.05]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">{event.title}</p>
                      <p className="mt-0.5 text-xs text-white/35">{event.date}</p>
                    </div>
                    <ChevronRight size={14} className="mt-0.5 shrink-0 text-white/20" />
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-white/35 mb-1.5">
                      <span>{event.tickets} / {event.capacity} tickets</span>
                      <span className="font-bold text-white/50">{pct}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${event.color} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            <Link
              href="/dashboard/events/new"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.08] py-3 text-xs font-bold text-white/30 transition hover:border-orange-500/40 hover:text-orange-400"
            >
              <Calendar size={13} />
              Create new event
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
