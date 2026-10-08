import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import ImportClient from "./ImportClient";

export default async function ImportPage({
  searchParams,
}: {
  searchParams?: Promise<{ mode?: string }>;
}) {
  // Server-side gate: non-admins are redirected to /dashboard before any
  // client bundle or import UI is delivered. The redirect() call in
  // requireAdmin() throws NEXT_REDIRECT, which Next.js catches and converts
  // to a 307 — no UI is rendered for non-admins even if they know the URL.
  await requireAdmin();

  // Event importing was removed (Round 3, Commit 3b). The only remaining
  // import flow is fundraisers, so legacy event URLs (/import,
  // /import?mode=events, /import?mode=events&url=…) land on the two-way
  // event-creation choice instead of crashing.
  const mode = (await searchParams)?.mode;
  if (mode !== "fundraisers") {
    redirect("/dashboard/events/new");
  }

  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-zinc-50">
          <p className="text-lg font-semibold text-zinc-500">Loading import tools...</p>
        </main>
      }
    >
      <ImportClient />
    </Suspense>
  );
}
