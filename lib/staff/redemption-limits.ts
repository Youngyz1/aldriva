import type { RateLimitName, RateLimitResult } from "@/lib/rate-limit";

export type RedemptionLimitName = "invitationRedemption" | "ipInvitationRedemption";
export type RedemptionLimitVerdict =
  | { allowed: true }
  | { allowed: false; reason: "limited" | "unavailable"; retryAfter: number };

export async function checkEventStaffRedemptionLimits(
  check: (name: RateLimitName, identifier: string) => Promise<RateLimitResult>,
  invitationIdentifier: string,
  ipIdentifier: string
): Promise<RedemptionLimitVerdict> {
  const [invitation, ip] = await Promise.all([
    check("invitationRedemption", invitationIdentifier),
    check("ipInvitationRedemption", ipIdentifier),
  ]);
  const retryAfter = Math.max(invitation.retryAfter, ip.retryAfter);
  if (invitation.unavailable || ip.unavailable) {
    return { allowed: false, reason: "unavailable", retryAfter: retryAfter || 60 };
  }
  if (!invitation.allowed || !ip.allowed) {
    return { allowed: false, reason: "limited", retryAfter };
  }
  return { allowed: true };
}
