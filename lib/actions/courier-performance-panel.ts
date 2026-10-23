"use server";

import {
  loadCourierPerformance,
  type CourierPerformanceRange,
} from "@/lib/actions/courier-performance";

/** Client-callable server action; the loader rechecks tenant and business scope. */
export async function getCourierPerformancePanelData(
  organizerId: string,
  businessId: string,
  range: CourierPerformanceRange,
) {
  return loadCourierPerformance({ organizerId, businessId, range });
}
