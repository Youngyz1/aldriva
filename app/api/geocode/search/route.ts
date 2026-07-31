import { NextRequest, NextResponse } from "next/server";

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";

type NominatimAddress = Record<string, string | undefined>;

type NominatimSearchResult = {
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: NominatimAddress;
};

function cityFromAddress(address: NominatimAddress) {
  return (
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.suburb ||
    address.county ||
    ""
  );
}

function regionFromAddress(address: NominatimAddress) {
  return address.state || address.region || address.province || address.state_district || "";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const nominatimUrl = new URL(NOMINATIM_SEARCH_URL);
  nominatimUrl.searchParams.set("q", query);
  nominatimUrl.searchParams.set("format", "json");
  nominatimUrl.searchParams.set("addressdetails", "1");
  nominatimUrl.searchParams.set("limit", "5");

  try {
    const response = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": "Aldriva/1.0",
        "Accept-Language": "en",
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Address search failed." }, { status: 502 });
    }

    const data = (await response.json()) as NominatimSearchResult[];
    const results = data
      .filter((item) => item.display_name && item.lat && item.lon)
      .map((item) => {
        const address = item.address || {};

        return {
          displayName: item.display_name || "",
          lat: Number(item.lat),
          lng: Number(item.lon),
          city: cityFromAddress(address),
          region: regionFromAddress(address),
          country: address.country || "",
          address: {
            houseNumber: address.house_number || "",
            road: address.road || address.pedestrian || address.footway || "",
            suburb: address.suburb || address.neighbourhood || "",
            city: cityFromAddress(address),
            region: regionFromAddress(address),
            postcode: address.postcode || "",
            country: address.country || "",
            countryCode: address.country_code || "",
          },
        };
      });

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Address search error:", error);
    return NextResponse.json({ error: "Address search failed." }, { status: 500 });
  }
}
