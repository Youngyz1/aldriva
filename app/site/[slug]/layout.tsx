/**
 * app/site/[slug]/layout.tsx
 *
 * Standalone layout for tenant website routes (/site/[slug]/**).
 *
 * Key design decisions:
 *  - The platform Navbar is intentionally ABSENT. Tenant sites render their
 *    own branded SiteHeader from website_navigation / header_config.
 *  - No shared footer is provided here either — each site renders its own
 *    SiteFooter driven by footer_config. This layout is a bare pass-through.
 *  - connection() is called so the route segment is always dynamic (never
 *    statically pre-rendered with a stale shell), consistent with how the
 *    (gated) segment handles dynamic content.
 */
import { connection } from "next/server";

export default async function TenantSiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();
  return <>{children}</>;
}
