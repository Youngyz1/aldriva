import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { notFound } from "next/navigation";
import { getVisitorCountry } from "@/lib/request-geo";
import { getOptionalFundraiserFields } from "@/lib/fundraiser-data";
import DonatePage from "./DonatePage";

export default async function FundraiserDonatePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const adminSupabase = createSupabaseAdmin();

  let fundraiser = null;
  let defaultCountry = "US";

  try {
    const [fundraiserRes, countryRes] = await Promise.all([
      adminSupabase
        .from("fundraisers")
        .select("id, title, slug, organizer, banner, raised, goal")
        .eq("slug", slug)
        .maybeSingle(),
      getVisitorCountry().catch(() => "US"),
    ]);
    fundraiser = fundraiserRes.data;
    defaultCountry = countryRes || "US";
  } catch (err) {
    console.error("[FundraiserDonatePage] Error loading page data:", err);
  }

  if (!fundraiser) return notFound();

  const optionalFundraiser = await getOptionalFundraiserFields(fundraiser.id);
  const goal = Number(optionalFundraiser.goal_amount ?? fundraiser.goal ?? 0);

  return (
    <DonatePage
      fundraiserTitle={fundraiser.title}
      fundraiserSlug={fundraiser.slug}
      organizerName={fundraiser.organizer || "Campaign organizer"}
      banner={
        fundraiser.banner ||
        "https://images.unsplash.com/photo-1529390079861-591de354faf5?q=80&w=800&auto=format&fit=crop"
      }
      raised={fundraiser.raised ?? 0}
      goal={goal}
      defaultCountry={defaultCountry}
    />
  );
}
