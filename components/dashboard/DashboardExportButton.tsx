"use client";

import { Download } from "lucide-react";

type Props = {
  onExport?: () => void;
  exporting?: boolean;
  label?: string;
};

export default function DashboardExportButton({
  onExport,
  exporting = false,
  label = "Export CSV",
}: Props) {
  if (!onExport) return null;

  return (
    <button
      type="button"
      onClick={onExport}
      disabled={exporting}
      className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-xs font-black text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
    >
      <Download className="h-4 w-4" />
      {exporting ? "Exporting…" : label}
    </button>
  );
}
