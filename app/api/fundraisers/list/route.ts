import { NextRequest, NextResponse } from "next/server";
import { getFundraiserList } from "@/lib/fundraiser-data";
import { getDonationCounts } from "@/lib/donation-counts";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter") as any || "all";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.max(1, parseInt(searchParams.get("pageSize") || "12", 10) || 12);

  const validFilters = ["all", "close-to-target", "just-launched", "needs-momentum", "trending"];
  const smartFilter = validFilters.includes(filter) ? filter : "all";

  try {
    const { fundraisers, total } = await getFundraiserList({
      smartFilter,
      page,
      pageSize,
    });

    const donationCounts = fundraisers.length
      ? await getDonationCounts(fundraisers.map((f) => f.id))
      : new Map<string, number>();

    const items = fundraisers.map((f) => ({
      ...f,
      donorCount: donationCounts.get(f.id) ?? 0,
    }));

    return NextResponse.json({ fundraisers: items, total });
  } catch (error) {
    console.error("[api/fundraisers/list] error:", error);
    return NextResponse.json({ error: "Failed to fetch fundraisers" }, { status: 500 });
  }
}
