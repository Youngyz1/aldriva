"use client";

import { ReactNode, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardSidebar from "./DashboardSidebar";
import DashboardMobileNav from "./DashboardMobileNav";

// Module-level cache so auth check doesn't re-run on every client navigation
let _authedCache: boolean | null = null;

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const [authed, setAuthed] = useState(_authedCache ?? false);
  useEffect(() => {
    if (_authedCache === true) { setAuthed(true); return; }
    import("@/lib/supabase").then(({ supabase }) => {
      supabase.auth.getUser().then(({ data }) => {
        if (!data.user) {
          _authedCache = null;
          router.push("/login");
        } else {
          _authedCache = true;
          setAuthed(true);
        }
      });
    });
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-950">
      {!authed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-100">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      )}
      {/* Main layout */}
      <div className="flex">
        <DashboardSidebar />
        <main className="min-w-0 flex-1">
          <DashboardMobileNav />
          {/* Bottom padding reserves room for the fixed mobile bottom bar
              (69px + safe-area, see DashboardMobileNav) below lg, so page
              content is never hidden underneath it. */}
          <div className="mx-auto max-w-7xl px-3 pb-[calc(69px+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-[calc(69px+env(safe-area-inset-bottom))] sm:pt-6 lg:px-8 lg:pb-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}