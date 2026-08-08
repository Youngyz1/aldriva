import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { safeImageSrc } from "@/lib/image-url";

/**
 * Public beneficiary profile.
 *
 * Deliberately narrow. It is reachable only by clicking through from a specific
 * fundraiser, there is no directory listing it, it is excluded from the sitemap
 * and it carries noindex. Beneficiaries are frequently the subject of medical,
 * housing or bereavement campaigns, so this page is designed to be shareable by
 * the person it belongs to and otherwise hard to stumble across.
 *
 * ONE CAMPAIGN ONLY — hard rule.
 * The campaign shown is the one named in `?from=<fundraiser-slug>`, and it is
 * verified to actually belong to this beneficiary before rendering. The page
 * never queries "all campaigns for this beneficiary": aggregating them would
 * reveal that someone is the subject of several hardship campaigns, which is
 * strictly more exposure than any single fundraiser page gives. Do not add an
 * aggregate or history view here without an explicit decision to do so.
 *
 * The verification matters as much as the scoping — without it, anyone could
 * pair an arbitrary campaign slug with an arbitrary beneficiary and make the
 * page assert a relationship that does not exist.
 */

const PUBLIC_COLUMNS =
  "id, slug, name, type, photo, bio, contact_email, website, facebook, twitter, instagram, linkedin, youtube, tiktok, verified_at";

type BeneficiaryRow = {
  id: string;
  slug: string;
  name: string | null;
  type: string | null;
  photo: string | null;
  bio: string | null;
  contact_email: string | null;
  website: string | null;
  facebook: string | null;
  twitter: string | null;
  instagram: string | null;
  linkedin: string | null;
  youtube: string | null;
  tiktok: string | null;
  verified_at: string | null;
};

async function getBeneficiary(slug: string): Promise<BeneficiaryRow | null> {
  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from("beneficiaries")
    .select(PUBLIC_COLUMNS)
    .eq("slug", slug)
    .eq("visibility", "public")
    .is("deleted_at", null)
    .maybeSingle();
  return (data as BeneficiaryRow | null) ?? null;
}

/**
 * The referring campaign, only if it really is this beneficiary's.
 * Returns null rather than throwing so a stale or tampered `from` degrades to
 * "profile with no campaign" instead of a 404.
 */
async function getReferringCampaign(beneficiaryId: string, from?: string) {
  if (!from) return null;
  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from("fundraisers")
    .select("title, slug, image_url, banner, status")
    .eq("slug", from)
    .eq("beneficiary_id", beneficiaryId)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle();
  return data ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const beneficiary = await getBeneficiary(slug);

  return {
    title: beneficiary?.name
      ? `${beneficiary.name} · Fund4Good`
      : "Beneficiary · Fund4Good",
    // Not discoverable through search. This page exists to be shared by the
    // person it describes, not indexed.
    robots: { index: false, follow: false },
  };
}

const SOCIALS: Array<{ key: keyof BeneficiaryRow; label: string }> = [
  { key: "website", label: "Website" },
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "twitter", label: "X" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "youtube", label: "YouTube" },
  { key: "tiktok", label: "TikTok" },
];

export default async function BeneficiaryProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { slug } = await params;
  const { from } = await searchParams;

  const beneficiary = await getBeneficiary(slug);
  if (!beneficiary) return notFound();

  const campaign = await getReferringCampaign(beneficiary.id, from);
  const name = beneficiary.name?.trim() || "Beneficiary";
  const photo = safeImageSrc(beneficiary.photo);
  const links = SOCIALS.filter((s) => Boolean(beneficiary[s.key]));

  return (
    <main className="min-h-screen bg-zinc-50 pb-16">
      <div className="mx-auto max-w-2xl px-4 pt-10 sm:px-6">
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col items-center text-center">
            {photo ? (
              <Image
                src={photo}
                alt=""
                aria-hidden
                width={112}
                height={112}
                className="h-24 w-24 rounded-full object-cover ring-4 ring-brand-50 sm:h-28 sm:w-28"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-50 text-3xl font-black text-brand-800 sm:h-28 sm:w-28">
                {name.charAt(0).toUpperCase()}
              </div>
            )}

            <h1 className="mt-5 text-2xl font-black text-zinc-950 sm:text-3xl">
              {name}
            </h1>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-800">
                Beneficiary
              </span>
              {beneficiary.verified_at && (
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600">
                  Verified
                </span>
              )}
            </div>

            {beneficiary.bio ? (
              <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-zinc-600 sm:text-base">
                {beneficiary.bio}
              </p>
            ) : (
              <p className="mt-5 text-sm text-zinc-400">
                This profile hasn&apos;t been filled in yet.
              </p>
            )}
          </div>

          {(links.length > 0 || beneficiary.contact_email) && (
            <div className="mt-7 border-t border-zinc-200 pt-6">
              <h2 className="text-xs font-black uppercase tracking-widest text-zinc-500">
                Get in touch
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {beneficiary.contact_email && (
                  <a
                    href={`mailto:${beneficiary.contact_email}`}
                    className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50"
                  >
                    Email
                  </a>
                )}
                {links.map((s) => (
                  <a
                    key={s.key}
                    href={String(beneficiary[s.key])}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50"
                  >
                    {s.label}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* The single referring campaign, never a list. */}
        {campaign && (
          <div className="mt-6 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xs font-black uppercase tracking-widest text-zinc-500">
              Raising funds for {name}
            </h2>
            <Link
              href={`/fundraisers/${campaign.slug}`}
              className="mt-3 flex items-center gap-4 rounded-2xl p-1 transition hover:bg-zinc-50"
            >
              {safeImageSrc(campaign.image_url || campaign.banner) && (
                <Image
                  src={safeImageSrc(campaign.image_url || campaign.banner)!}
                  alt=""
                  aria-hidden
                  width={96}
                  height={64}
                  className="h-16 w-24 shrink-0 rounded-xl object-cover"
                />
              )}
              <span className="min-w-0 text-sm font-black text-zinc-950 sm:text-base">
                {campaign.title}
              </span>
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
