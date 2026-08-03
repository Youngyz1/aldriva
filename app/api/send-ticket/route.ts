import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { BRAND } from "@/config/branding";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const {
      buyerEmail,
      buyerName,
      eventTitle,
      eventSlug,
      qrCode,
      seatLabel,
      isFree,
    } = await req.json();

    if (!buyerEmail || !qrCode) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const ticketUrl = `${baseUrl}/ticket-confirmation?qr=${qrCode}&event=${eventSlug}${isFree ? "&free=true" : ""}`;
    const verifyUrl = `${baseUrl}/verify/${qrCode}`;

    const { error } = await resend.emails.send({
      from: `${BRAND.name} <${BRAND.contactEmail}>`,
      to: buyerEmail,
      subject: `Your ticket for ${eventTitle} 🎟️`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>
        <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
            <tr>
              <td align="center">
                <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

                  <!-- Header -->
                  <tr>
                    <td style="background:linear-gradient(135deg,#f97316,#ea580c);padding:32px;text-align:center;">
                      <p style="margin:0;color:#fed7aa;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Aldriva</p>
                      <h1 style="margin:8px 0 0;color:#ffffff;font-size:28px;font-weight:900;">You're In! 🎉</h1>
                    </td>
                  </tr>

                  <!-- Body -->
                  <tr>
                    <td style="padding:32px;">
                      <p style="margin:0 0 8px;color:#71717a;font-size:14px;">
                        Hi ${buyerName || "there"},
                      </p>
                      <p style="margin:0 0 24px;color:#18181b;font-size:16px;line-height:1.6;">
                        Your ${isFree ? "free " : ""}ticket for <strong>${eventTitle}</strong> is confirmed.
                        ${seatLabel ? `Your seat: <strong>${seatLabel}</strong>.` : ""}
                      </p>

                      <!-- Ticket box -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:2px dashed #e4e4e7;border-radius:12px;margin-bottom:24px;">
                        <tr>
                          <td style="padding:24px;text-align:center;">
                            <p style="margin:0 0 12px;color:#71717a;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Your QR Code</p>
                            <img
                              src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(verifyUrl)}"
                              alt="Ticket QR Code"
                              width="200"
                              height="200"
                              style="border-radius:8px;"
                            />
                            <p style="margin:12px 0 0;color:#a1a1aa;font-size:11px;font-family:monospace;letter-spacing:2px;">
                              ${qrCode.match(/.{1,8}/g)?.join(" ")}
                            </p>
                          </td>
                        </tr>
                      </table>

                      <!-- CTA -->
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="center" style="padding-bottom:24px;">
                            <a href="${ticketUrl}"
                              style="display:inline-block;background:#f97316;color:#ffffff;font-weight:700;font-size:16px;padding:14px 32px;border-radius:50px;text-decoration:none;">
                              View My Ticket
                            </a>
                          </td>
                        </tr>
                      </table>

                      <p style="margin:0;color:#71717a;font-size:13px;line-height:1.6;text-align:center;">
                        Show this QR code at the door for entry.<br/>
                        <strong style="color:#18181b;">Do not share this code with others.</strong>
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background:#fafafa;border-top:1px solid #f4f4f5;padding:20px 32px;text-align:center;">
                      <p style="margin:0;color:#a1a1aa;font-size:12px;">
                        ${BRAND.name} · Questions? <a href="mailto:${BRAND.supportEmail}" style="color:#f97316;">Contact support</a>
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json({ error: "Failed to send email." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Send ticket error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
