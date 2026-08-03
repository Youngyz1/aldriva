import { jsPDF } from "jspdf";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { BRAND } from "@/config/branding";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadSignatureImage(filename: string): string | null {
  try {
    const filePath = path.join(process.cwd(), "public", "signatures", filename);
    if (!fs.existsSync(filePath)) return null;
    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString("base64");
    return `data:image/png;base64,${base64}`;
  } catch {
    return null;
  }
}

/** Load any image from /public (not limited to /signatures). */
function loadPublicImage(filename: string): string | null {
  try {
    const filePath = path.join(process.cwd(), "public", filename);
    if (!fs.existsSync(filePath)) return null;
    const ext = path.extname(filename).slice(1).toUpperCase() || "PNG";
    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString("base64");
    return `data:image/${ext.toLowerCase()};base64,${base64}`;
  } catch {
    return null;
  }
}

/** Generate a random 9-digit document ID formatted as "XXX XXX XXX". */
function generateDocumentId(): string {
  const n = Math.floor(100000000 + Math.random() * 900000000).toString();
  return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6, 9)}`;
}


// ── Main export ───────────────────────────────────────────────────────────────

export async function generateCertificatePdf(
  donorName: string,
  amount: number,
  currency: string,
  fundraiserTitle: string,
  donationDate: string,
  organizerName: string
): Promise<Buffer> {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageW = 297;
  const pageH = 210;
  const maroon: [number, number, number] = [139, 26, 26]; // #8B1A1A
  const gray: [number, number, number] = [140, 140, 140];
  const darkText: [number, number, number] = [40, 40, 40];

  // ── White background ───────────────────────────────────────────────────────
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, "F");

  // ── Faded logo watermark (centered vertically at wmCY = 115, height 140) ──
  const wmCY = 115;
  const wmH = 140;
  const logoRatio = 1024 / 538;
  const wmW = wmH * logoRatio;
  const wmX = (pageW - wmW) / 2;
  const wmY = wmCY - wmH / 2;

  const watermarkLogo = loadPublicImage("logo_badge_no_bg.png");
  if (watermarkLogo) {
    doc.saveGraphicsState();
    const gState = new (doc as any).GState({ opacity: 0.08 });
    doc.setGState(gState);
    doc.addImage(watermarkLogo, "PNG", wmX, wmY, wmW, wmH);
    doc.restoreGraphicsState();
  }

  // ── Double maroon border ───────────────────────────────────────────────────
  // Outer thick border (4 pt ≈ 1.4 mm)
  doc.setDrawColor(...maroon);
  doc.setLineWidth(1.4);
  doc.rect(3, 3, pageW - 6, pageH - 6);

  // Inner thin border (1 pt ≈ 0.35 mm), inset by 5mm from outer
  doc.setLineWidth(0.35);
  doc.rect(7, 7, pageW - 14, pageH - 14);

  // ── Title: "Certificate Of Appreciation" ──────────────────────────────────
  doc.setFont("times", "normal");
  doc.setFontSize(40);
  doc.setTextColor(...maroon);
  doc.text("Certificate Of Appreciation", pageW / 2, 32, { align: "center" });

  // Thin maroon line under title
  doc.setDrawColor(...maroon);
  doc.setLineWidth(0.35);
  doc.line(30, 37, pageW - 30, 37);

  // ── "Recognizes" ──────────────────────────────────────────────────────────
  doc.setFont("helvetica", "normal");
  doc.setFontSize(16);
  doc.setTextColor(...gray);
  (doc as any).setCharSpace(1.5);
  doc.text("Recognizes", pageW / 2, 49, { align: "center" });
  (doc as any).setCharSpace(0);

  // ── Donor name ────────────────────────────────────────────────────────────
  const displayName = donorName || "Anonymous";
  doc.setFont("times", "normal");
  doc.setFontSize(48);
  doc.setTextColor(...darkText);
  doc.text(displayName, pageW / 2, 75, { align: "center" });

  // ── Description lines ─────────────────────────────────────────────────────
  const formattedDate = (() => {
    const d = new Date(donationDate);
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const yyyy = d.getUTCFullYear();
    return `${mm}/${dd}/${yyyy}`;
  })();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12.5);
  doc.setTextColor(...gray);
  doc.text(
    `A munificent donation for ${fundraiserTitle},`,
    pageW / 2,
    88,
    { align: "center" }
  );
  doc.text(
    `providing financial support and generosity on ${formattedDate}.`,
    pageW / 2,
    95.5,
    { align: "center" }
  );

  // ── Bold maroon donation amount ────────────────────────────────────────────
  const currencySymbol = currency.toUpperCase() === "USD" ? "$" : currency.toUpperCase() + " ";
  const formattedAmount = `${currencySymbol}${amount.toLocaleString("en-US")}`;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...maroon);
  doc.text(`Munificent ${formattedAmount} donation`, pageW / 2, 108, { align: "center" });

  // ── Footer layout ──────────────────────────────────────────────────────────
  const footerLineY = 155; // y of signature line
  const leftX = 70;
  const rightX = pageW - 70;
  const sealCX = pageW / 2;
  const sealCY = 157;
  // Badge image: height 44mm, width derived from logo aspect ratio (1024×538)
  const badgeH = 44;
  const badgeW = badgeH * logoRatio; // ≈ 83.7 mm — keeps circle un-squished

  const leftSig = loadSignatureImage("left-sig.png");
  const rightSig = loadSignatureImage("right-sig.png");
  const sigW = 44;
  const sigH = 18;

  // Signature images
  if (leftSig) {
    doc.addImage(leftSig, "PNG", leftX - sigW / 2, footerLineY - sigH - 2, sigW, sigH);
  }
  if (rightSig) {
    doc.addImage(rightSig, "PNG", rightX - sigW / 2, footerLineY - sigH - 2, sigW, sigH);
  }

  // ── Left column ────────────────────────────────────────────────────────────
  doc.setDrawColor(...maroon);
  doc.setLineWidth(0.5);
  doc.line(leftX - 30, footerLineY, leftX + 30, footerLineY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...darkText);
  doc.text("Dominic Mumolo", leftX, footerLineY + 7, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...gray);
  doc.text("Director of Development", leftX, footerLineY + 13, { align: "center" });

  // ── Right column ───────────────────────────────────────────────────────────
  const displayOrgName = organizerName || "Campaign Organizer";
  doc.setDrawColor(...maroon);
  doc.setLineWidth(0.5);
  doc.line(rightX - 30, footerLineY, rightX + 30, footerLineY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...darkText);
  const orgLines = doc.splitTextToSize(displayOrgName, 76);
  doc.text(orgLines, rightX, footerLineY + 7, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...gray);
  doc.text("Campaign Organizer", rightX, footerLineY + 7 + orgLines.length * 5.5, {
    align: "center",
  });

  // ── Centre badge (Aldriva logo) ──────────────────────────────────
  const logoBadge = loadPublicImage("logo_badge_no_bg.png");
  if (logoBadge) {
    doc.addImage(
      logoBadge,
      "PNG",
      sealCX - badgeW / 2,   // x: centred horizontally
      sealCY - badgeH / 2,   // y: centred vertically
      badgeW,
      badgeH
    );
  }

  // ── Bottom row: date + document ID ────────────────────────────────────────
  const bottomY = pageH - 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...maroon);
  doc.text(`Date Of Issuance: ${formattedDate}`, 14, bottomY);
  doc.text(`Document ID: ${generateDocumentId()}`, pageW - 14, bottomY, { align: "right" });

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}

// ── Full pipeline: fetch, generate, store, email ──────────────────────────────

export async function processDonationCertificate(donationId: string) {
  try {
    const { data: donation, error: donErr } = await supabaseAdmin
      .from("donations")
      .select("id, donor_name, donor_email, amount, currency, created_at, fundraiser_id")
      .eq("id", donationId)
      .single();

    if (donErr || !donation) {
      console.error(`[processDonationCertificate] Donation ${donationId} not found:`, donErr?.message);
      return;
    }

    if (!donation.donor_email) {
      console.log(`[processDonationCertificate] No donor email for donation ${donationId}, skipping.`);
      return;
    }

    const { data: fundraiser, error: fundErr } = await supabaseAdmin
      .from("fundraisers")
      .select("title, organizer_id")
      .eq("id", donation.fundraiser_id)
      .single();

    if (fundErr || !fundraiser) {
      console.error(`[processDonationCertificate] Fundraiser ${donation.fundraiser_id} not found:`, fundErr?.message);
      return;
    }

    let organizerName = "Campaign Organizer";
    if (fundraiser.organizer_id) {
      const { data: organizer } = await supabaseAdmin
        .from("organizers")
        .select("name")
        .eq("id", fundraiser.organizer_id)
        .single();
      if (organizer?.name) organizerName = organizer.name;
    }

    const pdfBuffer = await generateCertificatePdf(
      donation.donor_name || "Anonymous",
      donation.amount,
      donation.currency,
      fundraiser.title || "Campaign",
      donation.created_at,
      organizerName
    );

    // Update certificate_path in donations table
    await supabaseAdmin
      .from("donations")
      .update({ certificate_path: `/api/certificates/${donationId}` })
      .eq("id", donationId);

    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);

      const { error: emailErr } = await resend.emails.send({
        from: `${BRAND.name} <${BRAND.contactEmail}>`,
        to: donation.donor_email,
        subject: `Your Certificate of Appreciation — ${fundraiser.title} 🏅`,
        html: `
          <div style="font-family: sans-serif; color: #18181b; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <img src="${BRAND.website}/logo_badge_no_bg.png" alt="${BRAND.name}" style="height: 60px; width: auto;" />
            </div>
            <h2 style="color: #8B1A1A; margin-bottom: 20px;">Your Certificate of Appreciation</h2>
            <p>Hi ${donation.donor_name || "there"},</p>
            <p>On behalf of everyone at <strong>${BRAND.name}</strong>, thank you for your generous donation of
               <strong>$${donation.amount.toFixed(2)} ${donation.currency.toUpperCase()}</strong>
               to <strong>${fundraiser.title}</strong>.</p>
            <p>Please find attached your official Certificate of Appreciation.
               You can download and share it to inspire others to give.</p>
            <p style="margin-top: 30px; font-size: 12px; color: #71717a;">
              ${BRAND.name} · ${BRAND.supportEmail}
            </p>
          </div>
        `,
        attachments: [
          {
            filename: "donation_certificate.pdf",
            content: pdfBuffer.toString("base64"),
          },
        ],
      });

      if (emailErr) {
        console.error(
          `[processDonationCertificate] Resend rejected email to ${donation.donor_email}:`,
          JSON.stringify(emailErr, null, 2)
        );
      } else {
        console.log(`[processDonationCertificate] Certificate email sent to ${donation.donor_email}`);
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error("[processDonationCertificate] Unexpected error:", err.message, err.stack);
    } else {
      console.error("[processDonationCertificate] Unexpected error:", err);
    }
  }
}