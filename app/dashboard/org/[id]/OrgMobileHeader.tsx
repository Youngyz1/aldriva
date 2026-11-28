"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { IconChevronLeft as ChevronLeft } from "@tabler/icons-react";
import { BusinessSwitcher } from "@/components/dashboard/BusinessSwitcher";

export interface OrgMobileHeaderProps {
  org: { id: string; name: string };
  businesses?: ReadonlyArray<{
    id: string;
    name?: string | null;
    category?: string | null;
    business_type?: string | null;
  }>;
  activeBusinessId?: string | null;
}

export default function OrgMobileHeader({
  org,
  businesses,
  activeBusinessId,
}: OrgMobileHeaderProps) {
  // Mobile drawer was replaced by DashboardBottomBar + DashboardMoreSheet.
  // Translations reference: useTranslations('Organizer')(item.label.toLowerCase())
  const t = useTranslations('Organizer');
  void t;

  return (
    <div className="sticky top-14 sm:top-16 z-30 flex items-center justify-between gap-2 border-b border-zinc-200 bg-white px-4 py-2.5 lg:hidden">
      <div className="flex min-w-0 items-center gap-2">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-zinc-800 shrink-0"
          aria-label="Back to dashboard"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="sr-only">Back</span>
        </Link>
        <p className="truncate text-sm font-black text-zinc-900">{org.name}</p>
      </div>

      {businesses && businesses.length > 1 && (
        <BusinessSwitcher
          organizerId={org.id}
          businesses={businesses}
          activeBusinessId={activeBusinessId}
          className="shrink-0"
        />
      )}
    </div>
  );
}
