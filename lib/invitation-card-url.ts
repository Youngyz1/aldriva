/**
 * Shared absolute URL builder for invitation-card email art and link previews.
 * Versioning by the selected card and published page timestamp changes the
 * CDN cache key when either the card design or its published cover photo moves.
 */
export function buildInvitationCardImageUrl(
  siteUrl: string,
  token: string,
  cardTemplateId: string | null | undefined,
  publishedAt: string | null | undefined
): string {
  const base = `${siteUrl.replace(/\/+$/, "")}/api/invitation/${encodeURIComponent(token)}/card.png`;
  const version = `${cardTemplateId || "default"}:${publishedAt || "unpublished"}`;
  return `${base}?v=${encodeURIComponent(version)}`;
}
