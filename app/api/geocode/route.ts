import { NextRequest, NextResponse } from "next/server";

// Nominatim API (OpenStreetMap) - free, no API key required
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  // Reverse geocode: coordinates -> city name
  if (lat && lng) {
    try {
      const response = await fetch(
        `${NOMINATIM_BASE}/reverse?lat=${lat}&lon=${lng}&format=json`,
        {
          headers: {
            "User-Agent": "Aldriva/1.0",
            "Accept-Language": "en",
          },
        }
      );

      if (!response.ok) {
        return NextResponse.json({ error: "Geocoding failed" }, { status: 500 });
      }

      const data = await response.json();
      const address = data.address || {};

      // Extract city from various possible fields
      const city =
        address.city ||
        address.town ||
        address.village ||
        address.municipality ||
        address.county ||
        "";

      if (!city) {
        return NextResponse.json({ error: "Could not determine city" }, { status: 404 });
      }

      return NextResponse.json({
        city,
        state: address.state || address.region || "",
        country: address.country || "",
        lat: parseFloat(lat),
        lng: parseFloat(lng),
      });
    } catch (error) {
      console.error("Reverse geocode error:", error);
      return NextResponse.json({ error: "Geocoding failed" }, { status: 500 });
    }
  }

  // Forward geocode: city name -> coordinates
  if (query) {
    try {
      const response = await fetch(
        `${NOMINATIM_BASE}/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`,
        {
          headers: {
            "User-Agent": "Aldriva/1.0",
            "Accept-Language": "en",
          },
        }
      );

      if (!response.ok) {
        return NextResponse.json({ error: "Search failed" }, { status: 500 });
      }

      const data = await response.json();

      // Filter for cities/towns
      const cities = data
        .filter((item: { address: Record<string, string>; display_name?: string }) => {
          const addr = item.address || {};
          return (
            addr.city ||
            addr.town ||
            addr.village ||
            addr.municipality
          );
        })
        .map((item: { address: Record<string, string>; lat: string; lon: string; display_name?: string }) => ({
          city:
            item.address.city ||
            item.address.town ||
            item.address.village ||
            item.address.municipality ||
            (item.display_name?.split(",")[0] || ""),
          state: item.address.state || item.address.region || "",
          country: item.address.country || "",
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
        }));

      return NextResponse.json(cities);
    } catch (error) {
      console.error("City search error:", error);
      return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
}
