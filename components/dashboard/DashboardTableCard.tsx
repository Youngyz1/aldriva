"use client";

import { IconLoader2 as Loader2 } from "@tabler/icons-react";
import DashboardPagination from "./DashboardPagination";
import { StickyTablePagination } from "@/components/ui/sticky-table-toolbar";

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
    <div className="space-y-0">
      <div className="overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
          </div>
        ) : isEmpty && empty ? (
          <div className="py-4">{empty}</div>
        ) : (
          children
        )}
      </div>

      {!loading && !isEmpty && (
        <StickyTablePagination>
          <DashboardPagination
            page={page}
            totalPages={totalPages}
            perPage={perPage}
            total={total}
            onPageChange={onPageChange}
            onPerPageChange={onPerPageChange}
          />
        </StickyTablePagination>
      )}
    </div>
  );
}
