export type CuratedDestination = { name: string; image: string; alt: string };

/**
 * Cities need a real, recognizable landmark image. The original 3 are
 * re-hosted on Supabase (event-banners/destinations); the rest link directly
 * to verified Wikimedia Commons originals (upload.wikimedia.org, allowlisted
 * in next.config.ts) since re-hosting requires a manual Supabase Storage
 * upload this tooling can't perform. Several of these cities (LA, Chicago,
 * Miami, Atlanta, Houston, Boston, Las Vegas, Nashville, Denver, Seattle)
 * have no local Aldriva events yet — they rely entirely on the live
 * external blend to show anything real.
 *
 * To add a city: append here with a real, recognizable photo. Do not add
 * cities without a recognizable photo — small towns without one fail the bar.
 *
 * Shared by TopDestinations (renders the tiles) and lib/resolve-city-slug.ts
 * (resolves an /events/city/[citySlug] URL back to the exact city name).
 */
export const CURATED_DESTINATIONS: CuratedDestination[] = [
  {
    name: "New York",
    image:
      "https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/event-banners/destinations/new-york.jpg",
    alt: "Lower Manhattan skyline",
  },
  {
    name: "Montclair",
    image:
      "https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/event-banners/destinations/montclair.jpg",
    alt: "Montclair Art Museum",
  },
  {
    name: "Pittsburgh",
    image:
      "https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/event-banners/destinations/pittsburgh.jpg",
    alt: "Pittsburgh skyline from the Duquesne Incline",
  },
  {
    name: "Los Angeles",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Hollywood_sign_%288485145044%29.jpg/1280px-Hollywood_sign_%288485145044%29.jpg",
    alt: "The Hollywood Sign",
  },
  {
    name: "Chicago",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/e/eb/Chicago_from_under_the_Cloud_Gate_%289694666470%29.jpg",
    alt: "Chicago skyline reflected in Cloud Gate, Millennium Park",
  },
  {
    name: "Miami",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Ocean_drive_day_2009j.JPG/1280px-Ocean_drive_day_2009j.JPG",
    alt: "Ocean Drive, South Beach",
  },
  {
    name: "Atlanta",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/e/ed/AtL_Midtown_Downtown_2026.jpg",
    alt: "Atlanta Midtown and Downtown skyline",
  },
  {
    name: "Houston",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Downtown_Houston%2C_TX_Skyline_-_2018.jpg/1280px-Downtown_Houston%2C_TX_Skyline_-_2018.jpg",
    alt: "Downtown Houston skyline",
  },
  {
    name: "Boston",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Boston_Back_Bay_skyline_by_Chris_Rycroft.jpg/1280px-Boston_Back_Bay_skyline_by_Chris_Rycroft.jpg",
    alt: "Boston's Back Bay skyline",
  },
  {
    name: "Las Vegas",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/e/ee/Las_Vegas_Strip_09_2017_4897.jpg",
    alt: "The Las Vegas Strip",
  },
  {
    name: "Nashville",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Nashville%2C_TN_skyline.jpg/1280px-Nashville%2C_TN_skyline.jpg",
    alt: "Nashville skyline",
  },
  {
    name: "Denver",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Denver%2C_Colorado_skyline_%28cropped%29.jpg/1280px-Denver%2C_Colorado_skyline_%28cropped%29.jpg",
    alt: "Denver skyline with the Rocky Mountains",
  },
  {
    name: "Seattle",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/2/23/Space_Needle_2011-07-04.jpg",
    alt: "The Space Needle",
  },
];
