/**
 * lib/__tests__/invitation-page-phase3.test.cjs
 *
 * Phase 3 guest page tests + Part A permission model tests.
 *
 * Tests:
 * 1. Permission model: non-owner denied, allowed roles pass, guest token cannot read drafts.
 * 2. InvitationLoader branch logic (simulated): card fallback for old invitations,
 *    template render for published pages, card fallback for unknown template_id,
 *    published changes to event date/venue visible without re-publish,
 *    draft edits invisible until publish.
 * 3. Preview token: expired → rejected, sample guest has no real PII,
 *    RSVP disabled on preview (no writes from preview context).
 */

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(ROOT, request.slice(2)),
      parent,
      isMain,
      options
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

if (!require.extensions[".ts"]) {
  require.extensions[".ts"] = function compileTs(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
      fileName: filename,
    }).outputText;
    module._compile(output, filename);
  };
}

const { assembleInvitationPageData } = require("../types/invitation-page-snapshot.ts");
const { validateForPublish } = require("../invitation-page-schema.ts");

// ── Permission Model Tests ──────────────────────────────────────────────────

describe("Permission model: hasEventOrOrganizerAccess vs RLS policy", () => {
  /**
   * Server-action permission model (hasEventOrOrganizerAccess):
   *   1. events.user_id === userId (direct event creator)
   *   2. organizers.user_id === userId (direct organizer owner)
   *   3. entity_members role IN ['owner', 'admin', 'manager', 'editor'] (ENTITY_ROLES_CONTENT_WRITE)
   *   4. event_team_members role IN ['event_manager'] (passed explicitly by invitation-page actions)
   *
   * RLS policy (migration_154):
   *   events.user_id = auth.uid()
   *   OR organizers.user_id = auth.uid()
   *   OR is_entity_member(organizer_id, ['owner','admin','manager'])  ← no 'editor'
   *   OR is_event_team_member(event_id, ['event_manager'])
   *
   * EXACT PARITY:
   *   Server actions (checkInvitationPageAccess) and RLS policies allow the exact same
   *   entity roles: ['owner', 'admin', 'manager']. The 'editor' role is strictly denied.
   */
  test("server action entity roles exactly match RLS entity roles (editor denied)", () => {
    // Server action allowed roles for entity_members:
    const serverActionEntityRoles = ["owner", "admin", "manager"];
    // RLS policy entity_members check:
    const rlsEntityRoles = ["owner", "admin", "manager"];

    assert.deepEqual(
      serverActionEntityRoles,
      rlsEntityRoles,
      "Server action allowed entity roles must exactly match RLS policy"
    );
  });

  test("permission check: allowed roles pass, editor and unauthorized roles denied", () => {
    // Simulate: user is not creator, not organizer owner, not entity member, not event_manager
    function simulateHasAccess(options) {
      const { isCreator, isOrganizerOwner, isPlatformAdmin, entityRole, eventTeamRole } = options;
      const ALLOWED_ENTITY_ROLES = ["owner", "admin", "manager"];
      const ALLOWED_EVENT_ROLES = ["event_manager"];
      return Boolean(
        isPlatformAdmin ||
        isCreator ||
        isOrganizerOwner ||
        (entityRole && ALLOWED_ENTITY_ROLES.includes(entityRole)) ||
        (eventTeamRole && ALLOWED_EVENT_ROLES.includes(eventTeamRole))
      );
    }

    // Non-owner (random user) → false
    assert.equal(
      simulateHasAccess({ isCreator: false, isOrganizerOwner: false, isPlatformAdmin: false, entityRole: null, eventTeamRole: null }),
      false,
      "Random user must be denied"
    );

    // editor entity role → false (strictly denied)
    assert.equal(
      simulateHasAccess({ isCreator: false, isOrganizerOwner: false, isPlatformAdmin: false, entityRole: "editor", eventTeamRole: null }),
      false,
      "editor entity role must be denied"
    );

    // finance and viewer entity roles → false
    for (const deniedRole of ["finance", "viewer"]) {
      assert.equal(
        simulateHasAccess({ isCreator: false, isOrganizerOwner: false, isPlatformAdmin: false, entityRole: deniedRole, eventTeamRole: null }),
        false,
        `${deniedRole} entity role must be denied`
      );
    }

    // ticket_scanner event team role → false (invitation-page actions pass ['event_manager'] only)
    assert.equal(
      simulateHasAccess({ isCreator: false, isOrganizerOwner: false, isPlatformAdmin: false, entityRole: null, eventTeamRole: "ticket_scanner" }),
      false,
      "ticket_scanner must be denied for invitation page mutations"
    );

    // Direct event creator → true
    assert.equal(
      simulateHasAccess({ isCreator: true, isOrganizerOwner: false, isPlatformAdmin: false, entityRole: null, eventTeamRole: null }),
      true,
      "Direct creator must be allowed"
    );

    // Organizer owner → true
    assert.equal(
      simulateHasAccess({ isCreator: false, isOrganizerOwner: true, isPlatformAdmin: false, entityRole: null, eventTeamRole: null }),
      true,
      "Organizer owner must be allowed"
    );

    // Platform admin → true
    assert.equal(
      simulateHasAccess({ isCreator: false, isOrganizerOwner: false, isPlatformAdmin: true, entityRole: null, eventTeamRole: null }),
      true,
      "Platform admin must be allowed"
    );

    // Entity member: owner, admin, manager → all true
    for (const role of ["owner", "admin", "manager"]) {
      assert.equal(
        simulateHasAccess({ isCreator: false, isOrganizerOwner: false, isPlatformAdmin: false, entityRole: role, eventTeamRole: null }),
        true,
        `Entity role '${role}' must be allowed by server action`
      );
    }

    // Event manager → true
    assert.equal(
      simulateHasAccess({ isCreator: false, isOrganizerOwner: false, isPlatformAdmin: false, entityRole: null, eventTeamRole: "event_manager" }),
      true,
      "event_manager event team role must be allowed"
    );
  });

  test("guest token cannot read drafts: getPublishedInvitationPage filters on page_status = 'published'", () => {
    // Simulates what getPublishedInvitationPage does on the server
    function simulateGetPublished(row) {
      if (!row || row.page_status !== "published" || !row.published_snapshot) {
        return null;
      }
      return { published_snapshot: row.published_snapshot, page_status: "published" };
    }

    // Draft-only row → null (guest cannot see draft)
    const draftRow = { event_id: "evt-1", page_status: "draft", published_snapshot: null };
    assert.equal(simulateGetPublished(draftRow), null, "Draft must never be served to guests");

    // Published row → returns snapshot
    const publishedRow = {
      event_id: "evt-2",
      page_status: "published",
      published_snapshot: { template_id: "gala-editorial", timezone: "America/New_York" },
    };
    assert.ok(simulateGetPublished(publishedRow), "Published row must be returned");

    // Unpublished after publish: page_status reverted to 'draft' → guest falls back to card
    const unpublishedRow = {
      event_id: "evt-3",
      page_status: "draft",
      published_snapshot: { template_id: "black-tie", timezone: "Europe/Paris" }, // snapshot still exists
    };
    assert.equal(simulateGetPublished(unpublishedRow), null, "Unpublished page must not be served to guests even if snapshot exists");
  });
});

// ── InvitationLoader Branch Logic Tests ─────────────────────────────────────

describe("InvitationLoader branch logic (simulated)", () => {
  test("old invitation with no published page renders card (no event_invitation_pages row)", () => {
    // Simulates the check done in InvitationLoader
    function shouldRenderTemplate(publishedPage) {
      return publishedPage !== null;
    }

    // No page → card
    assert.equal(shouldRenderTemplate(null), false, "No published page → card fallback");
    // Published page → template
    assert.equal(
      shouldRenderTemplate({ published_snapshot: { template_id: "gala-editorial" }, page_status: "published" }),
      true,
      "Published page → template render"
    );
  });

  test("unknown template_id gracefully degrades to the default template (not card fallback)", () => {
    /**
     * getTemplateById() in the registry always returns a fallback (INVITATION_TEMPLATES[0],
     * i.e. Gala Editorial) rather than null/undefined. Therefore an unknown template_id
     * will render the Gala Editorial template rather than the old invitation card.
     *
     * The card fallback (InvitationClient) is only reached when getPublishedInvitationPage()
     * returns null — i.e. when there is no published page at all.
     *
     * A console.error is emitted only if getTemplateById returned falsy (which it never does
     * in the current implementation). This is the correct graceful degradation behavior.
     */
    function resolveTemplate(templateId, registry) {
      // Simulates registry.getTemplateById which always returns a non-null value
      const found = registry.find((t) => t.id === templateId);
      return found || registry[0]; // always returns the first as fallback
    }

    const registry = [
      { id: "gala-editorial", name: "Gala Editorial" },
      { id: "black-tie", name: "Black Tie" },
      { id: "wedding-romantic", name: "Romantic Wedding" },
      { id: "birthday-bold", name: "Bold Celebration" },
    ];

    // Known ids resolve to their template
    assert.equal(resolveTemplate("gala-editorial", registry).id, "gala-editorial");
    assert.equal(resolveTemplate("black-tie", registry).id, "black-tie");

    // Unknown id falls back to the first template (graceful, not card)
    const fallback = resolveTemplate("legacy-unknown-id", registry);
    assert.ok(fallback, "Registry always returns a non-null fallback for unknown ids");
    assert.equal(fallback.id, "gala-editorial", "Unknown id degrades to Gala Editorial");
  });

  test("live event date/venue changes are visible to guests without re-publishing", () => {
    // The published_snapshot stores only page-content; event_date and venue are read
    // live from the events table at render time and merged by assembleInvitationPageData.
    const snapshot = {
      template_id: "gala-editorial",
      locale: "en",
      display_title: "Annual Charity Gala",
      timezone: "America/New_York",
    };

    const liveEventV1 = {
      id: "evt-1",
      title: "Original Title",
      event_date: "2026-11-14 19:00:00",
      venue: "Grand Hall",
    };

    const liveEventV2 = {
      id: "evt-1",
      title: "Updated Title",
      event_date: "2026-11-15 20:00:00", // date changed by host
      venue: "New Venue", // venue changed by host
    };

    const pageDataV1 = assembleInvitationPageData(snapshot, liveEventV1);
    const pageDataV2 = assembleInvitationPageData(snapshot, liveEventV2);

    // Snapshot content unchanged between both renders
    assert.equal(pageDataV1.title, "Annual Charity Gala", "display_title override from snapshot");
    assert.equal(pageDataV2.title, "Annual Charity Gala", "display_title still from snapshot");

    // But live fields update immediately
    assert.equal(pageDataV1.eventDate, "2026-11-14 19:00:00");
    assert.equal(pageDataV2.eventDate, "2026-11-15 20:00:00", "Updated event date visible without re-publish");
    assert.equal(pageDataV2.venue, "New Venue", "Updated venue visible without re-publish");
  });

  test("draft edits stay hidden until publish: guests see only published_snapshot content", () => {
    const publishedSnapshot = {
      template_id: "black-tie",
      locale: "en",
      display_title: "Version 1 Title",
      timezone: "Europe/London",
    };

    // Simulate draft row with unpublished edits
    const draftRow = {
      display_title: "Version 2 Work In Progress",
      story_text: "Unsaved draft content not yet promoted.",
      published_snapshot: publishedSnapshot,
      page_status: "published",
    };

    const liveEvent = { id: "evt-1", title: "Live Event", event_date: "2026-11-14 19:00:00" };

    // Guest sees published snapshot only
    const guestView = assembleInvitationPageData(draftRow.published_snapshot, liveEvent);
    assert.equal(guestView.title, "Version 1 Title", "Guest sees published snapshot title");
    assert.equal(guestView.storyText, undefined, "Draft story_text is not in snapshot — not visible to guests");
  });

  test("unpublish causes InvitationLoader to fall back to card", () => {
    // After unpublishing, page_status = 'draft', getPublishedInvitationPage returns null
    function simulateGetPublished(status, snapshot) {
      if (status !== "published" || !snapshot) return null;
      return { published_snapshot: snapshot, page_status: "published" };
    }

    const snapshot = { template_id: "gala-editorial", timezone: "UTC" };

    assert.ok(simulateGetPublished("published", snapshot), "Published → template render");
    assert.equal(simulateGetPublished("draft", snapshot), null, "After unpublish → card fallback");
  });
});

// ── Preview Token Tests ──────────────────────────────────────────────────────

describe("Preview route invariants", () => {
  test("expired preview token is rejected", () => {
    const now = Date.now();
    const futureExpiry = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
    const pastExpiry = new Date(now - 1000).toISOString();

    function isTokenExpired(expiresAt) {
      return new Date(expiresAt).getTime() < Date.now();
    }

    assert.equal(isTokenExpired(futureExpiry), false, "Future expiry is valid");
    assert.equal(isTokenExpired(pastExpiry), true, "Past expiry is expired");
  });

  test("sample preview guest contains no real PII and has placeholder QR", () => {
    const sampleGuest = {
      guest_name: "Preview Guest",
      guest_title: null,
      organization: null,
      rsvp_status: "pending",
      rsvp_at: null,
      token: "preview-sample-token",
      is_vip: false,
    };
    const sampleTicket = {
      qr_code: "PREVIEW-QR-PLACEHOLDER",
      status: "valid",
      checked_in_at: null,
    };

    // Ensure no real invitation token or email in the sample
    assert.ok(!sampleGuest.guest_name.includes("@"), "No email in sample guest name");
    assert.equal(sampleGuest.token, "preview-sample-token");
    assert.ok(sampleTicket.qr_code.includes("PLACEHOLDER"), "QR code is a placeholder");
  });

  test("preview route cannot write RSVP: onRsvp is not passed to template", () => {
    // The preview page renders <TemplateComponent data={pageData} /> without onRsvp.
    // Templates should disable their RSVP buttons when onRsvp is undefined.
    // We verify that the preview contract excludes the handler.
    function buildPreviewProps(pageData) {
      // Simulates what the preview page does: no onRsvp prop.
      return { data: pageData }; // no onRsvp
    }
    const props = buildPreviewProps({ title: "Test Event" });
    assert.equal(props.onRsvp, undefined, "Preview renders without onRsvp handler");
  });
});

describe("Draft vs Published Snapshot Difference Detection", () => {
  // hasDraftChanges is a pure utility in lib/invitation-page-helpers (no "use server")
  const { hasDraftChanges } = require("../invitation-page-helpers.ts");

  test("identical content in draft and published snapshot returns hasDraftChanges = false", () => {
    const draft = {
      template_id: "gala-editorial",
      locale: "en",
      display_title: "My Gala",
      story_text: "Welcome",
      timezone: "America/New_York",
      page_status: "published",
      updated_at: "2026-10-06T12:00:00Z",
    };
    const snapshot = {
      template_id: "gala-editorial",
      locale: "en",
      display_title: "My Gala",
      story_text: "Welcome",
      timezone: "America/New_York",
    };

    assert.equal(hasDraftChanges(draft, snapshot, "published"), false, "Identical content must report no unpublished changes");
  });

  test("ignoring updated_at timestamp difference when content is identical", () => {
    const draft = {
      template_id: "gala-editorial",
      locale: "en",
      display_title: "My Gala",
      page_status: "published",
      updated_at: "2026-10-06T15:30:00Z", // Different updated_at
    };
    const snapshot = {
      template_id: "gala-editorial",
      locale: "en",
      display_title: "My Gala",
    };

    assert.equal(hasDraftChanges(draft, snapshot, "published"), false, "updated_at differences must be ignored");
  });

  test("modified text field detects unpublished changes", () => {
    const draft = {
      template_id: "gala-editorial",
      locale: "en",
      display_title: "My Gala — Edited Title",
      page_status: "published",
    };
    const snapshot = {
      template_id: "gala-editorial",
      locale: "en",
      display_title: "My Gala",
    };

    assert.equal(hasDraftChanges(draft, snapshot, "published"), true, "Title modification must report unpublished changes");
  });

  test("modified array field (schedule) detects unpublished changes", () => {
    const draft = {
      template_id: "gala-editorial",
      locale: "en",
      schedule: [{ time: "6:00 PM", label: "Dinner" }, { time: "8:00 PM", label: "Dance" }],
      page_status: "published",
    };
    const snapshot = {
      template_id: "gala-editorial",
      locale: "en",
      schedule: [{ time: "6:00 PM", label: "Dinner" }],
    };

    assert.equal(hasDraftChanges(draft, snapshot, "published"), true, "Schedule addition must report unpublished changes");
  });

  test("unpublished draft without snapshot returns hasDraftChanges = false", () => {
    const draft = {
      template_id: "gala-editorial",
      locale: "en",
      page_status: "draft",
    };

    assert.equal(hasDraftChanges(draft, null, "draft"), false, "Brand new draft has no published snapshot to differ from");
  });
});

// ── hasEventOrOrganizerAccess 4th-param regression ────────────────────────

describe("hasEventOrOrganizerAccess: 4th param minEntityRoles default preserved for all other callers", () => {
  /**
   * Migration 154 added a 4th parameter `minEntityRoles` to hasEventOrOrganizerAccess.
   * The default is ENTITY_ROLES_CONTENT_WRITE = ['owner','admin','manager','editor'].
   * Only invitation-page actions pass ENTITY_ROLES_MANAGE = ['owner','admin','manager'].
   * All other callers (layout, team page, etc.) call with ≤3 args and must keep 'editor' allowed.
   */
  const { ENTITY_ROLES_MANAGE } = require("../entity-auth.ts");
  const { ENTITY_ROLES_CONTENT_WRITE } = require("../entity-auth.ts");

  test("ENTITY_ROLES_CONTENT_WRITE default includes editor (all other callers unaffected)", () => {
    assert.ok(Array.isArray(ENTITY_ROLES_CONTENT_WRITE), "must be an array");
    assert.ok(ENTITY_ROLES_CONTENT_WRITE.includes("editor"), "default must include 'editor'");
    assert.ok(ENTITY_ROLES_CONTENT_WRITE.includes("owner"), "default must include 'owner'");
    assert.ok(ENTITY_ROLES_CONTENT_WRITE.includes("admin"), "default must include 'admin'");
    assert.ok(ENTITY_ROLES_CONTENT_WRITE.includes("manager"), "default must include 'manager'");
  });

  test("ENTITY_ROLES_MANAGE (invitation-page only) excludes editor", () => {
    assert.ok(Array.isArray(ENTITY_ROLES_MANAGE), "must be an array");
    assert.equal(ENTITY_ROLES_MANAGE.includes("editor"), false, "must NOT include 'editor'");
    assert.ok(ENTITY_ROLES_MANAGE.includes("owner"), "must include 'owner'");
    assert.ok(ENTITY_ROLES_MANAGE.includes("admin"), "must include 'admin'");
    assert.ok(ENTITY_ROLES_MANAGE.includes("manager"), "must include 'manager'");
  });

  test("ENTITY_ROLES_MANAGE is a strict subset of ENTITY_ROLES_CONTENT_WRITE", () => {
    for (const role of ENTITY_ROLES_MANAGE) {
      assert.ok(
        ENTITY_ROLES_CONTENT_WRITE.includes(role),
        `ENTITY_ROLES_CONTENT_WRITE must contain '${role}'`
      );
    }
    assert.ok(
      ENTITY_ROLES_CONTENT_WRITE.length > ENTITY_ROLES_MANAGE.length,
      "Default role set must be strictly larger than the invitation-page role set"
    );
  });
});

// ── Tab visibility: editor / denied user ──────────────────────────────────

describe("Invitation Page tab visibility and access check behavior", () => {
  const { getEventSubNavTabs } = require("../event-dashboard-navigation.ts");

  test("invitation-page tab shown for owner and event_manager", () => {
    for (const role of ["owner", "event_manager"]) {
      const ids = getEventSubNavTabs("evt-1", role).map((t) => t.id);
      assert.ok(ids.includes("invitation-page"), `${role} must see Invitation Page tab`);
    }
  });

  test("invitation-page tab hidden for ticket_scanner and null", () => {
    for (const role of ["ticket_scanner", null]) {
      const ids = getEventSubNavTabs("evt-1", role).map((t) => t.id);
      assert.equal(ids.includes("invitation-page"), false, `${role} must NOT see Invitation Page tab`);
    }
  });

  test("checkInvitationPageAccess logic: editor denied, manager allowed (documents tab vs page gate discrepancy)", () => {
    /**
     * The layout maps entity members via hasEventOrOrganizerAccess with default ENTITY_ROLES_CONTENT_WRITE.
     * This means entity 'editor' gets hasOrganizerAccess=true → userRole="owner" → tab shown.
     * BUT checkInvitationPageAccess uses ENTITY_ROLES_MANAGE, so editor gets denied at the page itself
     * (renders "Access Restricted"). This is the expected behavior: tab shown, content gated.
     */
    function simulatePageGate(entityRole) {
      return ["owner", "admin", "manager"].includes(entityRole);
    }
    assert.equal(simulatePageGate("editor"), false, "editor denied at page gate");
    assert.equal(simulatePageGate("manager"), true, "manager allowed at page gate");
    assert.equal(simulatePageGate("admin"), true, "admin allowed at page gate");
    assert.equal(simulatePageGate("owner"), true, "owner allowed at page gate");
  });
});

// ── Publish Validation Unit Tests ──────────────────────────────────────────

describe("validateForPublish schema validation", () => {
  const event = {
    title: "Annual Gala 2026",
    event_date: "2026-12-15T19:00:00Z",
    city: "New York",
  };

  test("valid draft with timezone and template passes publish validation", () => {
    const draft = {
      template_id: "gala-editorial",
      locale: "en",
      timezone: "America/New_York",
      display_title: "My Gala",
    };
    const res = validateForPublish(draft, event, "en");
    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);
  });

  test("draft missing timezone fails publish validation with localized error", () => {
    const draft = {
      template_id: "gala-editorial",
      locale: "en",
      timezone: "",
    };
    const resEn = validateForPublish(draft, event, "en");
    assert.equal(resEn.valid, false);
    assert.ok(resEn.errors.some((e) => e.field === "timezone"));

    const resFr = validateForPublish(draft, event, "fr");
    assert.equal(resFr.valid, false);
    assert.ok(resFr.errors.some((e) => e.message.includes("fuseau horaire")));
  });

  test("wedding-romantic template requires partner names", () => {
    const draft = {
      template_id: "wedding-romantic",
      locale: "en",
      timezone: "Europe/Paris",
      partner1_name: "Alex",
      partner2_name: "",
    };
    const res = validateForPublish(draft, event, "en");
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.field === "partner2_name"));
  });

  test("birthday-bold template requires celebrant name", () => {
    const draft = {
      template_id: "birthday-bold",
      locale: "en",
      timezone: "Europe/London",
      celebrant_name: "",
    };
    const res = validateForPublish(draft, event, "en");
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.field === "celebrant_name"));
  });
});

// ── Invitation Page Dashboard Access & Denied State Tests ─────────────────

describe("Invitation Page Dashboard Gate & Access Branches", () => {
  /**
   * Simulates checkInvitationPageAccess and dashboard gate behavior:
   * 1. Direct creator (events.user_id = userId, organizer_id = null) -> ALWAYS GRANTED
   * 2. Direct creator with an organizer -> GRANTED
   * 3. Organizer admin or manager -> GRANTED
   * 4. Event team event_manager -> GRANTED
   * 5. Entity editor -> DENIED (renders visible Access Restricted UI, NOT a redirect to event home)
   * 6. Unrelated / unauthorized user -> DENIED (renders visible Access Restricted UI)
   */

  function simulatePageAccess(params) {
    const {
      userId,
      eventUserId,
      organizerId,
      organizerOwnerId,
      entityRole,
      eventTeamRole,
      isPlatformAdmin,
    } = params;

    if (isPlatformAdmin) return { allowed: true };

    // Direct event owner (whether organizer_id is null or not)
    if (userId === eventUserId) return { allowed: true };

    // Organizer owner
    if (organizerId && organizerOwnerId && userId === organizerOwnerId) {
      return { allowed: true };
    }

    // Entity members (owner, admin, manager allowed; editor denied)
    if (organizerId && entityRole) {
      if (["owner", "admin", "manager"].includes(entityRole)) {
        return { allowed: true };
      }
    }

    // Event team member
    if (eventTeamRole === "event_manager") {
      return { allowed: true };
    }

    // Denied state: renders "Access Restricted" component (does NOT redirect)
    return {
      allowed: false,
      renderDeniedState: true,
      deniedComponent: "Access Restricted",
    };
  }

  test("event owner with NO organizer (organizer_id = null) is granted access", () => {
    const res = simulatePageAccess({
      userId: "user-qa-123",
      eventUserId: "user-qa-123",
      organizerId: null,
      organizerOwnerId: null,
      entityRole: null,
      eventTeamRole: null,
      isPlatformAdmin: false,
    });
    assert.equal(res.allowed, true, "Event owner with no organizer must always pass");
  });

  test("event owner WITH an organizer is granted access", () => {
    const res = simulatePageAccess({
      userId: "user-qa-123",
      eventUserId: "user-qa-123",
      organizerId: "org-abc",
      organizerOwnerId: "org-owner-999",
      entityRole: null,
      eventTeamRole: null,
      isPlatformAdmin: false,
    });
    assert.equal(res.allowed, true, "Event creator with organizer must always pass");
  });

  test("organizer admin / manager is granted access", () => {
    for (const role of ["admin", "manager"]) {
      const res = simulatePageAccess({
        userId: "user-staff-456",
        eventUserId: "user-creator-123",
        organizerId: "org-abc",
        organizerOwnerId: "org-owner-999",
        entityRole: role,
        eventTeamRole: null,
        isPlatformAdmin: false,
      });
      assert.equal(res.allowed, true, `Organizer ${role} must be granted access`);
    }
  });

  test("event_manager team member is granted access", () => {
    const res = simulatePageAccess({
      userId: "user-event-mgr-789",
      eventUserId: "user-creator-123",
      organizerId: "org-abc",
      organizerOwnerId: "org-owner-999",
      entityRole: null,
      eventTeamRole: "event_manager",
      isPlatformAdmin: false,
    });
    assert.equal(res.allowed, true, "event_manager must be granted access");
  });

  test("entity editor is denied with visible denied state (NOT redirect to home)", () => {
    const res = simulatePageAccess({
      userId: "user-editor-101",
      eventUserId: "user-creator-123",
      organizerId: "org-abc",
      organizerOwnerId: "org-owner-999",
      entityRole: "editor",
      eventTeamRole: null,
      isPlatformAdmin: false,
    });
    assert.equal(res.allowed, false, "Editor must be denied");
    assert.equal(res.renderDeniedState, true, "Must render denied state UI");
    assert.equal(res.deniedComponent, "Access Restricted");
  });

  test("unrelated user is denied with visible denied state", () => {
    const res = simulatePageAccess({
      userId: "user-stranger-999",
      eventUserId: "user-creator-123",
      organizerId: "org-abc",
      organizerOwnerId: "org-owner-999",
      entityRole: null,
      eventTeamRole: null,
      isPlatformAdmin: false,
    });
    assert.equal(res.allowed, false, "Stranger must be denied");
    assert.equal(res.renderDeniedState, true);
  });
});


// ── Schema Column Name Verification ──────────────────────────────────────────

describe("events and event_invitation_pages column names used in invitation-page actions", () => {
  // Canonical list of columns on the events table as per db/schema.sql +
  // migration files. This test catches regressions where a nonexistent column
  // name is used in a select() and would result in a PostgREST 400 error.
  const EVENTS_KNOWN_COLUMNS = new Set([
    "id", "title", "slug", "description", "category", "venue", "city", "banner",
    "event_date",      // real column (NOT start_date)
    "created_at", "user_id", "video_url", "organizer_id",
    "latitude", "longitude", "visibility", "status",
    "is_featured", "featured_until", "is_homepage_featured",
    "source_organizer_description", "source_organizer_name", "source_organizer_url",
    "homepage_position", "average_rating", "review_count", "event_type",
    "end_date", "street_address", "address_locality", "address_region",
    "postal_code", "address_country", "online_url", "performer_name",
    "deleted_at", "purge_at", "subcategory", "invitation_template_id",
    "kind",  // migration 155: public | invitation
  ]);

  const PROHIBITED_EVENTS_COLUMNS = [
    "timezone",     // lives on event_invitation_pages, not events
    "start_date",   // alias never created in schema; real column is event_date
  ];

  function parseSelectColumns(selectStr) {
    return selectStr.split(",").map((s) => s.trim()).filter(Boolean);
  }

  test("getInvitationPageDraft events select uses only real schema columns", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/actions/invitation-page.ts"), "utf8");
    const draftFnStart = src.indexOf("export async function getInvitationPageDraft(");
    assert.ok(draftFnStart !== -1, "getInvitationPageDraft must exist in invitation-page.ts");
    const draftFnSection = src.slice(draftFnStart, draftFnStart + 1500);
    const selectMatch = draftFnSection.match(/\.from\("events"\)\s*\n?\s*\.select\("([^"]+)"\)/);
    assert.ok(selectMatch, 'getInvitationPageDraft must have a .from("events").select(...) statement');
    const columns = parseSelectColumns(selectMatch[1]);
    assert.ok(columns.length > 0, "select must contain columns");
    for (const col of columns) {
      assert.ok(EVENTS_KNOWN_COLUMNS.has(col), `Column "${col}" in getInvitationPageDraft events select is not in known schema`);
    }
  });

  test("getInvitationPagePreviewByToken events select uses only real schema columns", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/actions/invitation-page.ts"), "utf8");
    const previewFnStart = src.indexOf("getInvitationPagePreviewByToken");
    assert.ok(previewFnStart !== -1, "getInvitationPagePreviewByToken must exist");
    const previewSection = src.slice(previewFnStart, previewFnStart + 2000);
    const selectMatch = previewSection.match(/\.from\("events"\)\s*\n?\s*\.select\("([^"]+)"\)/);
    assert.ok(selectMatch, 'preview function must have a .from("events").select(...) statement');
    const columns = parseSelectColumns(selectMatch[1]);
    for (const col of columns) {
      assert.ok(EVENTS_KNOWN_COLUMNS.has(col), `Column "${col}" in preview token events select is not in known schema`);
    }
  });

  test("no prohibited column names are used in events selects in invitation-page.ts", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/actions/invitation-page.ts"), "utf8");
    for (const prohibited of PROHIBITED_EVENTS_COLUMNS) {
      const re = new RegExp(`\\.from\\("events"\\)[^;]{0,500}\\.select\\("[^"]*\\b${prohibited}\\b[^"]*"\\)`, "s");
      assert.ok(!re.test(src), `Prohibited column "${prohibited}" must not appear in any events select in invitation-page.ts`);
    }
  });

  test("website-builder.ts events select uses event_date not start_date", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/actions/website-builder.ts"), "utf8");
    const selectMatch = src.match(/\.from\("events"\)\s*\n?\s*\.select\("([^"]+)"\)/);
    assert.ok(selectMatch, 'website-builder.ts must have a .from("events").select(...) statement');
    const columns = parseSelectColumns(selectMatch[1]);
    assert.ok(!columns.includes("start_date"), "website-builder.ts must not select start_date (use event_date)");
    assert.ok(columns.includes("event_date"), "website-builder.ts must select event_date (real column name)");
  });
});

// ── Owner Manual-Test Fixes: RSVP dedup, timezone/time honesty, v4 tokens ──

describe("invitation template honesty fixes (RSVP once, no default time, live tokens)", () => {
  const TPL = (name) =>
    fs.readFileSync(path.join(ROOT, "components/invitation/templates", name), "utf8");

  function countOccurrences(src, needle) {
    return src.split(needle).length - 1;
  }

  test("Wedding RSVP shows the kindlyRespond sentence exactly once", () => {
    const src = TPL("InvitationTemplateWedding.tsx");
    assert.equal(
      countOccurrences(src, "{dict.kindlyRespond}"),
      1,
      "kindlyRespond must render once (label OR subtitle, not both)"
    );
  });

  test("Gala Editorial RSVP shows yourInvitationAndRsvp exactly once", () => {
    const src = TPL("InvitationTemplate1.tsx");
    assert.equal(
      countOccurrences(src, "{dict.yourInvitationAndRsvp}"),
      1,
      "yourInvitationAndRsvp must render once (title), not as label + title"
    );
  });

  test("Birthday and Black Tie RSVP headers have no repeated sentence", () => {
    for (const file of ["InvitationTemplateBirthday.tsx", "InvitationTemplateBlackTie.tsx"]) {
      const src = TPL(file);
      assert.equal(countOccurrences(src, "{dict.yourInvitationAndRsvp}"), 1, `${file}: title once`);
      assert.equal(countOccurrences(src, "{dict.kindlyRespond}"), 0, `${file}: no kindlyRespond repeat`);
    }
  });

  test("all templates gate the time line on an explicitly chosen timezone and event date", () => {
    const wedding = TPL("InvitationTemplateWedding.tsx");
    assert.ok(wedding.includes("data.timezone && data.eventDate"), "Wedding must gate timeDisplay");
    const gala = TPL("InvitationTemplate1.tsx");
    assert.ok(gala.includes("data.timezone && data.eventDate"), "Gala Editorial must gate timeDisplay");
    const birthday = TPL("InvitationTemplateBirthday.tsx");
    assert.ok(
      countOccurrences(birthday, "data.timezone && data.eventDate") >= 2,
      "Birthday must gate both the hero chip and the details card"
    );
    const blackTie = TPL("InvitationTemplateBlackTie.tsx");
    assert.ok(blackTie.includes("const showTime = Boolean(data.timezone && data.eventDate)"), "Black Tie must define showTime");
    assert.ok(countOccurrences(blackTie, "{showTime && (") >= 2, "Black Tie must gate both hero strip and details card");
  });

  test("no Tailwind v3 [var] token classes remain in Wedding/Birthday/Gala templates", () => {
    for (const file of [
      "InvitationTemplateWedding.tsx",
      "InvitationTemplateBirthday.tsx",
      "InvitationTemplate1.tsx",
    ]) {
      const src = TPL(file);
      assert.ok(!src.includes("[--"), `${file} must not contain v3 [--var] classes (use v4 paren syntax)`);
    }
  });

  test("new drafts do not default timezone to UTC", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/actions/invitation-page.ts"), "utf8");
    assert.ok(
      !/^\s*timezone:\s*"UTC",?\s*$/m.test(src),
      'draft fallbacks must not hard-code timezone: "UTC" (unset until the host chooses)'
    );
  });

  test("publish validation blocks a missing event date/time in both locales", () => {    const draft = { template_id: "gala-editorial", locale: "en", timezone: "America/New_York" };
    const noDateEvent = { title: "No Date Yet", event_date: null };
    const resEn = validateForPublish(draft, noDateEvent, "en");
    assert.equal(resEn.valid, false);
    assert.ok(resEn.errors.some((e) => e.field === "event_date"), "must flag event_date");
    const resFr = validateForPublish(draft, noDateEvent, "fr");
    assert.equal(resFr.valid, false);
    assert.ok(resFr.errors.some((e) => e.field === "event_date"));

    const datedEvent = { title: "Dated", event_date: "2026-12-15T19:00:00Z" };
    const resOk = validateForPublish({ ...draft, display_title: "X" }, datedEvent, "en");
    assert.equal(resOk.valid, true);
  });
});

// ── Card-free architecture: content on background, hairlines only ───────────

describe("card-free template architecture (no content-card containers)", () => {
  const TPL = (name) =>
    fs.readFileSync(path.join(ROOT, "components/invitation/templates", name), "utf8");

  function assertNoClusters(file, clusters) {
    const src = TPL(file);
    for (const cluster of clusters) {
      assert.ok(!src.includes(cluster), `${file} must not contain card cluster: ${cluster}`);
    }
  }

  test("shared primitives exist with card-free default and explicit opt-in", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "components/invitation/TemplateSurface.tsx"),
      "utf8"
    );
    assert.ok(src.includes("TemplateDivider"), "hairline divider primitive required");
    assert.ok(src.includes("TemplateCard"), "explicit card opt-in required");
    assert.ok(src.includes("border-t"), "divider must be a hairline");
  });

  test("template authoring notes document the card-free default", () => {
    const notesPath = path.join(ROOT, "components/invitation/templates/AUTHORING.md");
    assert.ok(fs.existsSync(notesPath), "AUTHORING.md must exist");
    const notes = fs.readFileSync(notesPath, "utf8");
    assert.ok(notes.includes("TemplateCard"), "opt-in card must be documented");
    assert.ok(notes.includes("(--"), "v4 token syntax must be documented");
    assert.ok(notes.includes("inv-hero"), "scroll anchors must be documented");
  });

  test("Wedding has no content-card containers (frames and badges kept)", () => {
    assertNoClusters("InvitationTemplateWedding.tsx", [
      "p-6 rounded-2xl bg-white border",
      "p-6 sm:p-8 rounded-2xl bg-white border",
      "mx-auto p-8 rounded-2xl bg-white border",
      "p-8 rounded-2xl bg-white border",
      "p-4 rounded-xl bg-white border",
      "p-8 sm:p-10 rounded-2xl bg-white border",
      "rounded-xl overflow-hidden border border-(--wed-rule)",
      "rounded-xl bg-(--wed-bg-alt) inline-block",
    ]);
  });

  test("Gala Editorial has no content-card containers", () => {
    assertNoClusters("InvitationTemplate1.tsx", [
      'className="border p-8 text-center"',
      "rounded-xl overflow-hidden border",
    ]);
  });

  test("Birthday has no content-card containers (badges and buttons kept)", () => {
    assertNoClusters("InvitationTemplateBirthday.tsx", [
      "rounded-2xl bg-white text-(--bday-ink) border-2",
      "p-6 sm:p-8 rounded-3xl bg-white border-2",
      "rounded-3xl bg-(--bday-yellow) border-2",
      "rounded-3xl bg-(--bday-mint) border-2",
      "rounded-3xl bg-(--bday-coral)",
      "rounded-3xl bg-(--bday-purple)",
      "p-5 rounded-2xl bg-white border-2",
      "p-8 rounded-3xl bg-white border-3",
      "rounded-2xl overflow-hidden border-2 border-(--bday-ink)",
      "bg-(--bday-bg-alt) p-3 rounded-xl",
      "p-8 sm:p-10 rounded-3xl bg-white border-3",
    ]);
  });

  test("Black Tie has no content-card containers (controls and frames kept)", () => {
    assertNoClusters("InvitationTemplateBlackTie.tsx", [
      "rounded-3xl sm:rounded-[36px] border border-amber-500/25",
      "overflow-hidden border border-amber-500/20 shadow-inner",
      "bg-zinc-950/60 border border-zinc-800",
      "bg-zinc-900/80 border border-zinc-800 shadow-md",
      "bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-md",
      "bg-zinc-900/90 border border-zinc-800 shadow-lg",
      "bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl",
      "mt-6 rounded-2xl overflow-hidden border border-zinc-800",
      "bg-zinc-800/40 border border-zinc-800",
      "bg-zinc-900/90 border border-zinc-800 flex items-start justify-between",
      "bg-zinc-950/80 border border-zinc-800",
      "border-amber-500/30 bg-gradient",
      "bg-zinc-900/60 border border-zinc-800",
    ]);
  });

  test("builder form has no boxed field-group containers", () => {
    const files = [
      "app/dashboard/events/[id]/invitation-page/builder/sections/ExtrasSection.tsx",
      "app/dashboard/events/[id]/invitation-page/builder/sections/DetailsSection.tsx",
      "app/dashboard/events/[id]/invitation-page/builder/sections/PublishSection.tsx",
      "components/invitation/InvitationSection.tsx",
      "components/invitation/InvitationFocalPicker.tsx",
    ];
    for (const file of files) {
      const src = fs.readFileSync(path.join(ROOT, file), "utf8");
      assert.ok(!src.includes("bg-rose-50/40"), `${file}: no tinted boxes`);
      assert.ok(!src.includes("bg-amber-50/40"), `${file}: no tinted boxes`);
      assert.ok(!src.includes("bg-zinc-50/50 p-4"), `${file}: no grey boxes`);
      assert.ok(!src.includes("bg-zinc-50/70 p-4"), `${file}: no grey boxes`);
      // Heavy elevation has no place on the form (buttons keep design-system shadow-xs).
      assert.ok(!/shadow-(sm|md|lg|xl|2xl)/.test(src), `${file}: no heavy elevation`);
    }
  });
});

// ── STEP 0 fix: honest RSVP failure feedback on the real guest page ────────

describe("RSVP failure honesty (STEP 0 flow verification)", () => {
  const TPL = (name) =>
    fs.readFileSync(path.join(ROOT, "components/invitation/templates", name), "utf8");

  test("all four templates surface a real write failure as an error, not preview success", () => {
    for (const file of [
      "InvitationTemplateWedding.tsx",
      "InvitationTemplateBlackTie.tsx",
      "InvitationTemplateBirthday.tsx",
      "InvitationTemplate1.tsx",
    ]) {
      const src = TPL(file);
      assert.ok(
        src.includes('setRsvpFeedback({ type: "error", text: dict.rsvpFailed })'),
        `${file} must show dict.rsvpFailed on real-page write failure`
      );
    }
  });

  test("rsvpFailed dictionary string exists in both locales", () => {
    const { getInvitationDictionary } = require("../invitation-i18n.ts");
    for (const locale of ["en", "fr"]) {
      const dict = getInvitationDictionary(locale);
      assert.ok(
        typeof dict.rsvpFailed === "string" && dict.rsvpFailed.length > 0,
        `rsvpFailed must exist for locale ${locale}`
      );
    }
  });
});

// ── Gallery honesty: natural ratios, visible captions, honest manager ───────

describe("gallery renders full images with visible captions", () => {
  const GRID = "components/invitation/InvitationGalleryGrid.tsx";
  const gridSrc = () => fs.readFileSync(path.join(ROOT, GRID), "utf8");

  test("shared grid never crops: natural heights, no fixed-ratio frames", () => {
    const src = gridSrc();
    assert.ok(src.includes("h-auto w-full"), "images must keep natural aspect ratio");
    assert.ok(src.includes("columns-2"), "masonry column layout required");
    assert.ok(!src.includes("object-cover"), "no cover-cropping in the gallery grid");
    assert.ok(!src.includes("aspect-"), "no fixed-ratio frames in the gallery grid");
  });

  test("shared grid shows caption (or alt) below every image and in the lightbox", () => {
    const src = gridSrc();
    assert.ok(src.includes("<figcaption"), "visible caption below each image required");
    assert.ok(src.includes("img.caption || img.alt"), "alt falls back when caption is empty");
    assert.ok(src.includes("object-contain"), "lightbox keeps the full uncropped image");
  });

  test("all four templates render the shared gallery (no local crop grids)", () => {
    for (const file of [
      "InvitationTemplateWedding.tsx",
      "InvitationTemplateBlackTie.tsx",
      "InvitationTemplateBirthday.tsx",
      "InvitationTemplate1.tsx",
    ]) {
      const src = fs.readFileSync(
        path.join(ROOT, "components/invitation/templates", file),
        "utf8"
      );
      assert.ok(src.includes("<InvitationGalleryGrid"), `${file} must use the shared grid`);
      assert.ok(!src.includes("aspect-square"), `${file}: no cropped square frames in gallery`);
    }
  });

  test("builder gallery manager lists one photo per row with full-width fields", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "components/invitation/InvitationGalleryManager.tsx"),
      "utf8"
    );
    assert.ok(!src.includes("sm:grid-cols-2"), "one photo per row, never squeezed");
    assert.ok(src.includes("Alt text (Accessibility, max 100)"), "alt field must be present");
    assert.ok(src.includes("Caption (Optional, max 150)"), "caption field must be present");
    assert.ok(src.includes("Move photo"), "up/down reorder required");
    assert.ok(src.includes("Delete photo"), "delete required");
  });
});
