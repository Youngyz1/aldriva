let missingSchemaWarningLogged = false;

export function isMissingMenuOptionSchema(error: unknown): boolean {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  const code = typeof candidate?.code === "string" ? candidate.code : "";
  const message = typeof candidate?.message === "string" ? candidate.message.toLowerCase() : "";
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(code)
    || /menu_option_groups|menu_item_option_groups|menu_options|options_source/.test(message)
      && /does not exist|not found|schema cache|could not find|unknown column/.test(message);
}

export function warnMissingMenuOptionSchemaOnce(context: string, error: unknown): void {
  if (!missingSchemaWarningLogged && isMissingMenuOptionSchema(error)) {
    missingSchemaWarningLogged = true;
    console.warn(`[${context}] menu option schema is unavailable; using legacy JSON options.`);
  }
}
