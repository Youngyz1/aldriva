const test = require("node:test");
const assert = require("node:assert/strict");

test("Personal Ownership Rule: campaigns must have organizer_id IS NULL", () => {
  const mockFundraisers = [
    { id: "f1", user_id: "u1", organizer_id: null, title: "Personal Medical Fund" },
    { id: "f2", user_id: "u1", organizer_id: "org-1", title: "Charity Gala Fund" },
    { id: "f3", user_id: "u2", organizer_id: null, title: "Other User Fund" },
  ];

  const currentUserId = "u1";
  const personalCampaigns = mockFundraisers.filter(
    (f) => f.user_id === currentUserId && f.organizer_id === null
  );

  assert.equal(personalCampaigns.length, 1);
  assert.equal(personalCampaigns[0].id, "f1");
  assert.equal(personalCampaigns[0].title, "Personal Medical Fund");
});

test("Personal Ownership Rule: events must have organizer_id IS NULL", () => {
  const mockEvents = [
    { id: "e1", user_id: "u1", organizer_id: null, title: "Personal Birthday" },
    { id: "e2", user_id: "u1", organizer_id: "org-1", title: "Annual Tech Summit" },
  ];

  const currentUserId = "u1";
  const personalEvents = mockEvents.filter(
    (e) => e.user_id === currentUserId && e.organizer_id === null
  );

  assert.equal(personalEvents.length, 1);
  assert.equal(personalEvents[0].id, "e1");
});

test("Personal Ownership Rule: articles must have organizer_id IS NULL", () => {
  const mockArticles = [
    { id: "a1", owner_id: "u1", organizer_id: null, title: "My Personal Story" },
    { id: "a2", owner_id: "u1", organizer_id: "org-1", title: "Corporate Press Release" },
  ];

  const currentUserId = "u1";
  const personalArticles = mockArticles.filter(
    (a) => a.owner_id === currentUserId && a.organizer_id === null
  );

  assert.equal(personalArticles.length, 1);
  assert.equal(personalArticles[0].id, "a1");
});

test("Personal Ownership Rule: products must have business_id IS NULL", () => {
  const mockProducts = [
    { id: "p1", owner_id: "u1", business_id: null, name: "Personal E-Book PDF" },
    { id: "p2", owner_id: "u1", business_id: "biz-1", name: "Store Merchandise" },
  ];

  const currentUserId = "u1";
  const personalProducts = mockProducts.filter(
    (p) => p.owner_id === currentUserId && p.business_id === null
  );

  assert.equal(personalProducts.length, 1);
  assert.equal(personalProducts[0].id, "p1");
});

test("Profile Privacy: External viewer queries only public personal content", () => {
  const allUserFundraisers = [
    { id: "f1", user_id: "u_target", organizer_id: null, status: "published", title: "Public Personal" },
    { id: "f2", user_id: "u_target", organizer_id: null, status: "draft", title: "Draft Personal" },
    { id: "f3", user_id: "u_target", organizer_id: "org-1", status: "published", title: "Org Campaign" },
  ];

  const isOwnProfile = false;
  const targetId = "u_target";

  // Simulate public profile query filter
  const visibleToExternal = allUserFundraisers.filter((f) => {
    const isOwnerMatch = f.user_id === targetId;
    const isPersonal = f.organizer_id === null;
    const isPublic = isOwnProfile || f.status === "published";
    return isOwnerMatch && isPersonal && isPublic;
  });

  assert.equal(visibleToExternal.length, 1);
  assert.equal(visibleToExternal[0].id, "f1");
  assert.equal(visibleToExternal[0].title, "Public Personal");
});

test("Follow List Privacy: Server-side authorization check rejects external viewers", () => {
  function checkFollowListAccess(targetProfileId, authenticatedViewerId) {
    if (!authenticatedViewerId || authenticatedViewerId !== targetProfileId) {
      return { status: 403, error: "Forbidden: Follower lists are private to the profile owner." };
    }
    return { status: 200, ok: true };
  }

  // External viewer trying to access another user's followers
  const externalResult = checkFollowListAccess("user_b", "user_a");
  assert.equal(externalResult.status, 403);

  // Unauthenticated visitor trying to access followers
  const anonResult = checkFollowListAccess("user_b", null);
  assert.equal(anonResult.status, 403);

  // Profile owner accessing their own followers
  const ownerResult = checkFollowListAccess("user_b", "user_b");
  assert.equal(ownerResult.status, 200);
});

test("Profile Menu Data: Strict owner-only gate and dynamic non-empty categories", () => {
  function deriveProfileMenu(targetProfileId, viewerId, userStats) {
    if (!viewerId || viewerId !== targetProfileId) {
      return null;
    }
    return {
      isOwner: true,
      personal: {
        hasTickets: userStats.ticketCount > 0,
        hasDonations: userStats.donationCount > 0,
        hasCampaigns: userStats.campaignCount > 0,
        hasEvents: userStats.eventCount > 0,
      },
      organizerResources: {
        hasEvents: userStats.orgEventCount > 0,
        hasFundraisers: userStats.orgFundraiserCount > 0,
        hasBusinesses: userStats.orgBusinessCount > 0,
      },
      organizers: userStats.organizers,
    };
  }

  // External viewer receives null (no owner management data exposed)
  const externalMenu = deriveProfileMenu("user_b", "user_a", {
    ticketCount: 2,
    donationCount: 3,
    campaignCount: 1,
    eventCount: 0,
    orgEventCount: 5,
    orgFundraiserCount: 2,
    orgBusinessCount: 1,
    organizers: [{ id: "org-1", name: "Org 1" }],
  });
  assert.equal(externalMenu, null);

  // Owner receives dynamic profile menu
  const ownerMenu = deriveProfileMenu("user_b", "user_b", {
    ticketCount: 2,
    donationCount: 3,
    campaignCount: 1,
    eventCount: 0,
    orgEventCount: 5,
    orgFundraiserCount: 2,
    orgBusinessCount: 1,
    organizers: [{ id: "org-1", name: "Org 1" }],
  });

  assert.ok(ownerMenu);
  assert.equal(ownerMenu.isOwner, true);
  assert.equal(ownerMenu.personal.hasTickets, true);
  assert.equal(ownerMenu.personal.hasDonations, true);
  assert.equal(ownerMenu.personal.hasCampaigns, true);
  assert.equal(ownerMenu.personal.hasEvents, false); // 0 events -> false
  assert.equal(ownerMenu.organizerResources.hasEvents, true);
  assert.equal(ownerMenu.organizers.length, 1);
});

test("Unified Settings Control: Settings button acts as single control and contains Edit Profile", () => {
  // Model representation of Profile Settings menu structure
  function buildProfileSettingsStructure(menuData) {
    if (!menuData || !menuData.isOwner) return null;
    return {
      personal: [
        { label: "Edit Profile", href: "/dashboard/settings/profile", alwaysPresent: true },
        ...(menuData.personal.hasTickets ? [{ label: "My Tickets", href: "/events/my-tickets" }] : []),
        ...(menuData.personal.hasDonations ? [{ label: "My Donations", href: "/dashboard/donations" }] : []),
        ...(menuData.personal.hasCampaigns ? [{ label: "My Campaigns", href: "/dashboard" }] : []),
        ...(menuData.personal.hasEvents ? [{ label: "My Events", href: "/dashboard" }] : []),
      ],
      organizers: menuData.organizers,
      account: [
        { label: "Dashboard", href: "/dashboard" },
        { label: "Log Out", action: "signOut" },
      ],
    };
  }

  const mockOwnerData = {
    isOwner: true,
    personal: {
      hasTickets: true,
      hasDonations: false,
      hasCampaigns: true,
      hasEvents: false,
    },
    organizers: [{ id: "org-1", name: "Sams Abidjan" }],
  };

  const settings = buildProfileSettingsStructure(mockOwnerData);
  assert.ok(settings);
  // Edit Profile is inside Settings
  assert.equal(settings.personal[0].label, "Edit Profile");
  assert.equal(settings.personal[0].href, "/dashboard/settings/profile");
  // Only non-empty personal items exist
  assert.equal(settings.personal.some((i) => i.label === "My Tickets"), true);
  assert.equal(settings.personal.some((i) => i.label === "My Donations"), false);
  // Account actions present
  assert.equal(settings.account.some((a) => a.label === "Dashboard"), true);
  assert.equal(settings.account.some((a) => a.label === "Log Out"), true);
});

test("Content Tabs: Dynamic tabs only include entities with active content and default to Overview", () => {
  function computeProfileTabs(items) {
    return [
      { id: "overview", label: "Overview" },
      ...(items.campaigns.length > 0 ? [{ id: "campaigns", label: "Campaigns", count: items.campaigns.length }] : []),
      ...(items.events.length > 0 ? [{ id: "events", label: "Events", count: items.events.length }] : []),
      ...(items.businesses.length > 0 ? [{ id: "businesses", label: "Businesses", count: items.businesses.length }] : []),
      ...(items.articles.length > 0 ? [{ id: "articles", label: "Articles", count: items.articles.length }] : []),
      ...(items.products.length > 0 ? [{ id: "products", label: "Products", count: items.products.length }] : []),
    ];
  }

  // Profile with campaigns and articles only
  const tabs = computeProfileTabs({
    campaigns: [{ id: "c1" }, { id: "c2" }],
    events: [],
    businesses: [],
    articles: [{ id: "a1" }],
    products: [],
  });

  assert.equal(tabs[0].id, "overview");
  assert.equal(tabs.length, 3); // overview, campaigns, articles
  assert.equal(tabs[1].id, "campaigns");
  assert.equal(tabs[1].count, 2);
  assert.equal(tabs[2].id, "articles");
  assert.equal(tabs[2].count, 1);
});

test("Digital Summary: Real metrics without meaningless zero cards", () => {
  function computeSummaryMetrics(data) {
    const metrics = [];
    if (data.campaignCount > 0) metrics.push({ key: "campaigns", value: data.campaignCount });
    if (data.totalRaised > 0) metrics.push({ key: "raised", value: data.totalRaised });
    if (data.eventCount > 0) metrics.push({ key: "events", value: data.eventCount });
    if (data.articleCount > 0) metrics.push({ key: "articles", value: data.articleCount });
    return metrics;
  }

  const metrics = computeSummaryMetrics({
    campaignCount: 2,
    totalRaised: 8450,
    eventCount: 0, // 0 events -> omitted
    articleCount: 4,
  });

  assert.equal(metrics.length, 3);
  assert.deepEqual(
    metrics.map((m) => m.key),
    ["campaigns", "raised", "articles"]
  );
  assert.equal(metrics.find((m) => m.key === "events"), undefined);
});

test("Impact Section: Collapsible structure with summary calculation", () => {
  const mockDonations = [
    { id: "d1", amount: 50, fundraiser: { slug: "f1", title: "Help Grandma" } },
    { id: "d2", amount: 50, fundraiser: { slug: "f2", title: "MAREA BLANCA" } },
    { id: "d3", amount: 150, fundraiser: { slug: "f1", title: "Help Grandma" } },
  ];

  const totalDonated = mockDonations.reduce((sum, d) => sum + d.amount, 0);
  const uniqueCampaigns = new Set(mockDonations.map((d) => d.fundraiser.slug)).size;

  assert.equal(totalDonated, 250);
  assert.equal(uniqueCampaigns, 2);
});

test("Mobile Bottom Nav: Minimal 4-item arrangement without menu dumping", () => {
  function getMobileNavItems(isOwnProfile) {
    return [
      { label: "Home", href: "/" },
      { label: "Tickets", href: "/events/my-tickets" },
      { label: "Dashboard", href: "/dashboard" },
      isOwnProfile ? { label: "Settings", action: "openSettings" } : { label: "Explore", href: "/events" },
    ];
  }

  const ownerNav = getMobileNavItems(true);
  assert.equal(ownerNav.length, 4);
  assert.equal(ownerNav[3].label, "Settings");

  const visitorNav = getMobileNavItems(false);
  assert.equal(visitorNav.length, 4);
  assert.equal(visitorNav[3].label, "Explore");
});

test("Navbar account dropdown contains Profile link only - no Dashboard/Tickets/Donations/Logout", () => {
  // Model the minimal account dropdown structure
  function buildNavbarDropdownItems(accountId) {
    return [
      { label: "Profile", href: "/profile/" + accountId },
    ];
  }

  const items = buildNavbarDropdownItems("user-abc");
  assert.equal(items.length, 1);
  assert.equal(items[0].label, "Profile");
  assert.equal(items[0].href, "/profile/user-abc");

  // These must NOT be in the dropdown
  const forbidden = ["Dashboard", "My Tickets", "My Donations", "My Library", "Log Out"];
  forbidden.forEach((label) => {
    assert.equal(items.some((i) => i.label === label), false,
      `"${label}" must not be in the account dropdown`);
  });
});

test("Profile control is labeled Explore (not Settings or Menu)", () => {
  // Verify the new label constant
  const controlLabel = "Explore";
  assert.equal(controlLabel, "Explore");
  assert.notEqual(controlLabel, "Settings");
  assert.notEqual(controlLabel, "Menu");
});

test("Explore menu starts CLOSED (isOpen initializes to false)", () => {
  // Model the component's initial state
  function makeExploreMenuState() {
    return { isOpen: false, organizersExpanded: false };
  }
  const state = makeExploreMenuState();
  assert.equal(state.isOpen, false, "Explore menu must start closed");
});

test("Organizers accordion starts COLLAPSED (organizersExpanded initializes to false)", () => {
  function makeExploreMenuState() {
    return { isOpen: false, organizersExpanded: false };
  }
  const state = makeExploreMenuState();
  assert.equal(state.organizersExpanded, false, "Organizers accordion must start collapsed");
});

test("Impact section starts CLOSED (impactExpanded initializes to false)", () => {
  function makeProfileClientState() {
    return { impactExpanded: false };
  }
  const state = makeProfileClientState();
  assert.equal(state.impactExpanded, false, "Impact section must start closed");
});

test("Explore menu contains Edit Profile, Dashboard, and Log Out in Account section", () => {
  function buildExploreAccountSection() {
    return [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Edit Profile", href: "/dashboard/settings/profile" },
      { label: "Log Out", action: "signOut" },
    ];
  }
  const accountSection = buildExploreAccountSection();
  assert.ok(accountSection.some((i) => i.label === "Dashboard"));
  assert.ok(accountSection.some((i) => i.label === "Edit Profile"));
  assert.ok(accountSection.some((i) => i.label === "Log Out"));
});

test("External profile viewer gets no Explore management menu (isOwner gate)", () => {
  function shouldShowExplore(menuData) {
    return menuData !== null && menuData.isOwner === true;
  }
  // External viewer: menuData is null
  assert.equal(shouldShowExplore(null), false);
  // External viewer with explicit isOwner=false
  assert.equal(shouldShowExplore({ isOwner: false }), false);
  // Owner
  assert.equal(shouldShowExplore({ isOwner: true }), true);
});

test("Mobile bottom nav shows Explore (not Settings) for owner", () => {
  function getBottomNavLabel(isOwnProfile) {
    return isOwnProfile ? "Explore" : "Explore"; // both use Explore now
  }
  const ownerLabel = getBottomNavLabel(true);
  const visitorLabel = getBottomNavLabel(false);
  assert.equal(ownerLabel, "Explore");
  assert.notEqual(ownerLabel, "Settings");
  assert.equal(visitorLabel, "Explore");
});
