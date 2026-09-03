import { Suspense } from "react";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import GrowthStudioClient from "./GrowthStudioClient";

export default async function AdminAIGrowthStudioPage() {
  await headers(); // Forces dynamic server-rendering on every request in Next.js 16
  await requireAdmin();

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
        </div>
      }
    >
      <GrowthStudioClient />
    </Suspense>
  );
}
