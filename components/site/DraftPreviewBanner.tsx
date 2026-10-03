/**
 * components/site/DraftPreviewBanner.tsx
 *
 * Fixed top banner shown to authenticated entity managers / editors / platform admins
 * when viewing a draft, unpublished, or archived website or page.
 */

interface DraftPreviewBannerProps {
  status: string;
  isPageDraft?: boolean;
}

export function DraftPreviewBanner({ status, isPageDraft }: DraftPreviewBannerProps) {
  const isSiteDraft = status !== "published";
  const label = isSiteDraft
    ? `Site Status: ${status.toUpperCase()} (Preview Mode — Only visible to team members)`
    : isPageDraft
      ? "Page Status: DRAFT (Preview Mode — Only visible to team members)"
      : null;

  if (!label) return null;

  return (
    <div className="sticky top-0 z-[60] flex items-center justify-between border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900 shadow-xs">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
        <span>{label}</span>
      </div>
      <span className="hidden sm:inline text-amber-700 font-normal">
        Changes will be visible to the public once published in Dashboard
      </span>
    </div>
  );
}
