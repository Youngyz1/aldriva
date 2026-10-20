let missingPromotionSchemaWarningLogged = false;

export function isMissingPromotionSchema(error: unknown): boolean {
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown } | null;
  const code = typeof candidate?.code === "string" ? candidate.code : "";
  const message = `${typeof candidate?.message === "string" ? candidate.message : ""} ${typeof candidate?.details === "string" ? candidate.details : ""}`.toLowerCase();
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(code)
    || /promotions|promotion_targets/.test(message) && /does not exist|not found|schema cache|could not find|unknown column/.test(message);
}

export function warnMissingPromotionSchemaOnce(context: string, error: unknown): void {
  if (missingPromotionSchemaWarningLogged || !isMissingPromotionSchema(error)) return;
  missingPromotionSchemaWarningLogged = true;
  console.warn(`[${context}] restaurant menu promotion schema is unavailable; continuing without promotions.`);
}
