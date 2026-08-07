export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import PublicPageHeader from "@/components/public/PublicPageHeader";
import PublicEmptyState from "@/components/public/PublicEmptyState";
import BeneficiaryProfileForm from "./BeneficiaryProfileForm";

/**
 * A beneficiary's own profile. Only reachable for accounts that have claimed
 * a beneficiary record; one account can hold several (someone named as the
 * beneficiary of more than one campaign).
 */
export default async function BeneficiaryDashboardPage() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirect=/dashboard/beneficiary");

  const admin = createSupabaseAdmin();
  const { data: profiles } = await admin
    .from("beneficiaries")
    .select(
      "id, type, name, relationship, species, photo, bio, contact_email, website, facebook, twitter, instagram, linkedin, youtube, tiktok, verified_at"
    )
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const owned = profiles ?? [];

  // Campaigns raising for these profiles — read-only context so the
  // beneficiary can see who is fundraising for them.
  const { data: campaigns } = owned.length
    ? await admin
        .from("fundraisers")
        .select("id, title, slug, organizer, beneficiary_id")
        .in("beneficiary_id", owned.map((p) => p.id))
        .is("deleted_at", null)
    : { data: [] };

  return (
    <main className="min-h-screen bg-zinc-50 pb-16 text-zinc-950">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <PublicPageHeader
          eyebrow="Beneficiary"
          title="Your profile"
          description="Add a photo, a short bio, and ways for supporters to reach you."
        />

        {owned.length === 0 ? (
          <PublicEmptyState
            icon="💚"
            title="No beneficiary profile yet"
            description="If a campaign organizer names you as their beneficiary, they can invite you by email — the link in that invite connects the profile to this account."
            action={{ label: "Back to dashboard", href: "/dashboard" }}
          />
        ) : (
          <div className="space-y-10">
            {owned.map((profile) => (
              <BeneficiaryProfileForm
                key={profile.id}
                profile={profile}
                campaigns={(campaigns ?? []).filter(
                  (c) => c.beneficiary_id === profile.id
                )}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
