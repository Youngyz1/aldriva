-- migration_95_aldriva_platform_knowledge.sql
-- Seeds the permanent Aldriva knowledge base into ai_knowledge_docs.
-- Source: Aldriva permanent knowledge base (verified Sep 2026).
-- Split into logical rows by category so the platform-content generator
-- can retrieve them individually. Idempotent: removes prior rows with the
-- same (category, title) before inserting.

BEGIN;

DELETE FROM ai_knowledge_docs
WHERE (category, title) IN (
  ('mission', 'Aldriva Mission'),
  ('vision', 'Aldriva Vision'),
  ('feature_status', 'Aldriva Feature Status (verified Sep 2026)'),
  ('content_levels', 'Aldriva Content Levels'),
  ('content_rules', 'Aldriva Core Content Rules')
);

INSERT INTO ai_knowledge_docs (category, title, content, tags, active) VALUES
(
  'mission',
  'Aldriva Mission',
  'Aldriva exists to give people and organizations a place to create, discover, connect, support one another, and grow. Aldriva began with events, but the underlying opportunity became broader: people do not live their activities in isolated categories. The same person may attend an event, support a fundraiser, discover a business, read an article, or eventually sell something of their own — all as one identity, not five disconnected accounts on five disconnected sites. The mission is not to provide a bundle of separate tools. It is to build a connected platform where people can participate: create opportunities, support causes, discover businesses and experiences, share ideas, and build something of their own.',
  ARRAY['mission', 'brand', 'platform'],
  true
),
(
  'vision',
  'Aldriva Vision',
  'Aldriva is becoming a connected digital ecosystem where people can discover opportunities, create experiences, support causes, grow businesses, share ideas, and participate in their communities — all within one platform, one identity. A person may be an attendee, customer, donor, reviewer, creator, organizer, business owner, publisher, or seller — without needing a separate identity for each role.',
  ARRAY['vision', 'brand', 'platform'],
  true
),
(
  'feature_status',
  'Aldriva Feature Status (verified Sep 2026)',
  'HARD RULE: Aldriva AI must never present a BETA, IN DEVELOPMENT, PLANNED, or CONCEPT item as if it were a fully live, fully-featured capability. Status per vertical (verified Sep 2026): Events = LIVE (event creation, ticketing, QR tickets, staff/team roles, check-in, attendance tracking — all confirmed working; can be marketed confidently and specifically). Fundraising = LIVE (campaigns, donations, donor accounts, donation history — all confirmed working; can be marketed confidently). Articles = BETA (real and usable, but known gaps/upgrades pending; mention only generally, e.g. "share your story" — never list specific advanced features). Businesses = BETA (real, usable, incomplete; say businesses can have a presence on Aldriva — never claim specific advanced functionality such as full advertising/promotion tools). Digital Products = BETA (real, usable, incomplete; keep claims general, e.g. "sell what you create"). Event Seating & Invitations = IN DEVELOPMENT as of Sep 2026 (seat maps, table assignments, digital invitations do NOT exist in the live product — never mention them publicly). Growth Verticals (manifestation, astrology, reflection content) = CONCEPT, internal idea only — never reference publicly. Aldriva AI / Growth Studio itself = internal admin tool, NOT a user-facing feature — never describe "our AI" or "Growth Studio" as something Aldriva users get to use.',
  ARRAY['feature_status', 'brand_accuracy', 'guard'],
  true
),
(
  'content_levels',
  'Aldriva Content Levels',
  'Use three levels for content variety. Level 1 — Brand: Aldriva as the connected ecosystem, the big idea. Level 2 — Verticals: Events, Fundraising, Businesses (beta), Articles (beta), Digital Products (beta) — plus the supporting layer: profiles, reviews, discovery, transactions. Level 3 — Use cases: "Planning an event?" / "Raising money for something that matters?" / "Looking for a local business?" / "Have something worth sharing?" — Aldriva as the answer. Level 3 tends to make the strongest, most concrete social copy.',
  ARRAY['content_levels', 'brand', 'framing'],
  true
),
(
  'content_rules',
  'Aldriva Core Content Rules',
  '1. Never present a BETA, IN DEVELOPMENT, PLANNED, or CONCEPT capability as fully live. 2. When mentioning Articles, Businesses, or Digital Products, favor general framing over specific feature claims until those verticals are re-audited. 3. Never mention Seating, Table Assignments, or Digital Invitations publicly — not built yet. 4. Never describe Growth Studio / Aldriva AI as something end users interact with. 5. When real inventory (an active fundraiser, an upcoming event) exists, use it — grounded, specific content outperforms generic platform content. This knowledge base fills the gaps; it does not replace real content. 6. While CONTENT_MODE is platform_only (no genuine non-test inventory yet), only reference Events and Fundraising vertical CAPABILITIES in general terms ("create and manage real events", "run fundraising campaigns") — NEVER reference specific fundraiser/event names, since none in the current database are real.',
  ARRAY['content_rules', 'brand_accuracy', 'guard'],
  true
);

COMMIT;

NOTIFY pgrst, 'reload schema';
