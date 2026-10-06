/**
 * app/invitation/preview/page.tsx
 *
 * Development sandbox gate for the invitation template preview tool.
 *
 * In production this route returns 404 unless the escape hatch env var
 * NEXT_PUBLIC_ENABLE_INVITATION_SANDBOX=true is explicitly set (intended
 * for staging dogfood environments only — never on the production domain).
 *
 * In development (NODE_ENV=development) the route is always accessible.
 *
 * NOTE: No `export const dynamic` or any other segment config export —
 * this file is a plain async server component for cacheComponents compatibility.
 * The heavy client logic lives in PreviewSandboxClient which is never sent to
 * production users unless the gate above is passed.
 *
 * /invitation/preview/[token]  (the real host preview route) is a sibling
 * dynamic segment and is completely unaffected by this file.
 */

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import PreviewSandboxClient from "./PreviewSandboxClient";

export const metadata: Metadata = {
  title: "Invitation Template Sandbox",
  robots: { index: false, follow: false, nocache: true },
};

export default async function InvitationPreviewGatePage() {
  const isProduction = process.env.NODE_ENV === "production";
  const sandboxEnabled = process.env.NEXT_PUBLIC_ENABLE_INVITATION_SANDBOX === "true";

  if (isProduction && !sandboxEnabled) {
    notFound();
  }

  return <PreviewSandboxClient />;
}
