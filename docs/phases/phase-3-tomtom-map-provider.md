# Phase 3 Follow-up — TomTom Delivery Map Provider

**Status:** The map-provider change is part of the staging-branch work. Vercel deployment and authenticated browser verification of tiles and live rider updates remain pending.

## Implementation

- Kept Leaflet and switched the shared delivery map to TomTom's documented Orbis v2 raster XYZ endpoint: `https://api.tomtom.com/maps/orbis/display/raster/tile/{z}/{x}/{y}?apiVersion=2&style=street-light&tileSize=256&key=…`.
- The browser key is read from `NEXT_PUBLIC_TOMTOM_API_KEY`; the key value is not logged or stored in source. `.env.local` is not part of this change.
- Configured 256px tiles, zoom levels 0–22, and TomTom/OpenStreetMap attribution. CSP adds only `https://api.tomtom.com` to `img-src` while retaining existing sources and same-origin geolocation permission.
- Missing key, Leaflet initialization failure, and tile request failure have distinct visible states; retry is available for recoverable failures.
- The shared map retains validated-coordinate initialization, rider marker updates, follow/recenter controls, resize invalidation, and pickup/delivery active-stop selection. No fallback coordinates, routing, geocoding, ETA, or GPS data changes were introduced.

## Local verification

- Focused map, GPS, and courier tests: 32 passed, 0 failed.
- Focused ESLint on the map component, courier map caller, configuration, and map regression test: passed with no diagnostics.
- `git diff --check`: passed.
- No authenticated browser session was available for a deployed map. No TomTom tile request or image response was verified; source tests do not establish account access or successful real-world rendering.

## Staging acceptance

After deployment, sign in to a courier/order-tracking view with real GPS data. Confirm TomTom tile requests return image content without CSP or HTTP errors, the rider marker moves, follow can be paused/re-enabled and recentered, and resizing preserves the map. Verify the TomTom key is restricted to the staging domain and Maps Display API in the TomTom account. Check the account's included usage before broad production use.
