import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { getDashboardContext } from "@/lib/dashboard-context";
import AttendeesClient from "./AttendeesClient";

function AttendeesSkeleton() {
  return (
    <div className="flex justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
    </div>
  );
}

async function DashboardAttendeesContent() {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  return <AttendeesClient />;
}

export default function DashboardAttendeesPage() {
  return (
    <Suspense fallback={<AttendeesSkeleton />}>
      <DashboardAttendeesContent />
    </Suspense>
  );
}
