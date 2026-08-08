/**
 * Copies text to the clipboard, degrading gracefully across contexts where
 * the modern Clipboard API is unavailable — plain HTTP (no secure context),
 * older browsers, and some in-app webviews. Never throws.
 *
 * Order of attempts:
 * 1. navigator.clipboard.writeText (modern API, requires a secure context)
 * 2. document.execCommand("copy") via an offscreen textarea (legacy fallback,
 *    works over plain HTTP and in more embedded contexts)
 *
 * Returns true if either method reported success, false otherwise so callers
 * can show a fallback UI instead of leaving the user with silent failure.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy fallback below.
    }
  }

  if (typeof document === "undefined") return false;

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const succeeded = document.execCommand("copy");
    document.body.removeChild(textarea);
    return succeeded;
  } catch {
    return false;
  }
}
