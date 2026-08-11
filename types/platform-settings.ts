export type PlatformSettingInputType =
  | "boolean"
  | "number"
  | "email"
  | "color"
  | "text";

export type PlatformSettingKey =
  | "platform_fee_percent"
  | "donation_fee_percent"
  | "featured_event_price"
  | "featured_fundraiser_price"
  | "require_event_approval"
  | "require_fundraiser_approval"
  | "organizer_auto_approval"
  | "support_email"
  | "support_reply_to_email"
  | "support_noreply_email"
  | "platform_name"
  | "platform_logo_url"
  | "platform_favicon_url"
  | "platform_primary_color"
  | "allow_guest_checkout"
  | "require_email_verification"
  | "enable_admin_2fa";

export type PlatformSettingGroupId =
  | "payments"
  | "moderation"
  | "email"
  | "branding"
  | "security";

export interface PlatformSettingField {
  key: PlatformSettingKey;
  label: string;
  description?: string;
  inputType: PlatformSettingInputType;
}

export interface PlatformSettingGroup {
  id: PlatformSettingGroupId;
  title: string;
  description: string;
  fields: PlatformSettingField[];
}

export const PLATFORM_SETTING_GROUPS: PlatformSettingGroup[] = [
  {
    id: "payments",
    title: "Payments",
    description: "Platform fees and featured listing prices.",
    fields: [
      { key: "platform_fee_percent", label: "Platform Fee %", inputType: "number", description: "Fee on ticket sales" },
      { key: "donation_fee_percent", label: "Donation Fee %", inputType: "number", description: "Fee on donations" },
      { key: "featured_event_price", label: "Featured Event Price ($)", inputType: "number" },
      { key: "featured_fundraiser_price", label: "Featured Fundraiser Price ($)", inputType: "number" },
    ],
  },
  {
    id: "moderation",
    title: "Moderation",
    description: "Approval rules for events, fundraisers, and organizers.",
    fields: [
      { key: "require_event_approval", label: "Require Event Approval", inputType: "boolean" },
      { key: "require_fundraiser_approval", label: "Require Fundraiser Approval", inputType: "boolean" },
      { key: "organizer_auto_approval", label: "Auto-Approve Organizers", inputType: "boolean" },
    ],
  },
  {
    id: "email",
    title: "Email",
    description: "Support and transactional email addresses.",
    fields: [
      { key: "support_email", label: "Support Email", inputType: "email" },
      { key: "support_reply_to_email", label: "Reply-To Email", inputType: "email" },
      { key: "support_noreply_email", label: "No-Reply Email", inputType: "email" },
    ],
  },
  {
    id: "branding",
    title: "Branding",
    description: "Platform identity and visual defaults.",
    fields: [
      { key: "platform_name", label: "Platform Name", inputType: "text" },
      { key: "platform_logo_url", label: "Logo URL", inputType: "text" },
      { key: "platform_favicon_url", label: "Favicon URL", inputType: "text" },
      { key: "platform_primary_color", label: "Primary Color", inputType: "color" },
    ],
  },
  {
    id: "security",
    title: "Security",
    description: "Checkout and account security policies.",
    fields: [
      { key: "allow_guest_checkout", label: "Allow Guest Checkout", inputType: "boolean" },
      { key: "require_email_verification", label: "Require Email Verification", inputType: "boolean" },
      { key: "enable_admin_2fa", label: "Enable Admin 2FA", inputType: "boolean" },
    ],
  },
];

export const PLATFORM_SETTING_KEYS: PlatformSettingKey[] = PLATFORM_SETTING_GROUPS.flatMap(
  (group) => group.fields.map((field) => field.key)
);

export const PLATFORM_SETTING_KEY_SET = new Set<string>(PLATFORM_SETTING_KEYS);

export const DEFAULT_PLATFORM_SETTINGS: Record<PlatformSettingKey, string> = {
  platform_fee_percent: "5",
  donation_fee_percent: "3",
  featured_event_price: "29",
  featured_fundraiser_price: "19",
  require_event_approval: "true",
  require_fundraiser_approval: "true",
  organizer_auto_approval: "false",
  support_email: "support@Aldriva.com",
  support_reply_to_email: "",
  support_noreply_email: "",
  platform_name: "Aldriva",
  platform_logo_url: "",
  platform_favicon_url: "",
  platform_primary_color: "#7c3aed",
  allow_guest_checkout: "true",
  require_email_verification: "false",
  enable_admin_2fa: "false",
};

export function mergePlatformSettings(
  rows: { key: string; value: string | null }[] | null | undefined
): Record<PlatformSettingKey, string> {
  const merged = { ...DEFAULT_PLATFORM_SETTINGS };

  for (const row of rows ?? []) {
    if (PLATFORM_SETTING_KEY_SET.has(row.key) && row.value != null) {
      merged[row.key as PlatformSettingKey] = row.value;
    }
  }

  return merged;
}

export function platformSettingsToRows(
  settings: Record<PlatformSettingKey, string>
): { key: PlatformSettingKey; value: string }[] {
  return PLATFORM_SETTING_KEYS.map((key) => ({
    key,
    value: settings[key],
  }));
}
