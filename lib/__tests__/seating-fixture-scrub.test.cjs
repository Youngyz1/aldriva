/**
 * lib/__tests__/seating-fixture-scrub.test.cjs
 *
 * Tests the exporter scrubber with SYNTHETIC data only (never touches a DB).
 * The live export itself is owner-run: node scripts/export-seating-fixture.cjs
 */

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ASSIGNED_PLACEHOLDER,
  scrubSeat,
  scrubVenueObject,
  scrubLayout,
  effectivePrice,
  postScrubCheck,
} = require("../../scripts/export-seating-fixture.cjs");

test("seat scrubber copies the allowlist and drops the rest", () => {
  const dropped = new Set();
  const out = scrubSeat(
    {
      id: "s1",
      section: "Orchestra",
      row_label: "A",
      seat_number: 1,
      status: "available",
      is_vip: true,
      is_accessible: false,
      x: 1,
      y: 2,
      width: 26,
      height: 26,
      buyer_email: "someone@example.com",
      buyer_name: "Buyer",
      phone: "+15550102030",
      order_id: "o1",
      stripe_payment_intent_id: "pi_1",
      surprise_col: 1,
    },
    dropped
  );
  assert.equal(out.section, "Orchestra");
  assert.equal(out.is_vip, true);
  assert.ok(!("buyer_email" in out));
  assert.ok(!("buyer_name" in out));
  assert.ok(!("phone" in out));
  assert.ok(!("order_id" in out));
  assert.ok(!("stripe_payment_intent_id" in out));
  assert.ok(!("surprise_col" in out));
  assert.deepEqual(
    [...dropped].sort(),
    ["buyer_email", "buyer_name", "order_id", "phone", "stripe_payment_intent_id", "surprise_col"].sort()
  );
});

test("invitation assignment becomes the fixed placeholder, null stays null", () => {
  const held = scrubSeat({ id: "h", assigned_invitation_id: "real-inv-id" }, new Set());
  assert.equal(held.assigned_invitation_id, ASSIGNED_PLACEHOLDER);
  const free = scrubSeat({ id: "f", assigned_invitation_id: null }, new Set());
  assert.equal(free.assigned_invitation_id, null);
});

test("layout + object scrubbers keep organizer display fields only", () => {
  const dropped = new Set();
  const out = scrubLayout(
    {
      id: "l1",
      event_id: "e1",
      name: "Hall",
      canvas_width: 1200,
      canvas_height: 800,
      version: 1,
      is_published: true,
      published_at: null,
      sections: [{ name: "Orchestra" }],
      venue_objects: [
        {
          id: "t1",
          type: "table",
          name: "Gold 1",
          x: 1,
          y: 2,
          width: 100,
          height: 100,
          table_number: "1",
          table_name: "Gold 1",
          table_capacity: 8,
          table_shape: "round",
          owner_user_id: "u1",
          guest_list: ["a"],
        },
      ],
      user_id: "u9",
    },
    dropped
  );
  assert.equal(out.name, "Hall");
  assert.equal(out.venue_objects[0].table_number, "1");
  assert.deepEqual(scrubVenueObject({ id: "t9", type: "stage", x: 0, y: 0, width: 1, height: 1, rogue: 1 }, new Set()), {
    id: "t9",
    type: "stage",
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
  assert.ok(!("user_id" in out));
  assert.ok(!("owner_user_id" in out.venue_objects[0]));
  assert.ok(!("guest_list" in out.venue_objects[0]));
  assert.ok(dropped.has("user_id"));
});

test("effective price follows override > tier > section > fallback", () => {
  const tiers = [{ id: "t1", price: 30 }];
  const sections = [{ name: "S", default_price: 20 }];
  assert.equal(
    effectivePrice({ price_override: 50, section: "S", ticket_type_id: "t1" }, sections, tiers, 5),
    50
  );
  assert.equal(
    effectivePrice({ price_override: null, section: "S", ticket_type_id: "t1" }, sections, tiers, 5),
    30
  );
  assert.equal(
    effectivePrice({ price_override: null, section: "S", ticket_type_id: null }, sections, tiers, 5),
    20
  );
  assert.equal(
    effectivePrice({ price_override: null, section: "Z", ticket_type_id: null }, sections, tiers, 5),
    5
  );
});

test("post-scrub scan catches PII but allows organizer display names", () => {
  const bad = postScrubCheck({ seats: [{ buyer_email: "a@b.com" }] });
  assert.ok(bad.some((f) => f.includes("buyer_email")));
  const phone = postScrubCheck({ x: "+1 (555) 010-2030" });
  assert.ok(phone.some((f) => f.includes("phone-like")));
  const okNames = postScrubCheck({
    label: "Guest Balcony",
    table_name: "Gold Guest Table",
    name: "Customer Appreciation Gala",
  });
  // "Customer…" is under .name → allowlisted path, but "Guest…"/table_name
  // are also allowlisted; the scan must be silent here.
  assert.deepEqual(okNames, []);
});

test("ISO-8601 timestamps pass the phone check (published_at, reserved_until)", () => {
  assert.deepEqual(
    postScrubCheck({
      published_at: "2026-10-14T01:12:00.000Z",
      reserved_until: "2026-10-14T01:12:00+00:00",
    }),
    []
  );
  // A timestamp WITHOUT a zone is not a full ISO match → stays checked.
  assert.ok(
    postScrubCheck({ t: "2026-10-14T01:12:00" }).some((f) => f.includes("phone-like"))
  );
  // Offset without colon is also valid ISO-8601.
  assert.deepEqual(postScrubCheck({ t: "2026-10-14T01:12:00.5+0000" }), []);
});

test("a real-looking phone number in a name field still FAILS", () => {
  const findings = postScrubCheck({ name: "Hall +1 (555) 010-2030" });
  assert.ok(findings.some((f) => f.includes("phone-like")), JSON.stringify(findings));
});

test("timestamp-shaped strings with trailing junk and digits still fail", () => {  const junk = postScrubCheck({ note: "2026-10-14T01:12:00Z room 1234567" });
  assert.ok(junk.some((f) => f.includes("phone-like")), JSON.stringify(junk));
  const bang = postScrubCheck({ note: "2026-10-14T01:12:00Z!" });
  // No full ISO match → the date fragment itself trips the digit-run check.
  assert.ok(bang.some((f) => f.includes("phone-like")), JSON.stringify(bang));
});

test("generated object ids pass at id paths (UUID or letter-prefixed)", () => {
  assert.deepEqual(
    postScrubCheck({
      venue_objects: [
        { id: "stage-1728912345678" },
        { id: "33333333-3333-4333-8333-333333333333" },
      ],
    }),
    []
  );
});

test("pure-digit ids still FAIL at the same id path", () => {
  const findings = postScrubCheck({ venue_objects: [{ id: "5550102030" }] });
  assert.ok(findings.some((f) => f.includes("phone-like")), JSON.stringify(findings));
});

test("letter-prefixed digit ids still FAIL at non-id paths", () => {
  const findings = postScrubCheck({ venue_objects: [{ label: "stage-1728912345678" }] });
  assert.ok(findings.some((f) => f.includes("phone-like")), JSON.stringify(findings));
});

test("flagged output is masked: path plus shape, no original digits", () => {
  const findings = postScrubCheck({ venue_objects: [{ id: "5550102030" }] });
  assert.equal(findings.length, 1);
  const [line] = findings;
  assert.ok(line.startsWith("venue_objects[0].id:"), line);
  const shape = line.slice(line.indexOf("[shape: ") + "[shape: ".length, -1);
  assert.ok(!/\d/.test(shape), shape);
  assert.ok(!line.includes("5550102030"), line);
});
