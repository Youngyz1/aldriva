import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { checkTenantAccess } from "@/lib/entity-auth";
import { generateRentalAgreementPdf, getRentalAgreementDataByBookingId } from "@/lib/rental/agreement";

export async function GET(req: NextRequest, { params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const { searchParams } = new URL(req.url);
  const organizerId = searchParams.get("organizerId") || "";
  if (!organizerId) return NextResponse.json({ error: "Missing organizerId" }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await checkTenantAccess(user.id, organizerId, ["owner", "admin", "manager", "editor", "finance", "viewer"]);
  if (!access.hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const data = await getRentalAgreementDataByBookingId(bookingId);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // ensure booking belongs to organizer (quick check via admin in helper not scoped; recheck)
  const { createSupabaseAdmin } = await import("@/lib/supabase-admin");
  const admin = createSupabaseAdmin();
  const { data: b } = await admin.from("rental_bookings").select("id").eq("id", bookingId).eq("organizer_id", organizerId).maybeSingle();
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pdf = generateRentalAgreementPdf(data);
  const filename = `rental_agreement_${data.bookingNumber.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `attachment; filename=${filename}`);
  return new NextResponse(new Uint8Array(pdf), { status: 200, headers });
}
