import type { MenuPromotion, MenuPromotionTarget } from "./menu-promotions";
import { isMissingPromotionSchema, warnMissingPromotionSchemaOnce } from "./menu-promotion-schema";

export interface LoadMenuPromotionsOptions {
  /** Public reads must set false so the code column is never selected. */
  includeCodes?: boolean;
  status?: "draft" | "active" | "paused";
  context: string;
}

export interface LoadMenuPromotionsResult {
  promotions: MenuPromotion[];
  error: unknown | null;
  missingSchema: boolean;
}

const PROMOTION_FIELDS = "id, organizer_id, name, headline, description, image_url, offer_type, percent_off, special_price, apply_to_variants, min_order_amount, status, starts_at, ends_at, priority, layout, cta_label, destination_type, destination_item_id, destination_section_id, destination_url, created_at, updated_at";

/** Loads tenant promotions and their targets in two batched queries. */
export async function loadMenuPromotions(
  client: any,
  organizerId: string,
  options: LoadMenuPromotionsOptions
): Promise<LoadMenuPromotionsResult> {
  if (!client || typeof organizerId !== "string" || !organizerId) return { promotions: [], error: null, missingSchema: false };
  try {
    const fields = options.includeCodes === true ? `${PROMOTION_FIELDS}, code` : PROMOTION_FIELDS;
    let query = client.from("promotions").select(fields).eq("organizer_id", organizerId);
    if (options.status) query = query.eq("status", options.status);
    if (options.includeCodes !== true) query = query.is("code", null);
    const promotionResult = await query;
    if (promotionResult.error) {
      if (isMissingPromotionSchema(promotionResult.error)) {
        warnMissingPromotionSchemaOnce(options.context, promotionResult.error);
        return { promotions: [], error: null, missingSchema: true };
      }
      return { promotions: [], error: promotionResult.error, missingSchema: false };
    }
    const rows = Array.isArray(promotionResult.data) ? promotionResult.data : [];
    if (rows.length === 0) return { promotions: [], error: null, missingSchema: false };
    const ids = rows.map((row: { id: string }) => row.id).filter(Boolean);
    const targetResult = await client.from("promotion_targets")
      .select("id, organizer_id, promotion_id, item_id, section_id")
      .eq("organizer_id", organizerId)
      .in("promotion_id", ids);
    if (targetResult.error) {
      if (isMissingPromotionSchema(targetResult.error)) {
        warnMissingPromotionSchemaOnce(options.context, targetResult.error);
        return { promotions: [], error: null, missingSchema: true };
      }
      return { promotions: [], error: targetResult.error, missingSchema: false };
    }
    const byPromotion = new Map<string, MenuPromotionTarget[]>();
    for (const target of Array.isArray(targetResult.data) ? targetResult.data : []) {
      const list = byPromotion.get(target.promotion_id) || [];
      list.push({ item_id: target.item_id ?? null, section_id: target.section_id ?? null });
      byPromotion.set(target.promotion_id, list);
    }
    return {
      promotions: rows.map((row: MenuPromotion & { id: string; code?: string | null }) => {
        if (options.includeCodes === true) return { ...row, targets: byPromotion.get(row.id) || [] };
        const publicRow = { ...row };
        delete publicRow.code;
        return { ...publicRow, targets: byPromotion.get(row.id) || [] };
      }),
      error: null,
      missingSchema: false,
    };
  } catch (error) {
    if (isMissingPromotionSchema(error)) {
      warnMissingPromotionSchemaOnce(options.context, error);
      return { promotions: [], error: null, missingSchema: true };
    }
    return { promotions: [], error, missingSchema: false };
  }
}
