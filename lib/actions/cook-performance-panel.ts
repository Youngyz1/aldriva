"use server";

import {
  loadCookPerformance,
  type CookPerformanceRange,
} from "@/lib/actions/cook-performance";

/** Client-callable server action; the loader rechecks tenant and business scope. */
export async function getCookPerformancePanelData(
  organizerId: string,
  businessId: string,
  range: CookPerformanceRange,
) {
  return loadCookPerformance({ organizerId, businessId, range });
}
