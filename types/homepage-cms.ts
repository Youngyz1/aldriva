export interface HomepageCmsCategory {
  id: string;
  name: string;
  icon: string;
  position: number;
  is_visible: boolean;
}

export interface HomepageCmsItem {
  id: string;
  title: string;
  slug: string;
  is_homepage_featured: boolean;
  homepage_position: number;
  event_date?: string;
  city?: string;
  goal?: number;
  raised?: number;
}

export interface HomepageTestimonial {
  id: string;
  name: string;
  role: string;
  photo_url: string;
  quote: string;
  position: number;
  is_visible: boolean;
}

export interface HomepageSponsor {
  id: string;
  name: string;
  logo_url: string;
  website_url: string;
  position: number;
  is_visible: boolean;
}

export type PublicTestimonial = Pick<
  HomepageTestimonial,
  "id" | "name" | "role" | "photo_url" | "quote" | "position"
>;

export type PublicSponsor = Pick<
  HomepageSponsor,
  "id" | "name" | "logo_url" | "website_url" | "position"
>;
