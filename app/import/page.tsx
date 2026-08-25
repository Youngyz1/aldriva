import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import ImportClient from "./ImportClient";

export default async function ImportPage() {
  // Server-side gate: non-admins are redirected to /dashboard before any
  // client bundle or import UI is delivered. The redirect() call in
  // requireAdmin() throws NEXT_REDIRECT, which Next.js catches and converts
  // to a 307 — no UI is rendered for non-admins even if they know the URL.
  await requireAdmin();

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
