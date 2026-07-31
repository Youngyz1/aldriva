export const CAMPAIGN_CATEGORIES = [
  "Medical",
  "Memorial",
  "Emergency",
  "Charity",
  "Education",
  "Animal",
  "Environment",
  "Business",
  "Community",
  "Competition",
  "Creative",
  "Event",
  "Faith",
  "Family",
  "Sports",
  "Travel",
  "Volunteer",
  "Wishes",
  "Other",
] as const;

export type CampaignCategory = (typeof CAMPAIGN_CATEGORIES)[number];
