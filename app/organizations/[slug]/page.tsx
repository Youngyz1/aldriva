/**
 * app/organizations/[slug]/page.tsx
 * Legacy route — kept for SEO backward compatibility.
 * Issues a 308 Permanent Redirect to the canonical /org/[slug] route.
 */
import { redirect } from "next/navigation";

export default async function LegacyOrganizationsRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // 308 preserves HTTP method; tells search engines the new canonical URL
  redirect(`/org/${slug}`);
}
