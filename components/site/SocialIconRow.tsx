import {
  IconBrandFacebook,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandTiktok,
  IconBrandWhatsapp,
  IconBrandX,
  IconBrandYoutube,
  IconMail,
} from "@tabler/icons-react";
import { sanitizeUrl } from "@/lib/sanitize-url";
import type { ContentSocials } from "@/lib/website-content";

export interface SocialIconRowProps {
  /** Owner email — rendered as a mailto icon button. */
  email?: string;
  /** Digits-only WhatsApp number (already validated upstream). */
  whatsapp?: string;
  socials?: ContentSocials;
  className?: string;
}

const NETWORK_ICONS: Record<string, { Icon: typeof IconMail; label: string }> = {
  whatsapp: { Icon: IconBrandWhatsapp, label: "WhatsApp" },
  email: { Icon: IconMail, label: "Email" },
  instagram: { Icon: IconBrandInstagram, label: "Instagram" },
  facebook: { Icon: IconBrandFacebook, label: "Facebook" },
  tiktok: { Icon: IconBrandTiktok, label: "TikTok" },
  x: { Icon: IconBrandX, label: "X" },
  linkedin: { Icon: IconBrandLinkedin, label: "LinkedIn" },
  youtube: { Icon: IconBrandYoutube, label: "YouTube" },
};

const SOCIAL_NETWORKS = ["instagram", "facebook", "tiktok", "x", "linkedin", "youtube"] as const;

/**
 * Round icon-button row for WhatsApp, email, and social links. Shared by the
 * footer, contact page, and hours-location card so all three stay in sync.
 * Empty entries are simply omitted; renders nothing when there's nothing to show.
 */
export function SocialIconRow({ email, whatsapp, socials, className = "" }: SocialIconRowProps) {
  const items: Array<{ key: string; href: string }> = [];
  if (whatsapp) items.push({ key: "whatsapp", href: `https://wa.me/${whatsapp}` });
  const safeEmail = email ? sanitizeUrl(`mailto:${email}`) : "";
  if (safeEmail) items.push({ key: "email", href: safeEmail });
  for (const network of SOCIAL_NETWORKS) {
    const raw = socials?.[network];
    const href = raw ? sanitizeUrl(raw) : "";
    if (href) items.push({ key: network, href });
  }

  if (items.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {items.map(({ key, href }) => {
        const entry = NETWORK_ICONS[key];
        const Icon = entry.Icon;
        return (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={entry.label}
            title={entry.label}
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-[var(--tf-border)] text-[var(--tf-ink)] transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-accent)]"
          >
            <Icon className="h-5 w-5" stroke={1.75} aria-hidden="true" />
          </a>
        );
      })}
    </div>
  );
}
