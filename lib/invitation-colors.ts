/** Normalize six-digit invitation palette colors for CSS and stored snapshots. */
export function normalizeInvitationColorHex(value: string): string | null {
  const candidate = value.trim().startsWith("#") ? value.trim() : `#${value.trim()}`;
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate.toUpperCase() : null;
}
