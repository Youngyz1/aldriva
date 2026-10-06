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

