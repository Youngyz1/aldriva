import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { getDashboardContext } from "@/lib/dashboard-context";
import DonationsClient from "./DonationsClient";

export default async function DashboardDonationsPage() {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-violet-500" /></div>}>
      <DonationsClient />
    </Suspense>
  );
}
