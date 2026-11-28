// Pure builder for the staff invitation email. No network access, no secrets.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildStaffInvitationEmail(input: { brandName: string; link: string }): {
  subject: string;
  html: string;
} {
  const brand = escapeHtml(input.brandName);
  const link = escapeHtml(input.link);
  return {
    subject: `You have been invited to join a team on ${input.brandName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px;">
        <h2 style="margin-bottom: 16px;">Staff invitation</h2>
        <p>Hello,</p>
        <p>You have been invited to join a team on <strong>${brand}</strong>.</p>
        <p>Sign in or create an account with the email address this message was sent to, confirm that address, then open the link below to accept.</p>
        <p style="margin: 28px 0;">
          <a href="${link}" style="background:#f97316;color:#ffffff;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:bold;display:inline-block;">Accept invitation</a>
        </p>
        <p style="color:#6b7280;font-size:13px;">If you were not expecting this invitation, you can safely ignore this email. The link works once and expires in 7 days.</p>
      </div>
    `,
  };
}
