import { NextRequest, NextResponse } from "next/server";
import { searchTicketmaster } from "@/lib/external-events";

/**
 * Ticketmaster discovery, exposed as a route for the browser-side caller
 * (components/NearbyEvents.tsx). Server Components must NOT hit this route —
 * they call `searchExternalEvents`/`searchTicketmaster` from lib/external-events
 * directly to avoid an SSR self-fetch. The mapping and caching live in the lib;
 * this handler is a thin adapter over query params.
 *
 * (Named "eventbrite" for historical reasons — the underlying source is
 * Ticketmaster.)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const events = await searchTicketmaster({
    location: searchParams.get("location"),
    query: searchParams.get("q"),
    category: searchParams.get("category"),
    date: searchParams.get("date"),
  });
  return NextResponse.json({ events });
}
