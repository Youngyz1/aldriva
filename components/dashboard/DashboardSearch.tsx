"use client";

import { Search } from "lucide-react";

type Props = {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  className?: string;
};

export default function DashboardSearch({ value, placeholder, onChange, className }: Props) {
  return (
    <div className={`relative min-w-0 flex-1 ${className ?? ""}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-4 text-sm font-semibold text-zinc-900 outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-200"
      />
    </div>
  );
}
