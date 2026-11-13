import "server-only";
import { jsPDF } from "jspdf";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { formatMoney } from "@/lib/money";
import { BRAND } from "@/config/branding";

export type AgreementData = {
  bookingNumber: string;
  businessName: string;
  customerName: string;
  customerEmail: string | null;
  startsAt: string;
  endsAt: string;
  currency: string;
  rentalAmount: number;
  depositRequired: number;
  vehicleLabel: string | null;
  terms: string | null;
  pickupInspection: {
    odometer: number | null;
    fuel_level: string | null;
    damage_notes: string | null;
    customer_confirmed_name: string;
    customer_confirmed_at: string;
  } | null;
};

function utc(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
}

export async function getRentalAgreementDataByBookingId(bookingId: string): Promise<AgreementData | null> {
  const admin = createSupabaseAdmin();
  const { data: booking } = await admin
    .from("rental_bookings")
    .select("id, booking_number, organizer_id, business_id, vehicle_id, customer_name, customer_email, starts_at, ends_at, snapshot_currency, rental_amount, deposit_required_amount")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return null;
  const b = booking as any;
  const [{ data: business }, { data: vehicle }, { data: pickup }, { data: category }] = await Promise.all([
    admin.from("businesses").select("name, rental_terms").eq("id", b.business_id).maybeSingle(),
    b.vehicle_id ? admin.from("vehicles").select("make, model, license_plate").eq("id", b.vehicle_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("rental_inspections").select("odometer, fuel_level, damage_notes, customer_confirmed_name, customer_confirmed_at").eq("booking_id", b.id).eq("kind", "pickup").maybeSingle(),
    admin.from("vehicle_categories").select("name").eq("id", b.category_id ?? "").maybeSingle().catch(()=>({data:null})),
  ]);
  // category_id not selected above; fetch separately if needed
  let catName: string | null = null;
  if (!b.vehicle_id) {
    const { data: bk } = await admin.from("rental_bookings").select("category_id").eq("id", b.id).maybeSingle();
    if ((bk as any)?.category_id) {
      const { data: c } = await admin.from("vehicle_categories").select("name").eq("id", (bk as any).category_id).maybeSingle();
      catName = (c as any)?.name ?? null;
    }
  }
  const v = vehicle as any;
  const vehicleLabel = v ? `${[v.make, v.model].filter(Boolean).join(" ").trim()}${v.license_plate ? ` (${v.license_plate})` : ""}`.trim() || null : (catName ? `Category: ${catName}` : null);
  return {
    bookingNumber: String(b.booking_number),
    businessName: String((business as any)?.name || "Rental host"),
    customerName: String(b.customer_name),
    customerEmail: b.customer_email ? String(b.customer_email) : null,
    startsAt: String(b.starts_at),
    endsAt: String(b.ends_at),
    currency: String(b.snapshot_currency ?? "USD").toUpperCase(),
    rentalAmount: Number(b.rental_amount) || 0,
    depositRequired: Number(b.deposit_required_amount) || 0,
    vehicleLabel,
    terms: ((business as any)?.rental_terms as string | null) ?? null,
    pickupInspection: pickup ? {
      odometer: (pickup as any).odometer ?? null,
      fuel_level: (pickup as any).fuel_level ?? null,
      damage_notes: (pickup as any).damage_notes ?? null,
      customer_confirmed_name: String((pickup as any).customer_confirmed_name ?? ""),
      customer_confirmed_at: String((pickup as any).customer_confirmed_at ?? ""),
    } : null,
  };
}

export async function getRentalAgreementDataByToken(lookupToken: string): Promise<AgreementData | null> {
  const admin = createSupabaseAdmin();
  const { data: booking } = await admin.from("rental_bookings").select("id").eq("lookup_token", lookupToken).maybeSingle();
  if (!booking) return null;
  return getRentalAgreementDataByBookingId((booking as any).id);
}

export function generateRentalAgreementPdf(d: AgreementData): Buffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 16;
  const width = 210 - margin * 2;
  let y = 18;
  const money = (a: number) => formatMoney(a, d.currency);

  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(17,17,17);
  doc.text("Rental Agreement", margin, y);
  y += 8;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(82,82,91);
  doc.text(`${d.businessName} · Powered by ${BRAND.name}`, margin, y);
  y += 8;

  const row = (label: string, value: string) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(113,113,122);
    doc.text(label.toUpperCase(), margin, y);
    y += 4.5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(24,24,27);
    const lines = doc.splitTextToSize(value || "—", width);
    doc.text(lines, margin, y);
    y += lines.length * 5 + 3;
  };

  row("Booking", d.bookingNumber);
  row("Customer", `${d.customerName}${d.customerEmail ? ` (${d.customerEmail})` : ""}`);
  row("Vehicle", d.vehicleLabel || "To be assigned");
  row("Pickup", utc(d.startsAt));
  row("Return", utc(d.endsAt));
  row("Rental charge", money(d.rentalAmount));
  row("Security deposit", d.depositRequired > 0 ? `${money(d.depositRequired)} (collected separately, not part of rental charge)` : "None");

  if (d.pickupInspection) {
    y += 2; doc.setDrawColor(228,228,231); doc.line(margin, y, 210-margin, y); y += 6;
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(24,24,27);
    doc.text("Pickup inspection summary", margin, y); y += 6;
    row("Odometer", d.pickupInspection.odometer != null ? String(d.pickupInspection.odometer) : "—");
    row("Fuel level", d.pickupInspection.fuel_level || "—");
    if (d.pickupInspection.damage_notes) row("Damage / notes", d.pickupInspection.damage_notes);
    row("Customer confirmation", `${d.pickupInspection.customer_confirmed_name} at ${utc(d.pickupInspection.customer_confirmed_at)}`);
  }

  y += 2; doc.setDrawColor(228,228,231); doc.line(margin, y, 210-margin, y); y += 6;
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(24,24,27);
  doc.text("Terms and conditions", margin, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(39,39,42);
  const terms = (d.terms && d.terms.trim()) ? d.terms.trim() : "No additional rental terms provided by the host.";
  const termLines = doc.splitTextToSize(terms, width);
  const maxY = 285;
  for (const line of termLines) {
    if (y > maxY) { doc.addPage(); y = 18; }
    doc.text(line, margin, y);
    y += 5;
  }

  return Buffer.from(doc.output("arraybuffer"));
}
