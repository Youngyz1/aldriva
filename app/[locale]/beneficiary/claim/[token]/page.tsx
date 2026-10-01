import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import PublicPageHeader from "@/components/public/PublicPageHeader";
import ClaimBeneficiaryButton from "./ClaimBeneficiaryButton";

/**
 * Landing page for a beneficiary claim link.
 *
 * Claiming requires being signed in, so the account the profile binds to is
 * always one the person authenticated into themselves — the link alone never
 * grants control. An unauthenticated visitor is sent to login and returned
 * here afterwards, preserving the token.
 */
export default async function ClaimBeneficiaryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Token lookup runs with the service role: the row is not publicly readable
  // by token, and the visitor has no relationship to it until they claim.
  const admin = createSupabaseAdmin();
  const { data: beneficiary } = await admin
    .from("beneficiaries")
    .select("id, name, type, user_id, claimed_at, claim_email")
    .eq("claim_token", token)
    .maybeSingle();

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/beneficiary/claim/${token}`)}`);
  }

  const invalid = !beneficiary;
  const alreadyClaimed = Boolean(beneficiary?.user_id || beneficiary?.claimed_at);

  return (
    <main className="min-h-screen bg-zinc-50 pb-16 text-zinc-950">
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
        <PublicPageHeader
          eyebrow="Beneficiary"
          title={invalid ? "This link isn't valid" : "Claim your profile"}
          description={
            invalid
              ? "It may have expired or been replaced by a newer invite."
              : `An Aldriva campaign is raising money for ${beneficiary!.name}.`
          }
        />

        {invalid ? (
          <Link
            href="/"
            className="inline-flex rounded-full bg-brand-700 px-6 py-3 text-sm font-black text-white hover:bg-brand-800"
          >
            Back to Aldriva
          </Link>
        ) : alreadyClaimed ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="text-sm font-semibold text-zinc-600">
              This profile has already been claimed.
            </p>
            <Link
              href="/dashboard/beneficiary"
              className="mt-4 inline-flex rounded-full bg-brand-700 px-5 py-2.5 text-sm font-black text-white hover:bg-brand-800"
            >
              Go to your profile
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="text-sm font-semibold text-zinc-600">
              Claiming links{" "}
              <span className="font-black text-zinc-950">{beneficiary!.name}</span> to the
              account you're signed in as ({user.email}). You'll be able to add a photo,
              a short bio, and ways for supporters to reach you.
            </p>
            <p className="mt-3 text-xs font-medium text-zinc-500">
              This does not give you control of the campaign, its story, or its funds —
              those stay with the organizer.
            </p>
            <div className="mt-5">
              <ClaimBeneficiaryButton token={token} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
