/**
 * lib/event-taxonomy.ts
 * Code-owned event taxonomy: Category → Subcategory
 * Separate from Business taxonomy (Industry→Category→Business Type)
 * Event category describes WHAT THE EVENT IS, not organizer industry.
 */

export const EVENT_CATEGORIES = [
  "Music & Concerts",
  "Festivals & Cultural Events",
  "Food & Drink",
  "Sports & Fitness",
  "Business & Networking",
  "Conferences & Summits",
  "Education & Workshops",
  "Arts & Creative",
  "Community & Social",
  "Charity & Fundraising",
  "Religious & Spiritual",
  "Family & Kids",
  "Health & Wellness",
  "Technology",
  "Fashion & Lifestyle",
  "Travel & Tourism",
  "Entertainment",
  "Government & Civic",
  "Professional / Industry",
  "Other",
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const SUBCATEGORIES_BY_CATEGORY: Record<EventCategory, readonly string[]> = {
  "Music & Concerts": ["Concert", "Live Music", "DJ / Club Night", "Classical Music", "Jazz", "Gospel", "Cultural Music", "Open Mic"],
  "Festivals & Cultural Events": ["Cultural Festival", "Heritage Event", "Seasonal Festival", "Carnival", "Parade"],
  "Food & Drink": ["Food Festival", "Cooking Class", "Tasting", "Dinner", "Brunch", "Food Fair", "Wine & Brewery"],
  "Sports & Fitness": ["Football", "Basketball", "Running", "Cycling", "Martial Arts", "Fitness", "Tournament", "Marathon", "Yoga"],
  "Business & Networking": ["Networking", "Business Meetup", "Startup Event", "Investor Event", "Career Fair", "Job Fair", "Pitch Night"],
  "Conferences & Summits": ["Business Conference", "Tech Summit", "Industry Summit", "Leadership Summit"],
  "Education & Workshops": ["Workshop", "Training", "Seminar", "Masterclass", "Webinar", "Course", "Conference", "Bootcamp"],
  "Arts & Creative": ["Art Exhibition", "Theatre", "Dance", "Film Screening", "Poetry", "Book Launch", "Photography Exhibition", "Creative Fair"],
  "Community & Social": ["Community Meetup", "Social Gathering", "Dating Event", "Neighborhood Event", "Cultural Exchange", "Wedding"],
  "Charity & Fundraising": ["Charity Event", "Fundraising Dinner", "Donation Drive", "Awareness Event", "Volunteer Day", "Gala"],
  "Religious & Spiritual": ["Religious Gathering", "Worship Service", "Spiritual Retreat", "Pilgrimage"],
  "Family & Kids": ["Kids Workshop", "Family Fun Day", "Parenting Seminar", "Children's Festival", "Kids Competition", "Wedding"],
  "Health & Wellness": ["Wellness Retreat", "Health Seminar", "Medical Camp", "Fitness Challenge", "Mental Health"],
  Technology: ["Hackathon", "Tech Conference", "Product Launch", "Startup Demo Day", "Developer Meetup"],
  "Fashion & Lifestyle": ["Fashion Show", "Lifestyle Expo", "Beauty Workshop", "Pop-up Market"],
  "Travel & Tourism": ["Travel Expo", "Tourism Networking", "Destination Showcase", "Backpacker Meetup"],
  Entertainment: ["Comedy Show", "Nightclub Event", "Concert Afterparty", "Gaming Tournament", "Entertainment Expo"],
  "Government & Civic": ["Town Hall", "Civic Forum", "Policy Dialogue", "Public Hearing", "Community Planning"],
  "Professional / Industry": ["Industry Conference", "Professional Workshop", "Certification Event"],
  Other: ["Custom Event"],
};

export function isValidEventCategory(v: unknown): v is EventCategory {
  return typeof v === "string" && (EVENT_CATEGORIES as readonly string[]).includes(v);
}

export function getSubcategoriesForCategory(category: string): readonly string[] {
  return (SUBCATEGORIES_BY_CATEGORY as Record<string, readonly string[]>)[category] ?? [];
}

export function isValidEventSubcategory(category: string, subcategory: string): boolean {
  const subs = getSubcategoriesForCategory(category);
  return subs.includes(subcategory);
}

// Legacy mapping for backward compatibility (old 11 categories → new 20)
const LEGACY_CATEGORY_MAP: Record<string, EventCategory> = {
  Music: "Music & Concerts",
  Business: "Business & Networking",
  Technology: "Technology",
  Sports: "Sports & Fitness",
  Dating: "Community & Social",
  Education: "Education & Workshops",
  Nightlife: "Entertainment",
  Holidays: "Festivals & Cultural Events",
  "Performing & Visual Arts": "Arts & Creative",
  Charity: "Charity & Fundraising",
  Community: "Community & Social",
};

export function normalizeEventCategory(raw: string | null | undefined): EventCategory | null {
  if (!raw) return null;
  if (isValidEventCategory(raw)) return raw as EventCategory;
  const mapped = LEGACY_CATEGORY_MAP[raw.trim()];
  if (mapped && isValidEventCategory(mapped)) return mapped;
  // Try case-insensitive
  const lower = raw.trim().toLowerCase();
  const found = EVENT_CATEGORIES.find((c) => c.toLowerCase() === lower);
  if (found) return found;
  return null;
}

export function normalizeEventSubcategory(category: string, raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (isValidEventSubcategory(category, raw)) return raw;
  return null;
}

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = Object.fromEntries(
  EVENT_CATEGORIES.map((c) => [c, c])
) as Record<EventCategory, string>;
