// Accepts only same-origin relative paths. Anything else returns the fallback.
// Blocks absolute URLs, protocol-relative ("//host"), backslash tricks and
// control characters, so a ?redirect= value cannot send a user off-site.
export function safeRedirectPath(value: string | null | undefined, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  if (v === "" || v.length > 2000) return fallback;
  if (!v.startsWith("/")) return fallback;
  if (v.startsWith("//")) return fallback;
  if (v.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(v)) return fallback;
  return v;
}
