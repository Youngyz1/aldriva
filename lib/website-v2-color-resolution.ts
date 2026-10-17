// Fixed tokens mirror the .public-site scope in app/globals.css. Dynamic accent
// token values can be passed by the caller from the active theme configuration.
const PUBLIC_SITE_FIXED_COLORS: Record<string, string> = {
  "--ps-text": "#22201c",
  "--ps-muted": "#625f58",
  "--ps-surface": "#ffffff",
  "--ps-cream": "#fbf8f0",
  "--ps-neutral": "#f3f1ec",
  "--ps-border": "#dedbd3",
  "--ps-success": "#166534",
  "--ps-error": "#b42318",
};

/** Resolve a V2 CSS color token to the exact hex color used on the public site. */
export function resolveV2ThemeColor(
  color: string,
  templateId: string,
  resolvedTokens: Readonly<Record<string, string>> = {},
  depth = 0
): string {
  const value = color.trim();
  if (/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value)) return value;
  if (depth > 8) {
    throw new Error(`Could not resolve V2 theme color "${color}" for ${templateId}.`);
  }

  const variable = /^var\((--[\w-]+)(?:\s*,\s*(.+))?\)$/.exec(value);
  if (!variable) {
    throw new Error(`Could not resolve V2 theme color "${color}" for ${templateId}.`);
  }

  const resolved = resolvedTokens[variable[1]] ?? PUBLIC_SITE_FIXED_COLORS[variable[1]];
  if (resolved) return resolveV2ThemeColor(resolved, templateId, resolvedTokens, depth + 1);
  if (variable[2]) return resolveV2ThemeColor(variable[2], templateId, resolvedTokens, depth + 1);

  throw new Error(`No public-site color token is defined for "${variable[1]}" (${templateId}).`);
}
