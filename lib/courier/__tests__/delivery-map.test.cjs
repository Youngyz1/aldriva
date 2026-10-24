const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const read = (filename) => fs.readFileSync(path.join(ROOT, filename), "utf8");
const map = read("components/delivery/DeliveryMap.tsx");

test("delivery map uses Leaflet, documented TomTom Orbis raster tiles, attribution, and a narrow image-source CSP", () => {
  const config = read("next.config.ts");
  const styles = read("app/globals.css");
  const imageDirective = config.slice(config.indexOf('"img-src"'), config.indexOf('"font-src"'));

  assert.match(map, /import\("leaflet"\)/);
  assert.match(map, /https:\/\/api\.tomtom\.com\/maps\/orbis\/display\/raster\/tile\/\{z\}\/\{x\}\/\{y\}\?apiVersion=2&style=street-light&tileSize=256&key=\$\{encodeURIComponent\(tomtomApiKey\)\}/);
  assert.match(map, /minZoom: 0/);
  assert.match(map, /maxZoom: 22/);
  assert.match(map, /tileSize: 256/);
  assert.match(map, /tomtom\.com\/legal\/en_gb\/product-attributions/);
  assert.match(map, /openstreetmap\.org\/copyright/);
  assert.match(styles, /@import "leaflet\/dist\/leaflet\.css"/);
  assert.ok(imageDirective.includes("https://api.tomtom.com"), "TomTom raster tile host is allowed");
  assert.doesNotMatch(imageDirective, /https:\/\/[^\s",]+\.openstreetmap\.org/);
  assert.doesNotMatch(imageDirective, /https:\/\/\*\.tomtom\.com/);
});

test("missing TomTom key skips tile requests and reports configuration without exposing credentials", () => {
  assert.match(map, /process\.env\.NEXT_PUBLIC_TOMTOM_API_KEY\?\.trim\(\)/);
  assert.match(map, /if \(tomtomApiKey\)/);
  assert.match(map, /setMapFailure\("configuration"\)/);
  assert.match(map, /NEXT_PUBLIC_TOMTOM_API_KEY/);
  assert.match(map, /Map Display API access/);
  assert.match(map, /mapFailure !== "configuration"/);
  assert.doesNotMatch(map, /console\.(?:log|warn|error).*tomtomApiKey/);
});

test("map centers only on validated rider/active-stop data and does not invent a fallback location", () => {
  assert.match(map, /Number\.isFinite\(location\.latitude\)/);
  assert.match(map, /location\.latitude >= -90/);
  assert.match(map, /location\.longitude <= 180/);
  assert.match(map, /journeyStage === "pickup" \? validPickup : validDestination/);
  assert.match(map, /const initialLocation = validCourier \?\? activeStop/);
  assert.match(map, /const initialCenterRef = useRef<LatLng \| null>\(null\)/);
  assert.doesNotMatch(map, /40\.0583|-74\.4057/);
  assert.match(map, /noCoordinates/);
  assert.match(map, /missingStop/);
});

test("fresh GPS updates move the existing rider marker, with pan behavior gated by follow mode", () => {
  assert.match(map, /courierMarkerRef\.current\.setLatLng\(courierPoint\)/);
  assert.match(map, /if \(moved && followingRef\.current\)/);
  assert.match(map, /map\.panTo\(courierPoint/);
  assert.match(map, /map\.on\("dragstart", onMapDragStart\)/);
  assert.match(map, /const onMapDragStart = \(\) => setFollowMode\(false\)/);
  assert.match(map, /map\.setView\(position, Math\.max\(map\.getZoom\(\), 15\)/);
  assert.match(map, /aria-pressed=\{isFollowing\}/);

  const courier = read("components/courier/CourierDashboard.tsx");
  assert.match(courier, /showFollowControls/);
});

test("map tile/import failures are visible and retryable; resize and orientation recalculate Leaflet dimensions", () => {
  assert.match(map, /tiles\.on\("tileerror"/);
  assert.match(map, /setMapState\("unavailable"\)/);
  assert.match(map, /12000/);
  assert.match(map, /\.catch\(\(\) =>/);
  assert.match(map, /role=\{mapState === "unavailable" \? "alert" : "status"\}/);
  assert.match(map, /onClick=\{retryMap\}/);
  assert.match(map, /new ResizeObserver\(invalidateSize\)/);
  assert.match(map, /addEventListener\("orientationchange", invalidateSize\)/);
  assert.match(map, /map\.invalidateSize\(\{ pan: false \}\)/);
});

test("map limits stop pins to the active phase and updates the rider marker from validated GPS", () => {
  assert.match(map, /journeyStage === "pickup" \? validPickup : validDestination/);
  assert.match(map, /courierMarkerRef\.current\.setLatLng\(courierPoint\)/);
  assert.match(map, /accuracy <= 300/);
  assert.match(map, /validCourier\.heading/);
  assert.match(map, /if \(moved && followingRef\.current\)/);
  assert.doesNotMatch(map, /40\.0583|-74\.4057/);
});
