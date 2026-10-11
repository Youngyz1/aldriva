/**
 * Shared persistence diagnostics for invitation-page draft fields.
 */

export const MISSING_MUSIC_LINKS_COLUMN_ERROR =
  "Music links were not saved because this database is missing event_invitation_pages.music_links. Apply migration 167 (db/migration_167_invitation_music_links.sql), then reload the builder.";

export function isMissingMusicLinksColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
  };
  const text = [value.message, value.details, value.hint]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLowerCase();

  if (!text.includes("music_links")) return false;
  return (
    value.code === "PGRST204" ||
    value.code === "42703" ||
    /schema cache|could not find|column.{0,60}(missing|does not exist|not found)/.test(text)
  );
}

export function rowHasMusicLinksColumn(row: unknown): boolean {
  return Boolean(
    row &&
      typeof row === "object" &&
      Object.prototype.hasOwnProperty.call(row, "music_links")
  );
}
