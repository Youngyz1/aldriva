import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * Returns the beneficiary record attached to a fundraiser, for the edit form's
 * invite panel.
 *
 * This exists because migration_55 revoked `claim_email` (and `claim_token`)
 * from the anon/authenticated roles — the edit page used to read them straight
 * from PostgREST, which meant every claim token on the platform was publicly
 * listable. The organizer still needs to see which address an invite went to,
 * so that one field is served here instead, behind an ownership check.
 *
 * Authorisation: the caller must own the fundraiser, either directly
 * (fundraisers.user_id) or through the organizer that runs it. Same ownership
 * rule the invite route applies before sending mail.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const fundraiserId = req.nextUrl.searchParams.get("fundraiserId")?.trim();
  if (!fundraiserId) {
    return NextResponse.json({ error: "fundraiserId is required." }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  const { data: fundraiser, error: fundraiserError } = await admin
    .from("fundraisers")
    .select("id, user_id, organizer_id, beneficiary_id")
    .eq("id", fundraiserId)
    .is("deleted_at", null)
    .maybeSingle();

  if (fundraiserError) {
    return NextResponse.json({ error: fundraiserError.message }, { status: 500 });
  }
  if (!fundraiser) {
    return NextResponse.json({ error: "Fundraiser not found." }, { status: 404 });
  }

  let owns = fundraiser.user_id === user.id;

  if (!owns && fundraiser.organizer_id) {
    const { data: ownedOrganizer } = await admin
      .from("organizers")
      .select("id")
      .eq("id", fundraiser.organizer_id)
      .eq("user_id", user.id)
      .maybeSingle();
    owns = Boolean(ownedOrganizer);
  }

  if (!owns) {
    return NextResponse.json({ error: "Not your fundraiser." }, { status: 403 });
  }

  if (!fundraiser.beneficiary_id) {
    return NextResponse.json({ record: null });
  }

  const { data: record, error: recordError } = await admin
    .from("beneficiaries")
    .select("id, name, user_id, claimed_at, claim_email")
    .eq("id", fundraiser.beneficiary_id)
    .maybeSingle();

  if (recordError) {
    return NextResponse.json({ error: recordError.message }, { status: 500 });
  }
  if (!record) {
    return NextResponse.json({ record: null });
  }

  // claim_token is deliberately never returned — only the claim link emailed to
  // the beneficiary should carry it.
  return NextResponse.json({
    record: {
      id: record.id,
      name: record.name,
      claimed: Boolean(record.user_id || record.claimed_at),
      claimEmail: record.claim_email,
    },
  });
}
