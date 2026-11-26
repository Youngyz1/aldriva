"use client";

import { ReactNode, useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AccountBottomBar } from "@/components/nav/AccountBottomBar";

// Module-level cache so auth check doesn't re-run on every client navigation
let _authedCache: boolean | null = null;

export default function DashboardLayoutClient({
  children,
  sidebar,
}: {
  children: ReactNode;
  sidebar: ReactNode;
}) {
  const router = useRouter();
  const rawPathname = usePathname();
  // usePathname keeps the /en or /fr prefix; the checks below expect /dashboard/...
  const pathname = (rawPathname ?? "").replace(/^\/(?:en|fr)(?=\/|$)/, "");
  const isBuilder = pathname?.includes("/website/builder");
  const isOrgWorkspace = pathname?.startsWith("/dashboard/org/");
  const isFundraiserManagement = !!pathname?.match(/^\/dashboard\/fundraisers\/[^/]+(\/.*)?$/);
  const isEventManagement = !!pathname?.match(/^\/dashboard\/events\/[^/]+(\/.*)?$/);
  const isBusinessManagement = !!pathname?.match(/^\/dashboard\/businesses\/[^/]+(\/.*)?$/);
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

  if (!authed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-zinc-50 text-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-700 border-t-transparent" />
      </div>
    );
  }

  // Builder, Organizer workspace and Entity management need full viewport — no global dashboard chrome
  if (isBuilder || isOrgWorkspace || isFundraiserManagement || isEventManagement || isBusinessManagement) {
    return (
      <div className="min-h-screen bg-zinc-100 text-zinc-950">
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50/60 text-zinc-950">
      {/* Main layout */}
      <div className="flex">
        {sidebar}
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-7xl px-4 pt-6 pb-[calc(var(--bottom-bar-h)+1.5rem)] sm:px-6 sm:pt-8 lg:px-8 lg:pb-16">
            {children}
          </div>
        </main>
      </div>
      <AccountBottomBar />
    </div>
  );
}
