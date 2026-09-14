export type InvitationTemplateCategory =
  | "Wedding & Formal"
  | "Birthday & Celebration"
  | "Corporate & Conference"
  | "Gala & Fundraiser"
  | "Concert & Festival"
  | "Casual & Community";

export const INVITATION_CATEGORIES: InvitationTemplateCategory[] = [
  "Wedding & Formal",
  "Birthday & Celebration",
  "Corporate & Conference",
  "Gala & Fundraiser",
  "Concert & Festival",
  "Casual & Community",
];

export interface LayoutSlotConfig {
  topPercent: number;
  leftPercent: number;
  widthPercent: number;
  textAlign?: "left" | "center" | "right";
  fontSize: number;
  fontWeight?: number | string;
  fontFamily?: string;
  letterSpacing?: number;
  textTransform?: "uppercase" | "lowercase" | "capitalize" | "none";
  color: string;
  lineHeight?: number | string;
}

export interface InvitationLayoutConfig {
  canvas: {
    width: number;
    height: number;
    aspectRatio?: string;
  };
  typography: {
    titleFont: string;
    bodyFont: string;
    accentFont?: string;
  };
  colorPalette: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
  };
  slots: {
    headerBadge?: LayoutSlotConfig;
    eventTitle: LayoutSlotConfig;
    guestName: LayoutSlotConfig;
    customMessage?: LayoutSlotConfig;
    eventMeta: LayoutSlotConfig;
    footerBranding?: LayoutSlotConfig;
  };
}

export interface InvitationTemplate {
  id: string;
  name: string;
  slug: string;
  category: InvitationTemplateCategory;
  background_image_url: string;
  thumbnail_url?: string | null;
  layout_config: InvitationLayoutConfig;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}
