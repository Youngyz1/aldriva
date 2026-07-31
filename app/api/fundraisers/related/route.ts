import { NextResponse } from "next/server";

import {
  getRelatedFundraisers,
  type RelatedFundraiserCategory,
} from "@/lib/fundraiser-data";

const VALID_CATEGORIES: readonly RelatedFundraiserCategory[] = [
  "worldwide",
  "close-to-target",
  "just-launched",
  "needs-momentum",
  "charities",
];

function parseCategory(value: string | null): RelatedFundraiserCategory {
  return VALID_CATEGORIES.includes(value as RelatedFundraiserCategory)
    ? (value as RelatedFundraiserCategory)
    : "worldwide";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const excludeId = searchParams.get("excludeId");
  if (!excludeId) {
    return NextResponse.json({ error: "excludeId is required" }, { status: 400 });
  }

  const category = parseCategory(searchParams.get("category"));
  const fundraisers = await getRelatedFundraisers(excludeId, 10, category);

  return NextResponse.json({ fundraisers });
}
