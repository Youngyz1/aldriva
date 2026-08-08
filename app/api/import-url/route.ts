import { NextRequest, NextResponse } from "next/server";
import { normalizeImageUrl } from "@/lib/image-url";
import { safeFetchHtml, SsrfBlockedError } from "@/lib/ssrf-guard";
import { enforceRateLimit } from "@/lib/rate-limit";

type ImportMode = "events" | "fundraisers";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type JsonObject = { [key: string]: JsonValue };

function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function getMeta(html: string, key: string) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${key}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${key}["'][^>]*>`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }

  return "";
}

function getTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? decodeHtml(stripHtml(match[1])) : "";
}

function getFirstDatetime(html: string) {
  const match = html.match(/<time[^>]+datetime=["']([^"']+)["'][^>]*>/i);
  return match?.[1] ? decodeHtml(match[1]) : "";
}

function absoluteUrl(value: string, baseUrl: URL) {
  if (!value) return "";

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function findJsonLd(html: string) {
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
  const parsed: JsonObject[] = [];

  function addObjects(value: JsonValue) {
    if (Array.isArray(value)) {
      value.forEach(addObjects);
      return;
    }

    if (!value || typeof value !== "object") return;

    const graph = value["@graph"];
    if (Array.isArray(graph)) graph.forEach(addObjects);
    parsed.push(value);
  }

  for (const script of scripts) {
    const json = script
      .replace(/<script[^>]*>/i, "")
      .replace(/<\/script>/i, "")
      .trim();

    try {
      const value = JSON.parse(json) as JsonValue;
      addObjects(value);
    } catch {
      // Ignore malformed JSON-LD blocks from third-party pages.
    }
  }

  return parsed;
}

function jsonString(value: JsonValue | undefined) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function jsonObject(value: JsonValue | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function jsonArray(value: JsonValue | undefined) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function thingName(value: JsonValue | undefined) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return thingName(value[0]);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return jsonString(value.name);
  }
  return "";
}

function thingUrl(value: JsonValue | undefined) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return thingUrl(value[0]);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return jsonString(value.url);
  }
  return "";
}

function thingDescription(value: JsonValue | undefined) {
  if (Array.isArray(value)) return thingDescription(value[0]);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return stripHtml(jsonString(value.description));
  }
  return "";
}

function firstImage(value: JsonValue | undefined) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && !Array.isArray(first)) {
      return jsonString(first.url);
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return jsonString(value.url);
  }
  return "";
}

function locationParts(location: JsonValue | undefined) {
  if (!location || typeof location !== "object" || Array.isArray(location)) {
    return { venue: "", city: "" };
  }

  const name = jsonString(location.name);
  const address = location.address;

  if (!address || typeof address !== "object" || Array.isArray(address)) {
    return { venue: name, city: "" };
  }

  const streetAddress = jsonString(address.streetAddress);
  const locality = jsonString(address.addressLocality);
  const region = jsonString(address.addressRegion);
  const country = thingName(address.addressCountry);
  const city = [locality, region].filter(Boolean).join(", ") || country;

  return {
    venue: name || streetAddress || jsonString(address.name),
    city,
  };
}

function isType(item: JsonObject, expected: string) {
  const type = item["@type"];
  if (typeof type === "string") return type.toLowerCase().includes(expected);
  if (Array.isArray(type)) {
    return type.some((entry) => typeof entry === "string" && entry.toLowerCase().includes(expected));
  }
  return false;
}

function normalizePrice(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/free/i.test(trimmed)) return "0";

  const match = trimmed.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return match?.[0] ?? "";
}

function collectOffers(value: JsonValue | undefined): JsonObject[] {
  return jsonArray(value).flatMap((offer) => {
    const object = jsonObject(offer);
    if (!object) return [];
    return [object, ...collectOffers(object.offers)];
  });
}

function getOfferDetails(item: JsonObject | undefined) {
  const offers = collectOffers(item?.offers);

  for (const offer of offers) {
    const priceSpecification = jsonObject(offer.priceSpecification);
    const rawPrice =
      jsonString(offer.price) ||
      jsonString(offer.lowPrice) ||
      jsonString(priceSpecification?.price) ||
      jsonString(priceSpecification?.minPrice);
    const price = normalizePrice(rawPrice);

    if (price) {
      return {
        name: thingName(offer.name) || thingName(offer.category) || "General Admission",
        price,
      };
    }
  }

  return { name: "General Admission", price: "0" };
}

function categoryName(item: JsonObject | undefined) {
  const keywords = jsonArray(item?.keywords)
    .map((keyword) => jsonString(keyword))
    .filter(Boolean);

  return (
    thingName(item?.eventType) ||
    thingName(item?.genre) ||
    thingName(item?.category) ||
    keywords[0] ||
    "General"
  );
}

function getFaqText(items: JsonObject[]) {
  const faq = items.find((item) => isType(item, "faqpage"));
  const questions = jsonArray(faq?.mainEntity)
    .map((entry) => jsonObject(entry))
    .filter((entry): entry is JsonObject => !!entry)
    .map((question) => {
      const answer = jsonObject(question.acceptedAnswer);
      return {
        name: stripHtml(jsonString(question.name)),
        text: stripHtml(jsonString(answer?.text)),
      };
    })
    .filter((entry) => entry.name && entry.text);

  if (questions.length === 0) return "";

  return questions.map((entry) => `Q: ${entry.name}\nA: ${entry.text}`).join("\n\n");
}

function buildDescription(item: JsonObject | undefined, html: string, items: JsonObject[]) {
  const main =
    stripHtml(jsonString(item?.description)) ||
    getMeta(html, "og:description") ||
    getMeta(html, "description");
  const faq = getFaqText(items);

  return [main, faq].filter(Boolean).join("\n\n");
}

function sourceOrganizer(item: JsonObject | undefined) {
  const organizer = item?.organizer || item?.performer || item?.author;

  return {
    name: thingName(organizer),
    url: thingUrl(organizer),
    description: thingDescription(organizer),
  };
}

export async function POST(req: NextRequest) {
  try {
    // Before the outbound fetch, so flooding this endpoint cannot be used for
    // amplification or to run up egress regardless of how well the destination
    // is validated.
    const limited = await enforceRateLimit("importUrl", req);
    if (limited) return limited;

    const { url, mode } = (await req.json()) as { url?: string; mode?: ImportMode };

    if (!url || !mode) {
      return NextResponse.json({ error: "URL and mode are required." }, { status: 400 });
    }

    // safeFetchHtml resolves the hostname and rejects loopback, RFC1918,
    // link-local (incl. 169.254.169.254 cloud metadata), CGNAT, multicast and
    // IPv6 ULA/link-local destinations BEFORE connecting, then re-validates
    // every redirect hop, and caps body size and duration.
    // https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
    let fetched;
    try {
      fetched = await safeFetchHtml(url);
    } catch (err) {
      if (err instanceof SsrfBlockedError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }

    // Relative URLs in the page resolve against the FINAL url, not the one the
    // caller supplied — otherwise a redirect could be used to make a relative
    // path resolve somewhere unintended.
    const parsedUrl = new URL(fetched.finalUrl);
    const html = fetched.body;
    const items = findJsonLd(html);
    const eventItem = items.find((item) => isType(item, "event"));
    const fundraiserItem = items.find((item) => isType(item, "fundraiser") || isType(item, "donate"));
    const selected = mode === "events" ? eventItem : fundraiserItem;

    const title =
      jsonString(selected?.name) ||
      getMeta(html, "og:title") ||
      getMeta(html, "twitter:title") ||
      getTitle(html);

    const description = buildDescription(selected, html, items);

    const rawImage = absoluteUrl(
      firstImage(selected?.image) || getMeta(html, "og:image") || getMeta(html, "twitter:image"),
      parsedUrl
    );
    // Sanitise scraped image URL — og:image tags sometimes point to HTML viewer
    // pages (Google imgres, Bing, Pinterest) rather than actual images.
    const image = normalizeImageUrl(rawImage, "");
    const { venue, city } = locationParts(selected?.location);
    const eventDate =
      jsonString(selected?.startDate) ||
      jsonString(selected?.doorTime) ||
      getMeta(html, "event:start_time") ||
      getMeta(html, "article:published_time") ||
      getFirstDatetime(html);
    const offer = getOfferDetails(selected);
    const organizer = sourceOrganizer(selected);

    if (mode === "events") {
      return NextResponse.json({
        data: {
          title,
          description,
          category: categoryName(selected),
          event_date: eventDate,
          venue,
          city,
          banner: image,
          ticket1_name: offer.name,
          ticket1_price: offer.price,
          ticket2_name: "",
          ticket2_price: "",
          source_organizer_name: organizer.name,
          source_organizer_url: organizer.url,
          source_organizer_description: organizer.description,
          source_url: parsedUrl.toString(),
        },
      });
    }

    return NextResponse.json({
      data: {
        title,
        story: description,
        goal: "",
        organizer: organizer.name,
        banner: image,
        video_url: "",
        source_url: parsedUrl.toString(),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Could not import this URL.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
