"use client";

type Props = {
  selectedCount: number;
  children: React.ReactNode;
};

export default function DashboardBulkActions({ selectedCount, children }: Props) {
  if (selectedCount <= 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5">
      <span className="text-xs font-black text-violet-800">{selectedCount} selected</span>
      {children}
    </div>
  );
}

export function DashboardBulkActionButton({
  label,
  onClick,
  variant = "default",
}: {
  label: string;
  onClick: () => void;
  variant?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        variant === "danger"
          ? "rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-black text-red-600 hover:bg-red-50"
          : "rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-black text-violet-700 hover:bg-violet-100"
      }
    >
      {label}
    </button>
  );
}
