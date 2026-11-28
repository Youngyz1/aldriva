import type { ReactNode } from "react";
import { Suspense } from "react";
import DashboardSidebar from "@/app/dashboard/DashboardSidebar";
import { AccountBottomBar } from "@/components/nav/AccountBottomBar";

export default function ProfileDetailLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50/60 text-zinc-950">
      <div className="flex">
        <Suspense fallback={null}>
          <DashboardSidebar />
        </Suspense>
        <main className="min-w-0 flex-1 pb-[calc(var(--bottom-bar-h)+1.5rem)] lg:pb-16">
          {children}
        </main>
      </div>
      <AccountBottomBar />
    </div>
  );
}
