const { test, describe } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

describe("Aldriva Responsive Data Standard & Pilot Screens (Phase 2 / Batch 2)", () => {
  const rootDir = path.resolve(__dirname, "../../../");

  test("Foundation Primitives exist and contain container queries and structured slots", () => {
    const tablePath = path.join(rootDir, "components/dashboard/ResponsiveDataTable.tsx");
    const rowPath = path.join(rootDir, "components/dashboard/ResponsiveDataRow.tsx");
    const cardPath = path.join(rootDir, "components/dashboard/DashboardTableCard.tsx");

    assert.ok(fs.existsSync(tablePath), "ResponsiveDataTable.tsx must exist");
    assert.ok(fs.existsSync(rowPath), "ResponsiveDataRow.tsx must exist");
    assert.ok(fs.existsSync(cardPath), "DashboardTableCard.tsx must exist");

    const tableCode = fs.readFileSync(tablePath, "utf8");
    const rowCode = fs.readFileSync(rowPath, "utf8");
    const cardCode = fs.readFileSync(cardPath, "utf8");

    // Check for container query usage
    assert.ok(tableCode.includes("@container"), "ResponsiveDataTable must define @container");
    assert.ok(tableCode.includes("@md:table"), "ResponsiveDataTable must toggle table at @md");
    assert.ok(tableCode.includes("@md:hidden"), "ResponsiveDataTable must hide mobile list at @md");

    // Check column breakpoint support
    assert.ok(tableCode.includes("hideBelow"), "ResponsiveDataTable must support hideBelow");

    // Check row structure
    assert.ok(rowCode.includes("expandedDetails"), "ResponsiveDataRow must support progressive disclosure expandedDetails");
    assert.ok(rowCode.includes("selectionControl"), "ResponsiveDataRow must support selectionControl slot");
    assert.ok(rowCode.includes("identity"), "ResponsiveDataRow must have Line 1 identity slot");
    assert.ok(rowCode.includes("primaryValue"), "ResponsiveDataRow must have Line 1 primaryValue slot");
  });

  test("Screen 1 (Events): Uses ResponsiveDataTable with date/revenue hierarchy", () => {
    const filePath = path.join(rootDir, "app/[locale]/dashboard/events/EventsClient.tsx");
    assert.ok(fs.existsSync(filePath), "EventsClient.tsx must exist");
    const code = fs.readFileSync(filePath, "utf8");

    assert.ok(code.includes("ResponsiveDataTable"), "EventsClient must use ResponsiveDataTable");
    assert.ok(code.includes("ResponsiveDataRow"), "EventsClient must use ResponsiveDataRow");
    assert.ok(code.includes("formatAdminMoney"), "EventsClient must format revenue");
    assert.ok(!code.includes("<table className=\"w-full min-w-[760px]"), "Legacy fixed min-w table must be replaced");
  });

  test("Screen 2 (Fundraisers): Unifies cards/table toggle into ResponsiveDataTable", () => {
    const filePath = path.join(rootDir, "app/[locale]/dashboard/fundraisers/FundraisersClient.tsx");
    assert.ok(fs.existsSync(filePath), "FundraisersClient.tsx must exist");
    const code = fs.readFileSync(filePath, "utf8");

    assert.ok(code.includes("ResponsiveDataTable"), "FundraisersClient must use ResponsiveDataTable");
    assert.ok(code.includes("ResponsiveDataRow"), "FundraisersClient must use ResponsiveDataRow");
    // Ensure legacy viewMode toggle is removed
    assert.ok(!code.includes("viewMode === \"cards\""), "Legacy cards toggle branch must be removed");
    assert.ok(!code.includes("setViewMode"), "Legacy setViewMode state must be removed");
  });

  test("Screen 3 (Attendees): Uses ResponsiveDataTable with selection & attendee details", () => {
    const filePath = path.join(rootDir, "app/[locale]/dashboard/attendees/AttendeesClient.tsx");
    assert.ok(fs.existsSync(filePath), "AttendeesClient.tsx must exist");
    const code = fs.readFileSync(filePath, "utf8");

    assert.ok(code.includes("ResponsiveDataTable"), "AttendeesClient must use ResponsiveDataTable");
    assert.ok(code.includes("ResponsiveDataRow"), "AttendeesClient must use ResponsiveDataRow");
    assert.ok(code.includes("isSelectable"), "AttendeesClient must pass isSelectable");
    assert.ok(code.includes("selectionControl"), "AttendeesClient must pass selectionControl");
  });

  test("Screen 4 (Payments / Ledger): Uses ResponsiveDataTable with status & action triggers", () => {
    const filePath = path.join(rootDir, "app/[locale]/dashboard/settings/payments/PaymentsClient.tsx");
    assert.ok(fs.existsSync(filePath), "PaymentsClient.tsx must exist");
    const code = fs.readFileSync(filePath, "utf8");

    assert.ok(code.includes("ResponsiveDataTable"), "PaymentsClient must use ResponsiveDataTable");
    assert.ok(code.includes("ResponsiveDataRow"), "PaymentsClient must use ResponsiveDataRow");
    assert.ok(code.includes("handleCancelPayout"), "PaymentsClient must preserve handleCancelPayout action");
  });

  test("Screen 5 (Admin Users): Uses ResponsiveDataTable with role badges & moderation actions", () => {
    const filePath = path.join(rootDir, "app/[locale]/admin/users/UsersClient.tsx");
    assert.ok(fs.existsSync(filePath), "UsersClient.tsx must exist");
    const code = fs.readFileSync(filePath, "utf8");

    assert.ok(code.includes("ResponsiveDataTable"), "UsersClient must use ResponsiveDataTable");
    assert.ok(code.includes("ResponsiveDataRow"), "UsersClient must use ResponsiveDataRow");
    assert.ok(code.includes("RoleBadge"), "UsersClient must render RoleBadge");
    assert.ok(code.includes("openDrawer"), "UsersClient must preserve openDrawer");
  });
});

describe("Aldriva Remaining User-Facing Responsive Data Migration (Phase 3)", () => {
  const rootDir = path.resolve(__dirname, "../../../");

  test("Phase 3 Screen 1 (Organizers): Uses ResponsiveDataTable across both trees", () => {
    for (const prefix of ["app/[locale]/dashboard/organizers", "app/dashboard/organizers"]) {
      const filePath = path.join(rootDir, `${prefix}/OrganizersClient.tsx`);
      assert.ok(fs.existsSync(filePath), `${filePath} must exist`);
      const code = fs.readFileSync(filePath, "utf8");
      assert.ok(code.includes("ResponsiveDataTable"), `${prefix} must use ResponsiveDataTable`);
      assert.ok(code.includes("ResponsiveDataRow"), `${prefix} must use ResponsiveDataRow`);
      assert.ok(code.includes("formatAdminMoney"), `${prefix} must format metrics`);
    }
  });

  test("Phase 3 Screen 2 (Donations): Uses ResponsiveDataTable across both trees", () => {
    for (const prefix of ["app/[locale]/dashboard/donations", "app/dashboard/donations"]) {
      const filePath = path.join(rootDir, `${prefix}/DonationsClient.tsx`);
      assert.ok(fs.existsSync(filePath), `${filePath} must exist`);
      const code = fs.readFileSync(filePath, "utf8");
      assert.ok(code.includes("ResponsiveDataTable"), `${prefix} must use ResponsiveDataTable`);
      assert.ok(code.includes("ResponsiveDataRow"), `${prefix} must use ResponsiveDataRow`);
      assert.ok(code.includes("formatAdminMoney"), `${prefix} must format metrics`);
    }
  });

  test("Phase 3 Screen 3 (Event Checkins): Uses ResponsiveDataTable across both trees", () => {
    for (const prefix of ["app/[locale]/dashboard/events/[id]/checkins", "app/dashboard/events/[id]/checkins"]) {
      const filePath = path.join(rootDir, `${prefix}/CheckinsClient.tsx`);
      assert.ok(fs.existsSync(filePath), `${filePath} must exist`);
      const code = fs.readFileSync(filePath, "utf8");
      assert.ok(code.includes("ResponsiveDataTable"), `${prefix} must use ResponsiveDataTable`);
      assert.ok(code.includes("ResponsiveDataRow"), `${prefix} must use ResponsiveDataRow`);
      assert.ok(code.includes("Scanner Staff"), `${prefix} must preserve scanner metrics`);
    }
  });

  test("Phase 3 Screen 4 (Event Guests): Uses ResponsiveDataTable across both trees", () => {
    for (const prefix of ["app/[locale]/dashboard/events/[id]/guests", "app/dashboard/events/[id]/guests"]) {
      const filePath = path.join(rootDir, `${prefix}/GuestsClient.tsx`);
      assert.ok(fs.existsSync(filePath), `${filePath} must exist`);
      const code = fs.readFileSync(filePath, "utf8");
      assert.ok(code.includes("ResponsiveDataTable"), `${prefix} must use ResponsiveDataTable`);
      assert.ok(code.includes("ResponsiveDataRow"), `${prefix} must use ResponsiveDataRow`);
      assert.ok(code.includes("GUEST_COLUMNS"), `${prefix} must define GUEST_COLUMNS`);
    }
  });

  test("Phase 3 Screen 5 (Products): Uses ResponsiveDataTable across both trees", () => {
    for (const prefix of ["app/[locale]/dashboard/products", "app/dashboard/products"]) {
      const filePath = path.join(rootDir, `${prefix}/page.tsx`);
      assert.ok(fs.existsSync(filePath), `${filePath} must exist`);
      const code = fs.readFileSync(filePath, "utf8");
      assert.ok(code.includes("ResponsiveDataTable"), `${prefix} must use ResponsiveDataTable`);
      assert.ok(code.includes("ResponsiveDataRow"), `${prefix} must use ResponsiveDataRow`);
      assert.ok(code.includes("PRODUCT_COLUMNS"), `${prefix} must define PRODUCT_COLUMNS`);
    }
  });

  test("Phase 3 Screen 6 (Businesses): Uses ResponsiveDataTable across both trees", () => {
    for (const prefix of ["app/[locale]/dashboard/businesses", "app/dashboard/businesses"]) {
      const filePath = path.join(rootDir, `${prefix}/page.tsx`);
      assert.ok(fs.existsSync(filePath), `${filePath} must exist`);
      const code = fs.readFileSync(filePath, "utf8");
      assert.ok(code.includes("ResponsiveDataTable"), `${prefix} must use ResponsiveDataTable`);
      assert.ok(code.includes("ResponsiveDataRow"), `${prefix} must use ResponsiveDataRow`);
      assert.ok(code.includes("BUSINESS_COLUMNS"), `${prefix} must define BUSINESS_COLUMNS`);
    }
  });

  test("Phase 3 Screen 7 (Articles): Uses ResponsiveDataTable across both trees", () => {
    for (const prefix of ["app/[locale]/dashboard/articles", "app/dashboard/articles"]) {
      const filePath = path.join(rootDir, `${prefix}/page.tsx`);
      assert.ok(fs.existsSync(filePath), `${filePath} must exist`);
      const code = fs.readFileSync(filePath, "utf8");
      assert.ok(code.includes("ResponsiveDataTable"), `${prefix} must use ResponsiveDataTable`);
      assert.ok(code.includes("ResponsiveDataRow"), `${prefix} must use ResponsiveDataRow`);
      assert.ok(code.includes("ARTICLE_COLUMNS"), `${prefix} must define ARTICLE_COLUMNS`);
    }
  });

  test("Phase 3 Screen 8 (Fundraiser Donations): Uses ResponsiveDataTable across both trees", () => {
    for (const prefix of ["app/[locale]/dashboard/fundraisers/[id]/donations", "app/dashboard/fundraisers/[id]/donations"]) {
      const filePath = path.join(rootDir, `${prefix}/DonationsClient.tsx`);
      assert.ok(fs.existsSync(filePath), `${filePath} must exist`);
      const code = fs.readFileSync(filePath, "utf8");
      assert.ok(code.includes("ResponsiveDataTable"), `${prefix} must use ResponsiveDataTable`);
      assert.ok(code.includes("ResponsiveDataRow"), `${prefix} must use ResponsiveDataRow`);
      assert.ok(code.includes("DONATION_COLUMNS"), `${prefix} must define DONATION_COLUMNS`);
      // Ensure legacy hidden sm:block / sm:hidden dual table/card split was removed
      assert.ok(!code.includes("hidden sm:block"), `${prefix} legacy dual table split must be removed`);
    }
  });

  test("Phase 3 Screen 9 (Fundraiser Donors): Uses ResponsiveDataTable across both trees", () => {
    for (const prefix of ["app/[locale]/dashboard/fundraisers/[id]/donors", "app/dashboard/fundraisers/[id]/donors"]) {
      const filePath = path.join(rootDir, `${prefix}/DonorsClient.tsx`);
      assert.ok(fs.existsSync(filePath), `${filePath} must exist`);
      const code = fs.readFileSync(filePath, "utf8");
      assert.ok(code.includes("ResponsiveDataTable"), `${prefix} must use ResponsiveDataTable`);
      assert.ok(code.includes("ResponsiveDataRow"), `${prefix} must use ResponsiveDataRow`);
      assert.ok(code.includes("DONOR_COLUMNS"), `${prefix} must define DONOR_COLUMNS`);
      // Ensure legacy hidden sm:block / sm:hidden dual table/card split was removed
      assert.ok(!code.includes("hidden sm:block"), `${prefix} legacy dual table split must be removed`);
    }
  });
});

describe("Aldriva Whole-Dashboard Completion & Admin/Tenant Verification (Phase 4)", () => {
  const rootDir = path.resolve(__dirname, "../../../");

  test("Phase 4 Admin Management Surfaces: Events & Fundraisers use ResponsiveDataTable across trees", () => {
    for (const tree of ["app", "app/[locale]"]) {
      const eventsPath = path.join(rootDir, `${tree}/admin/events/page.tsx`);
      assert.ok(fs.existsSync(eventsPath), `${eventsPath} must exist`);
      const eventsCode = fs.readFileSync(eventsPath, "utf8");
      assert.ok(eventsCode.includes("ResponsiveDataTable"), `${eventsPath} must use ResponsiveDataTable`);
      assert.ok(eventsCode.includes("ResponsiveDataRow"), `${eventsPath} must use ResponsiveDataRow`);

      const fundraisersPath = path.join(rootDir, `${tree}/admin/fundraisers/page.tsx`);
      assert.ok(fs.existsSync(fundraisersPath), `${fundraisersPath} must exist`);
      const fundraisersCode = fs.readFileSync(fundraisersPath, "utf8");
      assert.ok(fundraisersCode.includes("ResponsiveDataTable"), `${fundraisersPath} must use ResponsiveDataTable`);
      assert.ok(fundraisersCode.includes("ResponsiveDataRow"), `${fundraisersPath} must use ResponsiveDataRow`);
    }
  });

  test("Phase 4 Admin Moderation & Operational Surfaces: Businesses, Products, Articles use ResponsiveDataTable", () => {
    for (const tree of ["app", "app/[locale]"]) {
      const bizPath = path.join(rootDir, `${tree}/admin/businesses/BusinessesClient.tsx`);
      const bizReviewPath = path.join(rootDir, `${tree}/admin/businesses/review/page.tsx`);
      const prodPath = path.join(rootDir, `${tree}/admin/products/ProductsClient.tsx`);
      const artPath = path.join(rootDir, `${tree}/admin/articles/ArticlesClient.tsx`);

      for (const p of [bizPath, bizReviewPath, prodPath, artPath]) {
        assert.ok(fs.existsSync(p), `${p} must exist`);
        const code = fs.readFileSync(p, "utf8");
        assert.ok(code.includes("ResponsiveDataTable"), `${p} must use ResponsiveDataTable`);
        assert.ok(code.includes("ResponsiveDataRow"), `${p} must use ResponsiveDataRow`);
      }
    }
  });

  test("Phase 4 Admin Financial & Security Surfaces: Payouts, Payments, Organizers, Reviews, AI Rejections", () => {
    for (const tree of ["app", "app/[locale]"]) {
      const payoutsPath = path.join(rootDir, `${tree}/admin/finance/payouts/PayoutsAdminClient.tsx`);
      const paymentsPath = path.join(rootDir, `${tree}/admin/payments/page.tsx`);
      const orgPath = path.join(rootDir, `${tree}/admin/organizers/OrganizersClient.tsx`);
      const reviewsPath = path.join(rootDir, `${tree}/admin/reviews/page.tsx`);
      const aiPath = path.join(rootDir, `${tree}/admin/ai/rejections/page.tsx`);

      for (const p of [payoutsPath, paymentsPath, orgPath, reviewsPath, aiPath]) {
        assert.ok(fs.existsSync(p), `${p} must exist`);
        const code = fs.readFileSync(p, "utf8");
        assert.ok(code.includes("ResponsiveDataTable"), `${p} must use ResponsiveDataTable`);
        assert.ok(code.includes("ResponsiveDataRow"), `${p} must use ResponsiveDataRow`);
      }
    }
  });

  test("Phase 4 Tenant Organization Workspaces: [id] and [slug] routes use ResponsiveDataTable", () => {
    for (const tree of ["app", "app/[locale]"]) {
      const orgIdEvents = path.join(rootDir, `${tree}/dashboard/org/[id]/events/page.tsx`);
      const orgSlugEvents = path.join(rootDir, `${tree}/dashboard/organizations/[slug]/events/page.tsx`);
      const orgIdFundraisers = path.join(rootDir, `${tree}/dashboard/org/[id]/fundraisers/page.tsx`);
      const orgSlugFundraisers = path.join(rootDir, `${tree}/dashboard/organizations/[slug]/fundraisers/page.tsx`);
      const orgIdProducts = path.join(rootDir, `${tree}/dashboard/org/[id]/products/page.tsx`);
      const orgSlugProducts = path.join(rootDir, `${tree}/dashboard/organizations/[slug]/products/page.tsx`);
      const orgIdBlog = path.join(rootDir, `${tree}/dashboard/org/[id]/blog/page.tsx`);
      const orgSlugBlog = path.join(rootDir, `${tree}/dashboard/organizations/[slug]/blog/page.tsx`);

      for (const p of [orgIdEvents, orgSlugEvents, orgIdFundraisers, orgSlugFundraisers, orgIdProducts, orgSlugProducts, orgIdBlog, orgSlugBlog]) {
        assert.ok(fs.existsSync(p), `${p} must exist`);
        const code = fs.readFileSync(p, "utf8");
        assert.ok(code.includes("ResponsiveDataTable"), `${p} must use ResponsiveDataTable`);
        assert.ok(code.includes("ResponsiveDataRow"), `${p} must use ResponsiveDataRow`);
      }
    }
  });
});

