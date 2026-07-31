import { jsPDF } from "jspdf";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface DonationReceiptData {
  id: string;
  donor_name: string | null;
  donor_email: string | null;
  amount: number;
  currency: string;
  created_at: string;
  payment_intent_id: string | null;
}

export interface OrganizerReceiptData {
  name: string;
  organization_name: string | null;
  nonprofit_registration_number: string | null;
  tax_id: string | null;
}

/**
 * Generates a donation receipt PDF.
 * If the organizer is a nonprofit, it formats it as a tax-deductible receipt/certificate.
 */
export async function generateReceiptPdf(
  donation: DonationReceiptData,
  organizer: OrganizerReceiptData | null,
  fundraiserTitle: string
): Promise<Buffer> {
  // Create jsPDF instance (A4 size, portrait)
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const isNonprofit = !!(
    organizer?.organization_name &&
    organizer?.nonprofit_registration_number
  );

  // Colors
  const primaryColor = isNonprofit ? [16, 185, 129] : [79, 70, 229]; // Emerald (green) vs Indigo (violet)
  const textColor = [24, 24, 27];
  const mutedTextColor = [113, 113, 122];

  // Title / Logo area
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text("Aldriva", 20, 25);

  doc.setFontSize(10);
  doc.setTextColor(mutedTextColor[0], mutedTextColor[1], mutedTextColor[2]);
  doc.setFont("helvetica", "normal");
  doc.text("Empowering Good Causes Everywhere", 20, 31);

  // Receipt / Certificate header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  const docHeader = isNonprofit ? "TAX-DEDUCTIBLE DONATION RECEIPT" : "DONATION RECEIPT";
  doc.text(docHeader, 20, 45);

  // Line separator
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.5);
  doc.line(20, 49, 190, 49);

  // Metadata block
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(mutedTextColor[0], mutedTextColor[1], mutedTextColor[2]);
  doc.text(`Receipt Number: ${donation.id}`, 20, 56);
  doc.text(`Date Issued: ${new Date().toLocaleDateString("en-US", { dateStyle: "long" })}`, 20, 61);

  // Main Details Section
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.text("Donation Details", 20, 75);

  // Details box
  doc.setFillColor(250, 250, 250);
  doc.rect(20, 80, 170, 40, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Fundraiser / Campaign:", 25, 87);
  doc.setFont("helvetica", "bold");
  doc.text(fundraiserTitle, 70, 87);

  doc.setFont("helvetica", "normal");
  doc.text("Donor Name:", 25, 94);
  doc.text(donation.donor_name || "Anonymous", 70, 94);

  doc.text("Donation Amount:", 25, 101);
  doc.setFont("helvetica", "bold");
  const currencySymbol = donation.currency.toUpperCase() === "USD" ? "$" : "";
  doc.text(`${currencySymbol}${donation.amount.toFixed(2)} ${donation.currency.toUpperCase()}`, 70, 101);

  doc.setFont("helvetica", "normal");
  doc.text("Transaction Date:", 25, 108);
  doc.text(new Date(donation.created_at).toLocaleDateString("en-US", { dateStyle: "long" }), 70, 108);

  if (donation.payment_intent_id) {
    doc.text("Transaction ID:", 25, 115);
    doc.setFontSize(9);
    doc.text(donation.payment_intent_id, 70, 115);
    doc.setFontSize(10);
  }

  // Recipient / Organization Section
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Recipient Information", 20, 132);

  doc.setFont("helvetica", "normal");
  if (isNonprofit && organizer) {
    doc.text("Organization Name:", 20, 140);
    doc.setFont("helvetica", "bold");
    doc.text(organizer.organization_name!, 65, 140);

    doc.setFont("helvetica", "normal");
    doc.text("Nonprofit Reg. Number:", 20, 147);
    doc.text(organizer.nonprofit_registration_number!, 65, 147);

    if (organizer.tax_id) {
      doc.text("Tax ID / EIN:", 20, 154);
      doc.text(organizer.tax_id, 65, 154);
    }

    // Callout Box for Tax Deductibility
    doc.setFillColor(236, 253, 245); // Emerald-50
    doc.setDrawColor(167, 243, 208); // Emerald-200
    doc.rect(20, 163, 170, 22, "FD");

    doc.setFont("helvetica", "bold");
    doc.setTextColor(16, 185, 129); // Emerald-600
    doc.setFontSize(10);
    doc.text("★ Tax-Deductible Donation Certificate", 25, 169);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(5, 150, 105);
    doc.setFontSize(9);
    doc.text(
      "No goods or services were provided in exchange for this contribution. Aldriva certifies that",
      25,
      174
    );
    doc.text(
      "this donation is tax-deductible to the fullest extent permitted by local tax laws.",
      25,
      179
    );
  } else {
    const orgName = organizer?.name || "Campaign Organizer";
    doc.text("Organizer Name:", 20, 140);
    doc.text(orgName, 65, 140);

    // Callout Box for Standard receipt info
    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(228, 228, 231);
    doc.rect(20, 148, 170, 22, "FD");

    doc.setFont("helvetica", "bold");
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.setFontSize(10);
    doc.text("Standard Donation Receipt", 25, 154);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(mutedTextColor[0], mutedTextColor[1], mutedTextColor[2]);
    doc.setFontSize(9);
    doc.text(
      "This receipt acknowledges the receipt of your personal contribution to the above fundraiser.",
      25,
      159
    );
    doc.text(
      "Please note: Donations to individual organizers are generally not tax-deductible.",
      25,
      164
    );
  }

  // Footer / Thank you
  doc.setDrawColor(244, 244, 245);
  doc.line(20, 260, 190, 260);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(mutedTextColor[0], mutedTextColor[1], mutedTextColor[2]);
  doc.text("Thank you for your generosity and supporting the community!", 20, 266);
  doc.text(
    "For any questions regarding this receipt, please contact support@fund4agoodcause.com",
    20,
    271
  );

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}

/**
 * Handles the complete post-donation process:
 * 1. Resolves fundraiser and organizer to check nonprofit status.
 * 2. Saves dynamic receipt / certificate paths to database.
 * 3. Generates the PDF.
 * 4. Emails the PDF as an attachment to the donor via Resend.
 */
export async function processDonationReceipt(donationId: string) {
  try {
    console.log("[processDonationReceipt] Started:", donationId);

    // 1. Fetch donation details
    const { data: donation, error: donErr } = await supabaseAdmin
      .from("donations")
      .select("id, donor_name, donor_email, amount, currency, created_at, payment_intent_id, fundraiser_id")
      .eq("id", donationId)
      .single();

    if (donErr || !donation) {
      console.error(`[processDonationReceipt] Donation ${donationId} not found:`, donErr?.message);
      return;
    }

    console.log("[processDonationReceipt] Donation loaded:", {
      id: donation.id,
      email: donation.donor_email,
      amount: donation.amount,
    });

    // 2. Fetch fundraiser details
    const { data: fundraiser, error: fundErr } = await supabaseAdmin
      .from("fundraisers")
      .select("title, organizer_id")
      .eq("id", donation.fundraiser_id)
      .single();

    if (fundErr || !fundraiser) {
      console.error(`[processDonationReceipt] Fundraiser ${donation.fundraiser_id} not found:`, fundErr?.message);
      return;
    }

    // 3. Fetch organizer details
    let organizer = null;
    if (fundraiser.organizer_id) {
      const { data: org } = await supabaseAdmin
        .from("organizers")
        .select("name, user_id, organization_name, nonprofit_registration_number, tax_id")
        .eq("id", fundraiser.organizer_id)
        .single();
      organizer = org;
    }

    const isNonprofit = !!(
      organizer?.organization_name &&
      organizer?.nonprofit_registration_number
    );

    const receiptPath = `/api/receipts/${donation.id}`;
    const certificatePath = isNonprofit ? `/api/receipts/${donation.id}` : null;

    // 4. Update donation record with receipt/certificate paths
    const { error: updateErr } = await supabaseAdmin
      .from("donations")
      .update({
        receipt_path: receiptPath,
        certificate_path: certificatePath,
      })
      .eq("id", donation.id);

    if (updateErr) {
      console.error(`[processDonationReceipt] Failed to update donation paths for ${donation.id}:`, updateErr.message);
    }

    // 5. Generate PDF
    console.log("[processDonationReceipt] Generating PDF...");
    const pdfBuffer = await generateReceiptPdf(
      donation,
      organizer,
      fundraiser.title || "Campaign"
    );
    console.log("[processDonationReceipt] PDF generated successfully. Size:", pdfBuffer.length);

    // 6. Email receipt to donor
    const recipientEmail = donation.donor_email;

    console.log("[processDonationReceipt] Email check:", {
      donor_email: donation.donor_email,
      actual_recipient: recipientEmail,
      hasResendKey: !!process.env.RESEND_API_KEY,
    });

    if (recipientEmail && process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromAddress = `Aldriva <${process.env.RESEND_FROM_EMAIL || "contact@fund4agoodcause.com"}>`;
      const subject = isNonprofit
        ? `Your Tax-Deductible Donation Receipt for ${fundraiser.title} 📄`
        : `Your Donation Receipt for ${fundraiser.title} 📄`;

      const htmlContent = `
        <div style="font-family: sans-serif; color: #18181b; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: ${isNonprofit ? "#10b981" : "#4f46e5"}; margin-bottom: 20px;">Thank you for your donation!</h2>
          <p>Hi ${donation.donor_name || "there"},</p>
          <p>We've successfully received your donation of <strong>$${donation.amount.toFixed(2)} ${donation.currency.toUpperCase()}</strong> to the fundraiser <strong>${fundraiser.title}</strong>.</p>
          <p>Please find attached your official receipt PDF.</p>
          ${
            isNonprofit
              ? `<div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 15px; margin: 20px 0; color: #065f46; font-size: 14px;">
                  <strong>Tax-Deductible Contribution:</strong> This fundraiser is organized by a registered nonprofit organization (<strong>${organizer?.organization_name}</strong>). Your receipt is marked as tax-deductible.
                 </div>`
              : ""
          }
          <p style="margin-top: 30px; font-size: 12px; color: #71717a;">
            Aldriva · support@fund4agoodcause.com
          </p>
        </div>
      `;

      console.log("[processDonationReceipt] Sending email to:", recipientEmail);

      const emailResponse = await resend.emails.send({
        from: fromAddress,
        to: recipientEmail,
        subject,
        html: htmlContent,
        attachments: [
          {
            filename: isNonprofit ? "tax_receipt.pdf" : "donation_receipt.pdf",
            content: pdfBuffer.toString("base64"),
          },
        ],
      });

      console.log("[processDonationReceipt] Resend response:", JSON.stringify(emailResponse, null, 2));

      if (emailResponse.error) {
        console.error(
          `[processDonationReceipt] Resend API rejected email to ${recipientEmail}:`,
          JSON.stringify(emailResponse.error, null, 2)
        );
      } else {
        console.log(`[processDonationReceipt] Receipt email sent successfully to ${recipientEmail}`);
      }
    } else if (!recipientEmail) {
      console.warn("[processDonationReceipt] No recipient email — skipping email send.");
    } else if (!process.env.RESEND_API_KEY) {
      console.warn("[processDonationReceipt] RESEND_API_KEY not set — skipping email send.");
    }
  } catch (err: any) {
    console.error("[processDonationReceipt] Unexpected error:", err.message, err.stack);
  }
}