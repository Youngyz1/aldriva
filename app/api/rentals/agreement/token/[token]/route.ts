import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { generateRentalAgreementPdf, getRentalAgreementDataByToken } from "@/lib/rental/agreement";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!UUID.test(token)) return NextResponse.json({ error: "Invalid link." }, { status: 400 });
  const limited = await enforceRateLimit("guestLookup", _req);
  if (limited) return limited;
  const data = await getRentalAgreementDataByToken(token);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const pdf = generateRentalAgreementPdf(data);
  const filename = `rental_agreement_${data.bookingNumber.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `attachment; filename=${filename}`);
  return new NextResponse(new Uint8Array(pdf), { status: 200, headers });
}
