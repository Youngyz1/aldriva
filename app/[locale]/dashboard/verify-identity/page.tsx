/**
 * app/dashboard/verify-identity/page.tsx
 * Legacy URL — identity verification now lives under
 * Settings → Verification. Preserved as a redirect so existing
 * links/bookmarks keep working.
 */

import { redirect } from "next/navigation";

export default function VerifyIdentityLegacyRedirect() {
  redirect("/dashboard/settings/verification/identity");
}
