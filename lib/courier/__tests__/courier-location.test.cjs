const test = require("node:test");
const assert = require("node:assert/strict");

// 1. Haversine distance unit tests
function haversineDistanceMeters(a, b) {
  const EARTH_RADIUS_METERS = 6371000;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const deltaLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const deltaLon = ((b.longitude - a.longitude) * Math.PI) / 180;

  const sinDeltaLat = Math.sin(deltaLat / 2);
  const sinDeltaLon = Math.sin(deltaLon / 2);

  const inner =
    sinDeltaLat * sinDeltaLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDeltaLon * sinDeltaLon;

  const c = 2 * Math.atan2(Math.sqrt(inner), Math.sqrt(1 - inner));
  return Math.round(EARTH_RADIUS_METERS * c);
}

// 2. Coordinate validation
function validateCoordinates(lat, lng) {
  if (typeof lat !== "number" || Number.isNaN(lat) || lat < -90 || lat > 90) {
    return { valid: false, error: "Invalid latitude." };
  }
  if (typeof lng !== "number" || Number.isNaN(lng) || lng < -180 || lng > 180) {
    return { valid: false, error: "Invalid longitude." };
  }
  return { valid: true };
}

// 3. Timestamp freshness validation
function validateTimestamp(recordedAt, now = Date.now()) {
  const MAX_AGE_MS = 5 * 60 * 1000; // 5 min
  const MAX_FUTURE_MS = 60 * 1000; // 1 min

  const recordedDate = new Date(recordedAt);
  const recordedMs = recordedDate.getTime();
  if (Number.isNaN(recordedMs)) {
    return { valid: false, error: "Invalid date format." };
  }

  if (now - recordedMs > MAX_AGE_MS) {
    return { valid: false, error: "Location timestamp is stale." };
  }
  if (recordedMs - now > MAX_FUTURE_MS) {
    return { valid: false, error: "Location timestamp is in the future." };
  }
  return { valid: true };
}

// 4. Ingestion throttling check
function shouldThrottle(prevLoc, newLoc, recordedAt, prevRecordedAt) {
  const MIN_INTERVAL_SECONDS = 4;
  const MIN_DISTANCE_METERS = 10;

  const seconds = (new Date(recordedAt).getTime() - new Date(prevRecordedAt).getTime()) / 1000;
  if (seconds < MIN_INTERVAL_SECONDS) {
    const dist = haversineDistanceMeters(prevLoc, newLoc);
    if (dist < MIN_DISTANCE_METERS) {
      return true; // Throttle
    }
  }
  return false;
}

// 5. Customer Privacy Guard
function canCustomerSeeCourierCoordinates(orderStatus) {
  return orderStatus === "out_for_delivery";
}

// 6. Staleness threshold
function isLocationStale(recordedAt, now = Date.now()) {
  const STALE_THRESHOLD_MS = 3 * 60 * 1000; // 3 min
  return now - new Date(recordedAt).getTime() > STALE_THRESHOLD_MS;
}

test("Courier Location: haversine calculates distance accurately", () => {
  // Dakar point A to point B (~1.5 km)
  const pointA = { latitude: 14.6928, longitude: -17.4467 };
  const pointB = { latitude: 14.7042, longitude: -17.4521 };

  const distance = haversineDistanceMeters(pointA, pointB);
  assert.ok(distance > 1300 && distance < 1600, `Expected ~1.4km, got ${distance}`);

  // Same point distance should be 0
  const same = haversineDistanceMeters(pointA, pointA);
  assert.equal(same, 0);
});

test("Courier Location: coordinate validation enforces valid GPS bounds", () => {
  assert.equal(validateCoordinates(14.69, -17.44).valid, true);
  assert.equal(validateCoordinates(0, 0).valid, true);
  assert.equal(validateCoordinates(-90, -180).valid, true);
  assert.equal(validateCoordinates(90, 180).valid, true);

  // Out of bounds
  assert.equal(validateCoordinates(91, 0).valid, false);
  assert.equal(validateCoordinates(-90.1, 0).valid, false);
  assert.equal(validateCoordinates(0, 180.1).valid, false);
  assert.equal(validateCoordinates(0, -181).valid, false);

  // NaN and non-numbers
  assert.equal(validateCoordinates(NaN, 0).valid, false);
  assert.equal(validateCoordinates(0, NaN).valid, false);
  assert.equal(validateCoordinates("14.69", -17.44).valid, false);
  assert.equal(validateCoordinates(null, undefined).valid, false);
});

test("Courier Location: timestamp freshness checks", () => {
  const now = 1700000000000;

  // Fresh: 10 seconds ago
  assert.equal(validateTimestamp(now - 10000, now).valid, true);

  // Stale: 6 minutes ago (> 5m)
  const stale = validateTimestamp(now - 6 * 60 * 1000, now);
  assert.equal(stale.valid, false);
  assert.equal(stale.error, "Location timestamp is stale.");

  // Future spoof: 2 minutes in the future (> 1m)
  const future = validateTimestamp(now + 2 * 60 * 1000, now);
  assert.equal(future.valid, false);
  assert.equal(future.error, "Location timestamp is in the future.");

  // Slight clock skew acceptable: 30s in the future
  assert.equal(validateTimestamp(now + 30000, now).valid, true);
});

test("Courier Location: server-side write throttling", () => {
  const loc1 = { latitude: 14.6928, longitude: -17.4467 };
  const time1 = "2026-10-22T20:00:00.000Z";

  // Identical location 2 seconds later -> throttle!
  const loc2 = { latitude: 14.6928, longitude: -17.4467 };
  const time2 = "2026-10-22T20:00:02.000Z";
  assert.equal(shouldThrottle(loc1, loc2, time2, time1), true);

  // Small drift (3 meters) 2 seconds later -> throttle!
  const loc3 = { latitude: 14.69282, longitude: -17.44672 };
  assert.equal(shouldThrottle(loc1, loc3, time2, time1), true);

  // Significant move (50 meters) 2 seconds later -> allow!
  const loc4 = { latitude: 14.6932, longitude: -17.4467 };
  assert.equal(shouldThrottle(loc1, loc4, time2, time1), false);

  // Identical location but 6 seconds later (> 4s interval) -> allow!
  const time3 = "2026-10-22T20:00:06.000Z";
  assert.equal(shouldThrottle(loc1, loc2, time3, time1), false);
});

test("Courier Location: customer privacy gate strictly withholds coordinates until transit", () => {
  // Before dispatch: ready / picked_up
  assert.equal(canCustomerSeeCourierCoordinates("pending"), false);
  assert.equal(canCustomerSeeCourierCoordinates("accepted"), false);
  assert.equal(canCustomerSeeCourierCoordinates("preparing"), false);
  assert.equal(canCustomerSeeCourierCoordinates("ready"), false);
  assert.equal(canCustomerSeeCourierCoordinates("picked_up"), false);

  // During active transit: out_for_delivery
  assert.equal(canCustomerSeeCourierCoordinates("out_for_delivery"), true);

  // After completion / terminal
  assert.equal(canCustomerSeeCourierCoordinates("delivered"), false);
  assert.equal(canCustomerSeeCourierCoordinates("completed"), false);
  assert.equal(canCustomerSeeCourierCoordinates("cancelled"), false);
});

test("Courier Location: staleness detection flags location after 3 minutes", () => {
  const now = 1700000000000;

  // 1 minute ago -> fresh
  assert.equal(isLocationStale(now - 60000, now), false);

  // 2.5 minutes ago -> fresh
  assert.equal(isLocationStale(now - 150000, now), false);

  // 3.5 minutes ago -> stale
  assert.equal(isLocationStale(now - 210000, now), true);

  // 10 minutes ago -> stale
  assert.equal(isLocationStale(now - 600000, now), true);
});
