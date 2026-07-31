/**
 * app/admin/homepage/page.tsx
 * Admin tool for managing landing page components via Homepage CMS.
 */

import { createSupabaseServer } from "@/lib/supabase-server";
import {
  HOMEPAGE_SETTING_KEYS,
  getHomepageSettings,
} from "@/lib/homepage-hero";
import type {
  HomepageCmsCategory,
  HomepageCmsItem,
  HomepageSponsor,
  HomepageTestimonial,
} from "@/types/homepage-cms";
import HomepageCmsTabs from "./HomepageCmsTabs";

export const metadata = {
  title: "Homepage CMS | Admin",
};

export default async function AdminHomepagePage() {
  const supabase = await createSupabaseServer();
  let migrationMissing = false;

  // 1. Fetch platform settings
  let settingsRows: { key: string; value: string | null }[] = [];
  try {
    const { data } = await supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", HOMEPAGE_SETTING_KEYS);
    settingsRows = data ?? [];
  } catch (err) {
    console.error("Failed to load settings:", err);
  }

  // 2. Fetch featured events (safe query, handle missing position column)
  let featuredEvents: HomepageCmsItem[] = [];
  try {
    const { data, error } = await supabase
      .from("events")
      .select("id, title, slug, is_homepage_featured, homepage_position, event_date, city")
      .eq("is_homepage_featured", true)
      .order("homepage_position", { ascending: true });

    if (error) {
      if (error.message.includes("homepage_position") || error.message.includes("is_homepage_featured")) {
        migrationMissing = true;
        featuredEvents = [];
      } else {
        throw error;
      }
    } else {
      featuredEvents = (data ?? []) as HomepageCmsItem[];
    }
  } catch (err) {
    console.error("Failed to load featured events:", err);
  }

  // 3. Fetch featured fundraisers (safe query)
  let featuredFundraisers: HomepageCmsItem[] = [];
  try {
    const { data, error } = await supabase
      .from("fundraisers")
      .select("id, title, slug, is_homepage_featured, homepage_position, goal, raised")
      .eq("is_homepage_featured", true)
      .order("homepage_position", { ascending: true });

    if (error) {
      if (error.message.includes("homepage_position") || error.message.includes("is_homepage_featured")) {
        migrationMissing = true;
        featuredFundraisers = [];
      } else {
        throw error;
      }
    } else {
      featuredFundraisers = (data ?? []) as HomepageCmsItem[];
    }
  } catch (err) {
    console.error("Failed to load featured fundraisers:", err);
  }

  // 4. Fetch homepage categories (gracefully handle table missing)
  let categories: HomepageCmsCategory[] = [];
  try {
    const { data, error } = await supabase
      .from("homepage_categories")
      .select("*")
      .order("position", { ascending: true });

    if (error) {
      migrationMissing = true;
    } else {
      categories = (data ?? []) as HomepageCmsCategory[];
    }
  } catch (err) {
    migrationMissing = true;
    console.error("Failed to load homepage categories:", err);
  }

  // 5. Fetch testimonials
  let testimonials: HomepageTestimonial[] = [];
  try {
    const { data, error } = await supabase
      .from("homepage_testimonials")
      .select("*")
      .order("position", { ascending: true });

    if (error) {
      migrationMissing = true;
    } else {
      testimonials = (data ?? []) as HomepageTestimonial[];
    }
  } catch (err) {
    migrationMissing = true;
    console.error("Failed to load homepage testimonials:", err);
  }

  // 6. Fetch sponsors
  let sponsors: HomepageSponsor[] = [];
  try {
    const { data, error } = await supabase
      .from("homepage_sponsors")
      .select("*")
      .order("position", { ascending: true });

    if (error) {
      migrationMissing = true;
    } else {
      sponsors = (data ?? []) as HomepageSponsor[];
    }
  } catch (err) {
    migrationMissing = true;
    console.error("Failed to load homepage sponsors:", err);
  }

  return (
    <div className="pb-16">
      <HomepageCmsTabs
        initialSettings={getHomepageSettings(settingsRows)}
        initialEvents={featuredEvents}
        initialFundraisers={featuredFundraisers}
        initialCategories={categories}
        initialTestimonials={testimonials}
        initialSponsors={sponsors}
        migrationMissing={migrationMissing}
      />
    </div>
  );
}
