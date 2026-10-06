/**
 * scripts/seed-staging-invitation.cjs — Guarded Staging Seed Script
 *
 * Seeds:
 *  - 1 Test Organization ("Staging QA Organization")
 *  - 2 Events (1 with organizer, 1 personal/without organizer)
 *  - 3 Guests with tokens and polymorphic ticket credentials
 *
 * SAFETY GUARDS (MANDATORY):
 *  - Refuses to run unless STAGING_PROJECT_REF is explicitly provided.
 *  - Refuses to run if the database URL or Supabase URL contains the production project ref.
 *  - Refuses to run if the connection does not match STAGING_PROJECT_REF.
 *  - NEVER prints, logs, or commits keys, secrets, or raw connection strings.
 *
 * Usage:
 *   STAGING_PROJECT_REF="<ref>" STAGING_DATABASE_URL="postgresql://..." node scripts/seed-staging-invitation.cjs
 */

const { Client } = require("pg");
const { randomBytes, randomUUID } = require("crypto");

const KNOWN_PROD_REFS = ["hkvjdtbhiycqqhgelymr", "jnobheduodpvojwzbpra"];

function validateStagingTarget(targetUrl, expectedRef) {
  if (!expectedRef || typeof expectedRef !== "string" || !expectedRef.trim()) {
    return "Refusing: STAGING_PROJECT_REF environment variable must be provided.";
  }

  const cleanExpectedRef = expectedRef.trim().toLowerCase();

  for (const prodRef of KNOWN_PROD_REFS) {
    if (cleanExpectedRef === prodRef) {
      return "Refusing: STAGING_PROJECT_REF matches a protected production project ref.";
    }
  }

  if (!targetUrl || typeof targetUrl !== "string" || !targetUrl.trim()) {
    return "Refusing: STAGING_DATABASE_URL is not set.";
  }

  for (const prodRef of KNOWN_PROD_REFS) {
    if (targetUrl.includes(prodRef)) {
      return "Refusing: Target URL contains a protected production project ref.";
    }
  }

  if (!targetUrl.includes(cleanExpectedRef)) {
    return "Refusing: Target URL does not match the specified STAGING_PROJECT_REF.";
  }

  return null;
}

async function runSeed() {
  const stagingRef = process.env.STAGING_PROJECT_REF;
  const dbUrl = process.env.STAGING_DATABASE_URL;

  const refusal = validateStagingTarget(dbUrl, stagingRef);
  if (refusal) {
    console.error(`\x1b[31m[ABORT]\x1b[0m ${refusal}`);
    process.exit(1);
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log(`\x1b[32m[CONNECTED]\x1b[0m Verified staging database connection.`);

    await client.query("BEGIN");

    // 1. Get or create a staging test user
    const userRes = await client.query(`
      SELECT id FROM auth.users
      WHERE email = 'qa-harness+staging@aldriva.com'
      LIMIT 1
    `);

    let userId;
    if (userRes.rows.length > 0) {
      userId = userRes.rows[0].id;
    } else {
      const newUserId = randomUUID();
      await client.query(`
        INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
        VALUES ($1, 'qa-harness+staging@aldriva.com', '{"full_name": "QA Staging Harness"}', NOW(), NOW())
        ON CONFLICT DO NOTHING
      `, [newUserId]);
      userId = newUserId;
    }

    // 2. Create / Upsert 1 Test Organizer
    const orgRes = await client.query(`
      INSERT INTO public.organizers (
        id, user_id, name, slug, bio, status, visibility, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        $1,
        'Staging QA Organization',
        'staging-qa-org-' || substr(md5(random()::text), 1, 6),
        'Official test organization for staging environment QA testing.',
        'approved',
        'public',
        NOW(),
        NOW()
      )
      RETURNING id, name, slug
    `, [userId]);

    const organizerId = orgRes.rows[0].id;
    console.log(`✔ Created Test Organizer: ${orgRes.rows[0].name} (ID: ${organizerId})`);

    // 3. Create Event 1 (with organizer)
    const event1Res = await client.query(`
      INSERT INTO public.events (
        id, user_id, organizer_id, title, slug, description, category,
        event_type, venue, city, event_date, status, visibility, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        $1,
        $2,
        'Annual Luminary Gala 2026',
        'luminary-gala-' || substr(md5(random()::text), 1, 6),
        'An exclusive gala evening with dinner, keynote, and silent auction.',
        'Gala',
        'in_person',
        'The Grand Ballroom',
        'New York',
        NOW() + INTERVAL '30 days',
        'approved',
        'public',
        NOW(),
        NOW()
      )
      RETURNING id, title
    `, [userId, organizerId]);

    const event1Id = event1Res.rows[0].id;
    console.log(`✔ Created Event 1 (with organizer): ${event1Res.rows[0].title} (ID: ${event1Id})`);

    // 4. Create Event 2 (without organizer / personal event)
    const event2Res = await client.query(`
      INSERT INTO public.events (
        id, user_id, organizer_id, title, slug, description, category,
        event_type, venue, city, event_date, status, visibility, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        $1,
        NULL,
        'Sarah & David Wedding Celebration',
        'sarah-david-wedding-' || substr(md5(random()::text), 1, 6),
        'Join us in celebrating our special day with loved ones.',
        'Social',
        'in_person',
        'St. Patrick Botanical Gardens',
        'Montclair',
        NOW() + INTERVAL '60 days',
        'approved',
        'private',
        NOW(),
        NOW()
      )
      RETURNING id, title
    `, [userId]);

    const event2Id = event2Res.rows[0].id;
    console.log(`✔ Created Event 2 (personal / no organizer): ${event2Res.rows[0].title} (ID: ${event2Id})`);

    // 5. Create 3 Guests across the 2 events
    const guests = [
      {
        eventId: event1Id,
        name: "Hon. Jonathan Sterling",
        title: "Guest of Honor",
        org: "Vanguard Trust",
        email: "jonathan.sterling.staging@aldriva-qa.test",
        status: "sent",
        rsvp: "accepted",
      },
      {
        eventId: event1Id,
        name: "Dr. Evelyn Vance",
        title: "Keynote Speaker",
        org: "Global Philanthropy Institute",
        email: "evelyn.vance.staging@aldriva-qa.test",
        status: "draft",
        rsvp: "pending",
      },
      {
        eventId: event2Id,
        name: "Marcus Aurelius Chen",
        title: "Family Guest",
        org: null,
        email: "marcus.chen.staging@aldriva-qa.test",
        status: "sent",
        rsvp: "pending",
      },
    ];

    for (const g of guests) {
      const token = randomBytes(32).toString("hex");
      const qrCode = randomUUID().replace(/-/g, "").toUpperCase();

      const invRes = await client.query(`
        INSERT INTO public.event_invitations (
          id, event_id, guest_name, guest_title, organization, email,
          token, invitation_status, rsvp_status, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
        )
        RETURNING id, guest_name
      `, [g.eventId, g.name, g.title, g.org, g.email, token, g.status, g.rsvp]);

      const invId = invRes.rows[0].id;

      await client.query(`
        INSERT INTO public.ticket_instances (
          id, event_id, invitation_id, source, qr_code, status, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, 'invitation', $3, 'valid', NOW(), NOW()
        )
      `, [g.eventId, invId, qrCode]);

      console.log(`✔ Seeded Guest: ${g.name} (${g.email})`);
    }

    await client.query("COMMIT");
    console.log(`\x1b[32m[SUCCESS]\x1b[0m Staging seed completed cleanly.`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`\x1b[31m[ERROR]\x1b[0m Seed failed: ${err.message}`);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

if (require.main === module) {
  runSeed();
}

module.exports = { validateStagingTarget, KNOWN_PROD_REFS };
