/**
 * app/dashboard/businesses/[id]/overview/page.tsx
 *
 * Business overview stub route.
 * If the business is linked to an organizer (canonical tenant model),
 * redirects to the canonical /dashboard/org/[organizer_id]/overview route.
 * If unlinked, renders the fallback business overview.
 */

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { assertCanManageBusiness } from "@/lib/entity-authz";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function BusinessOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const auth = await assertCanManageBusiness(id);
  if (!auth.ok) return notFound();

  const admin = createSupabaseAdmin();
  const { data: b } = await admin
    .from("businesses")
    .select("id, name, slug, status, organizer_id")
    .eq("id", id)
    .maybeSingle();

  if (!b) return notFound();

  // If business is linked to an organizer tenant, redirect to the canonical overview
  if (b.organizer_id) {
    redirect(`/dashboard/org/${b.organizer_id}/overview`);
  }

  // Fallback for standalone business without an organizer
  const { count: productCount } = await admin
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("business_id", id);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-black">{b.name}</h1>
        <p className="text-sm text-zinc-500">{b.status} · /businesses/{b.slug}</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-zinc-500">Products</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black">{productCount ?? 0}</p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link href={`/dashboard/businesses/${id}/products`}>Manage products</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-zinc-500">Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/businesses/${id}/orders`}>View orders</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase text-zinc-500">Public</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm" variant="outline">
              <Link href={`/businesses/${b.slug}`} target="_blank">View public →</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
