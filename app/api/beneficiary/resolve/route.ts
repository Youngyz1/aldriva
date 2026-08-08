import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { validateBeneficiary } from "@/lib/beneficiary";

/**
 * Find-or-create the `beneficiaries` row for a fundraiser, returning its id so
 * the caller can store it as `fundraisers.beneficiary_id`.
 *
 * Reuse is scoped to the calling organizer: a match only counts if the
 * beneficiary is already attached to one of *their* fundraisers. So an
 * organizer running three campaigns for their mother gets one profile, while
 * an unrelated organizer typing the same name gets their own row.
 *
 * Matching on the name string alone across all organizers would be wrong and
 * unsafe — names are not identity. It would let a stranger's campaign inherit
 * a profile that someone else has already claimed and now controls the photo,
 * bio and contact links of.
 *
 * Runs server-side with the service role because the lookup spans the
 * organizer's fundraisers and the insert must set `user_id` to null (the
 * account link is only ever established by the claim flow, never at creation).
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { beneficiary?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Re-validated server-side: the client form validates too, but that check is
  // advisory and this is the boundary that actually writes.
  const result = validateBeneficiary((body.beneficiary ?? {}) as Record<string, unknown>);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const beneficiary = result.value;

  const admin = createSupabaseAdmin();

  // Beneficiaries already used by this organizer's own fundraisers.
  const { data: ownFundraisers } = await admin
    .from("fundraisers")
    .select("beneficiary_id")
    .eq("user_id", user.id)
    .not("beneficiary_id", "is", null)
    .is("deleted_at", null);

  const ownBeneficiaryIds = Array.from(
    new Set((ownFundraisers ?? []).map((f) => f.beneficiary_id).filter(Boolean))
  ) as string[];

  let existing: { id: string; user_id: string | null } | null = null;

  if (ownBeneficiaryIds.length > 0) {
    const { data: candidates } = await admin
      .from("beneficiaries")
      .select("id, name, type, user_id")
      .in("id", ownBeneficiaryIds)
      .eq("type", beneficiary.type)
      .is("deleted_at", null);

    // Compared in JS rather than via ilike: a name containing % or _ would be
    // treated as a wildcard by ilike and match the wrong record.
    const target = beneficiary.name.trim().toLowerCase();
    existing =
      (candidates ?? []).find((c) => (c.name ?? "").trim().toLowerCase() === target) ??
      null;
  }

  if (existing) {
    // Once claimed, the row belongs to the beneficiary — re-linking a campaign
    // to it must not quietly rewrite their details. Unclaimed rows are still
    // organizer-authored, so the latest form values win.
    if (!existing.user_id) {
      await admin
        .from("beneficiaries")
        .update({
          relationship: beneficiary.relationship ?? null,
          species: beneficiary.species ?? null,
          registration_number: beneficiary.registrationNumber ?? null,
          website: beneficiary.website ?? null,
          photo: beneficiary.photo ?? null,
          bio: beneficiary.description ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    }
    return NextResponse.json({ beneficiaryId: existing.id, reused: true });
  }

  const { data: created, error: insertError } = await admin
    .from("beneficiaries")
    .insert({
      type: beneficiary.type,
      name: beneficiary.name,
      relationship: beneficiary.relationship ?? null,
      species: beneficiary.species ?? null,
      registration_number: beneficiary.registrationNumber ?? null,
      website: beneficiary.website ?? null,
      photo: beneficiary.photo ?? null,
      bio: beneficiary.description ?? null,
      // Never bound at creation — only the claim flow sets this.
      user_id: null,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    return NextResponse.json(
      { error: insertError?.message ?? "Could not save the beneficiary." },
      { status: 500 }
    );
  }

  return NextResponse.json({ beneficiaryId: created.id, reused: false });
}
