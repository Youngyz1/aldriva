/**
 * Neutral "not available" page for the general share link.
 *
 * Identical for disabled, unpublished, invalid and non-invitation-kind
 * tokens: it reveals nothing about whether the event exists, names no
 * guest, and links nowhere private.
 */
export function SharedUnavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-6">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center shadow-xs">
        <p className="text-xl font-black text-zinc-950">This invitation isn&apos;t available</p>
        <p className="mx-auto mt-2 max-w-sm text-sm font-medium text-zinc-500">
          The link may be disabled, expired, or not yet shared by the host. If you were invited
          personally, please use your personal invitation link instead.
        </p>
      </div>
    </main>
  );
}
