import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

type SyncBody = {
  sourceId?: string;
  syncAll?: boolean;
};

type SourceRow = {
  id: string;
  user_id: string;
  organizer_id: string | null;
  organizer_name: string;
  organizer_url: string;
  organizer_eventbrite_id: string;
  enabled: boolean;
};

type JsonRecord = Record<string, unknown>;

/** Postgres unique_violation — see events_eventbrite_event_id_key (migration_46). */
const UNIQUE_VIOLATION = "23505";

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function text(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function eventTextField(value: unknown) {
  const object = record(value);
  return text(object.text) || stripHtml(text(object.html));
}

function eventImage(event: JsonRecord) {
  const logo = record(event.logo);
  const original = record(logo.original);
  return text(original.url) || text(logo.url);
}

function eventDate(event: JsonRecord) {
  const start = record(event.start);
  return text(start.utc) || text(start.local);
}

function isFutureEvent(event: JsonRecord) {
  const date = eventDate(event);
  if (!date) return true;

  const timestamp = Date.parse(date);
  if (Number.isNaN(timestamp)) return true;

  return timestamp >= Date.now();
}

function eventVenue(event: JsonRecord) {
  const venue = record(event.venue);
  const address = record(venue.address);
  const city = [text(address.city), text(address.region)].filter(Boolean).join(", ");

  return {
    venue: text(venue.name) || text(address.localized_address_display),
    city,
  };
}

function eventOrganizer(event: JsonRecord, source: SourceRow) {
  const organizer = record(event.organizer);
  const description = record(organizer.description);

  return {
    name: source.organizer_name || text(organizer.name),
    url: text(organizer.url) || source.organizer_url,
    description: text(description.text) || stripHtml(text(description.html)),
  };
}

function eventPrice(event: JsonRecord) {
  const ticketAvailability = record(event.ticket_availability);
  const minimum = record(ticketAvailability.minimum_ticket_price);
  const display = text(minimum.display);
  const majorValue = text(minimum.major_value);
  const value = majorValue || display.replace(/[^0-9.]/g, "");

  if (value) return value;
  if (ticketAvailability.is_free === true || event.is_free === true) return "0";
  return "0";
}

async function eventbriteFetch(path: string, token: string) {
  const response = await fetch(`https://www.eventbriteapi.com/v3${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  const payload = (await response.json().catch(() => ({}))) as JsonRecord;

  if (!response.ok) {
    const error = record(payload.error);
    throw new Error(text(error.error_description) || text(payload.error_description) || `Eventbrite API ${response.status}`);
  }

  return payload;
}

async function fetchOrganizerEvents(organizerId: string, token: string) {
  const events: JsonRecord[] = [];
  let continuation = "";

  for (let page = 0; page < 5; page += 1) {
    const params = new URLSearchParams({
      status: "live",
      order_by: "start_asc",
      expand: "venue,organizer,ticket_availability",
    });

    if (continuation) params.set("continuation", continuation);

    const payload = await eventbriteFetch(`/organizers/${organizerId}/events/?${params.toString()}`, token);
    const pageEvents = Array.isArray(payload.events) ? payload.events.map(record) : [];
    events.push(...pageEvents);

    const pagination = record(payload.pagination);
    if (pagination.has_more_items !== true) break;
    continuation = text(pagination.continuation);
    if (!continuation) break;
  }

  return events;
}

async function findOrCreateOrganizer(source: SourceRow, userId: string) {
  const supabase = await createSupabaseServer();

  if (source.organizer_id) return source.organizer_id;

  const { data: existing } = await supabase
    .from("organizers")
    .select("id")
    .eq("user_id", userId)
    .eq("name", source.organizer_name)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: organizer, error } = await supabase
    .from("organizers")
    .insert({
      user_id: userId,
      name: source.organizer_name,
      bio: `Imported from Eventbrite: ${source.organizer_url}`,
      website: source.organizer_url,
    })
    .select("id")
    .single();

  if (error) throw new Error(`${source.organizer_name} organizer: ${error.message}`);
  if (!organizer?.id) throw new Error(`${source.organizer_name} organizer was not created.`);

  await supabase
    .from("eventbrite_sources")
    .update({ organizer_id: organizer.id })
    .eq("id", source.id)
    .eq("user_id", userId);

  return organizer.id as string;
}

async function syncSource(source: SourceRow, userId: string) {
  const token = process.env.EVENTBRITE_PRIVATE_TOKEN;
  if (!token) {
    throw new Error("EVENTBRITE_PRIVATE_TOKEN is not configured.");
  }

  const supabase = await createSupabaseServer();
  const organizerId = await findOrCreateOrganizer(source, userId);
  const eventbriteEvents = await fetchOrganizerEvents(source.organizer_eventbrite_id, token);
  let imported = 0;
  let skipped = 0;

  for (const event of eventbriteEvents) {
    const eventbriteEventId = text(event.id);
    const sourceUrl = text(event.url);
    const title = eventTextField(event.name);

    if (!eventbriteEventId || !sourceUrl || !title || !isFutureEvent(event)) {
      skipped += 1;
      continue;
    }

    const slugBase = slugify(title);
    const slug = `${slugBase}-${eventbriteEventId}`;
    const { venue, city } = eventVenue(event);
    const organizer = eventOrganizer(event, source);
    const description = eventTextField(event.description) || text(event.summary);

    const { data: existing, error: existingError } = await supabase
      .from("events")
      .select("id")
      .eq("eventbrite_event_id", eventbriteEventId)
      .maybeSingle();

    if (existingError) throw new Error(`${title}: ${existingError.message}`);

    if (existing) {
      const { error: updateError } = await supabase
        .from("events")
        .update({
          source_organizer_name: organizer.name,
          source_organizer_url: organizer.url,
          source_organizer_description: organizer.description,
        })
        .eq("id", existing.id);

      if (updateError) throw new Error(`${title}: ${updateError.message}`);

      skipped += 1;
      continue;
    }

    const eventPayload = {
      title,
      slug,
      description,
      category: "Eventbrite",
      venue,
      city,
      banner: eventImage(event),
      event_date: eventDate(event),
      organizer_id: organizerId,
      user_id: userId,
      source_url: sourceUrl,
      eventbrite_event_id: eventbriteEventId,
      source_organizer_name: organizer.name,
      source_organizer_url: organizer.url,
      source_organizer_description: organizer.description,
    };

    const { data: insertedEvent, error: eventError } = await supabase
      .from("events")
      .insert(eventPayload)
      .select()
      .single();

    if (eventError) {
      // Concurrent sync already inserted this event between our check and our
      // insert — treat it as already-synced rather than failing the run.
      if (eventError.code === UNIQUE_VIOLATION) {
        skipped += 1;
        continue;
      }
      throw new Error(`${title}: ${eventError.message}`);
    }
    if (!insertedEvent) throw new Error(`${title}: event was not created.`);

    const { error: ticketError } = await supabase.from("tickets").insert({
      event_id: insertedEvent.id,
      name: "General Admission",
      price: Number(eventPrice(event)),
      quantity: 100,
    });

    if (ticketError) throw new Error(`${title} tickets: ${ticketError.message}`);
    imported += 1;
  }

  const message = `Imported ${imported}. Skipped ${skipped}.`;
  await supabase
    .from("eventbrite_sources")
    .update({
      last_synced_at: new Date().toISOString(),
      last_sync_message: message,
    })
    .eq("id", source.id)
    .eq("user_id", userId);

  return {
    sourceId: source.id,
    sourceName: source.organizer_name,
    imported,
    skipped,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SyncBody;
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "You must be logged in to sync Eventbrite." }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.status === "suspended") {
      return NextResponse.json({ error: "Your account is suspended." }, { status: 403 });
    }

    let query = supabase
      .from("eventbrite_sources")
      .select("*")
      .eq("user_id", user.id)
      .eq("enabled", true);

    if (!body.syncAll) {
      if (!body.sourceId) {
        return NextResponse.json({ error: "sourceId or syncAll is required." }, { status: 400 });
      }
      query = query.eq("id", body.sourceId);
    }

    const { data: sources, error } = await query;
    if (error) throw new Error(error.message);
    if (!sources || sources.length === 0) {
      return NextResponse.json({ error: "No enabled Eventbrite sources found." }, { status: 404 });
    }

    const results = [];
    for (const source of sources as SourceRow[]) {
      results.push(await syncSource(source, user.id));
    }

    const imported = results.reduce((total, result) => total + result.imported, 0);
    const skipped = results.reduce((total, result) => total + result.skipped, 0);

    return NextResponse.json({ imported, skipped, results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Eventbrite sync failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
