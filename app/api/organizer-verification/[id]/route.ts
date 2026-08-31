/**
 * app/api/organizer-verification/[id]/route.ts
 * GET — Retrieve organizer info & most recent verification submission.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getEntityRole, ENTITY_ROLES_MANAGE } from "@/lib/entity-auth";

const supabaseAdmin = createSupabaseAdmin();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // 1. Fetch organizer details
  const { data: organizer, error: orgError } = await supabaseAdmin
    .from("organizers")
    .select("id, user_id, name, slug, org_type, status, verified_at, tax_id, nonprofit_registration_number")
    .eq("id", id)
    .maybeSingle();

  if (orgError || !organizer) {
    return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  }

  // 2. Defense-in-depth authorization check: user must be owner or manager/admin team member
  const role = await getEntityRole(user.id, id);
  const isOwner = organizer.user_id === user.id;
  const isAuthorized = isOwner || (role !== null && ENTITY_ROLES_MANAGE.includes(role));

  if (!isAuthorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Query most recent submission for this organizer (full history retained, latest created_at = current)
  const { data: submission } = await supabaseAdmin
    .from("organizer_verification_submissions")
    .select("*")
    .eq("organizer_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    organizer,
    submission: submission ?? null,
  });
}
