"use client";

import { Loader2 } from "lucide-react";
import DashboardPagination from "./DashboardPagination";

type Props = {
  loading: boolean;
  page: number;
  totalPages: number;
  perPage: number;
  total: number;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: number) => void;
  children: React.ReactNode;
  empty?: React.ReactNode;
  isEmpty?: boolean;
};

export default function DashboardTableCard({
  loading,
  page,
  totalPages,
  perPage,
  total,
  onPageChange,
  onPerPageChange,
  children,
  empty,
  isEmpty = false,
}: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-sm sm:rounded-2xl">
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
        </div>
      ) : isEmpty && empty ? (
        <div className="p-4 sm:p-6">{empty}</div>
      ) : (
        children
      )}

      {!loading && !isEmpty && (
        <DashboardPagination
          page={page}
          totalPages={totalPages}
          perPage={perPage}
          total={total}
          onPageChange={onPageChange}
          onPerPageChange={onPerPageChange}
        />
      )}
    </div>
  );
}
