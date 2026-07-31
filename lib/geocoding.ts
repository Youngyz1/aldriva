// Geocoding utilities to convert coordinates to city names
// Uses Nominatim (OpenStreetMap) - free, no API key required

export interface GeocodingResult {
  city: string;
  state: string;
  country: string;
  lat: number;
  lng: number;
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodingResult | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      {
        headers: {
          "User-Agent": "Aldriva/1.0",
        },
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    
    // Extract city from address components
    const address = data.address || {};
    
    // Try different city fields (some responses use city, some town, village, etc.)
    const city = 
      address.city || 
      address.town || 
      address.village || 
      address.municipality || 
      address.county ||
      "";

    const state = address.state || address.region || "";
    const country = address.country || "";

    if (!city) return null;

    return {
      city,
      state,
      country,
      lat,
      lng,
    };
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
}

// Search for a city by name (for autocomplete)
export async function searchCity(query: string): Promise<GeocodingResult[]> {
  if (!query || query.length < 2) return [];

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`,
      {
        headers: {
          "User-Agent": "Aldriva/1.0",
        },
      }
    );

    if (!response.ok) return [];

    const data = await response.json();
    
    return data
      .filter((item: { address: Record<string, string> }) => {
        // Prefer cities, towns, municipalities
        const address = item.address || {};
        return (
          address.city ||
          address.town ||
          address.village ||
          address.municipality
        );
      })
      .map((item: { address: Record<string, string>; lat: string; lon: string; display_name: string }) => ({
        city:
          item.address.city ||
          item.address.town ||
          item.address.village ||
          item.address.municipality ||
          item.display_name.split(",")[0],
        state: item.address.state || item.address.region || "",
        country: item.address.country || "",
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
      }));
  } catch (error) {
    console.error("City search error:", error);
    return [];
  }
}
