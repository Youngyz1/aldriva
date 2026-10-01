import Link from "next/link";
import { BarChart2 } from "lucide-react";

export default async function OrgAnalyticsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-orange-600">Organization</p>
        <h1 className="mt-1 text-2xl font-black">Analytics</h1>
        <p className="mt-1 text-sm font-medium text-zinc-500">Detailed metrics for your organization.</p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white py-20 text-center">
        <BarChart2 className="mb-3 h-12 w-12 text-zinc-300" />
        <p className="font-black text-zinc-900">Analytics coming soon</p>
        <p className="mt-1 max-w-sm text-sm text-zinc-500">
          Event views, donation trends, follower growth, and ticket sales charts are on the way.
        </p>
        <Link
          href={`/dashboard/organizations/${slug}/overview`}
          className="mt-6 rounded-xl bg-zinc-950 px-5 py-2.5 text-sm font-black text-white transition hover:bg-orange-600"
        >
          ← Back to Overview
        </Link>
      </div>
    </div>
  );
}
