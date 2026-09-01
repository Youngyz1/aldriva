/**
 * app/api/dashboard/organizers/[id]/registration/route.ts
 * GET / PATCH — Server-side endpoint for organizer tax_id and nonprofit_registration_number.
 * Uses service role to bypass migration_53's REVOKE SELECT on column-level permissions for authenticated role.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getEntityRole, ENTITY_ROLES_MANAGE } from "@/lib/entity-auth";

const supabaseAdmin = createSupabaseAdmin();

async function authorizeUserForOrganizer(userId: string, organizerId: string) {
  const { data: organizer, error } = await supabaseAdmin
    .from("organizers")
    .select("id, user_id")
    .eq("id", organizerId)
    .maybeSingle();

  if (error || !organizer) {
    return { authorized: false, status: 404, message: "Organization not found." };
  }

  const role = await getEntityRole(userId, organizerId);
  const isOwner = organizer.user_id === userId;
  const isAuthorized = isOwner || (role !== null && ENTITY_ROLES_MANAGE.includes(role));

  if (!isAuthorized) {
    return { authorized: false, status: 403, message: "Forbidden" };
  }

  return { authorized: true, status: 200, organizer };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const authCheck = await authorizeUserForOrganizer(user.id, id);
  if (!authCheck.authorized) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const { data, error } = await supabaseAdmin
    .from("organizers")
    .select("tax_id, nonprofit_registration_number")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    tax_id: data.tax_id ?? null,
    nonprofit_registration_number: data.nonprofit_registration_number ?? null,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const authCheck = await authorizeUserForOrganizer(user.id, id);
  if (!authCheck.authorized) {
    return NextResponse.json({ error: authCheck.message }, { status: authCheck.status });
  }

  const body = await req.json().catch(() => ({}));
  const { tax_id, nonprofit_registration_number } = body as {
    tax_id?: string | null;
    nonprofit_registration_number?: string | null;
  };

  const updatePayload: Record<string, string | null> = {};

  if (tax_id !== undefined) {
    const val = tax_id?.trim() ?? null;
    if (val && val.length > 255) {
      return NextResponse.json({ error: "Tax ID / EIN exceeds 255 characters limit." }, { status: 400 });
    }
    updatePayload.tax_id = val;
  }

  if (nonprofit_registration_number !== undefined) {
    const val = nonprofit_registration_number?.trim() ?? null;
    if (val && val.length > 255) {
      return NextResponse.json({ error: "Registration Number exceeds 255 characters limit." }, { status: 400 });
    }
    updatePayload.nonprofit_registration_number = val;
  }

  const { error: updateErr } = await supabaseAdmin
    .from("organizers")
    .update(updatePayload)
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, ...updatePayload });
}
