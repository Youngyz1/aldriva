"use server";

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  submitOrderRequestWithClient,
  type OrderItemInput,
  type SubmitOrderRequestInput,
  type SubmitOrderResult,
} from "@/lib/order-submit";

export type { OrderItemInput, SubmitOrderRequestInput, SubmitOrderResult };

/**
 * Server-side order request submission for guest storefront checkout.
 * Takes only serializable input; the Supabase admin client is created here
 * (never accepted as an argument). Testable logic lives in
 * `submitOrderRequestWithClient` in `@/lib/order-submit`.
 */
export async function submitOrderRequest(
  input: SubmitOrderRequestInput
): Promise<SubmitOrderResult> {
  const admin = createSupabaseAdmin();
  return submitOrderRequestWithClient(input, admin);
}
