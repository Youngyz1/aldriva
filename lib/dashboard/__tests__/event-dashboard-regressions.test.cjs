const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;
const mockDashboardContext = {
  supabaseAdmin: null,
};

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
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
require.extensions[".tsx"] = require.extensions[".ts"];

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

Module._load = function loadMocks(request, parent, isMain) {
  if (request === "@/lib/dashboard-context") {
    return mockDashboardContext;
  }
  return originalLoad.call(this, request, parent, isMain);
};

class FakeSupabaseQuery {
  constructor(table, rows, log) {
    this.table = table;
    this.rows = rows;
    this.log = log;
    this.filters = [];
    this.selectArgs = null;
  }

  select(...args) {
    this.selectArgs = args;
    return this;
  }

  eq(field, value) {
    this.filters.push({ op: "eq", field, value });
    return this;
  }

  in(field, values) {
    this.filters.push({ op: "in", field, values });
    return this;
  }

  gte(field, value) {
    this.filters.push({ op: "gte", field, value });
    return this;
  }

  maybeSingle() {
    return this.execute().then((result) => ({
      ...result,
      data: result.data[0] ?? null,
    }));
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  execute() {
    this.log.push({
      table: this.table,
      filters: this.filters.map((filter) => ({ ...filter })),
      selectArgs: this.selectArgs,
    });

    const data = this.filters.reduce((rows, filter) => {
      if (filter.op === "eq") {
        return rows.filter((row) => row[filter.field] === filter.value);
      }
      if (filter.op === "in") {
        return rows.filter((row) => filter.values.includes(row[filter.field]));
      }
      if (filter.op === "gte") {
        return rows.filter((row) => new Date(row[filter.field]) >= new Date(filter.value));
      }
      return rows;
    }, this.rows);

    return Promise.resolve({ data, error: null });
  }
}

function createFakeSupabase(tables) {
  const log = [];
  return {
    log,
    from(table) {
      return new FakeSupabaseQuery(table, tables[table] ?? [], log);
    },
  };
}

function event(overrides) {
  return {
    id: "event-id",
    title: "Event",
    slug: "event",
    event_date: "2026-09-01T00:00:00.000Z",
    status: "approved",
    visibility: "public",
    created_at: "2026-08-01T00:00:00.000Z",
    organizer_id: "organizer-id",
    user_id: "organizer-user",
    ...overrides,
  };
}

const {
  canShowEventPublicPage,
  getEventSubNavTabs,
} = require("@/lib/event-dashboard-navigation");
const {
  canSelectDashboardEventForBulk,
  getDashboardEventActionIds,
} = require("@/lib/dashboard-event-actions");

test("EventSubNav role matrix matches event-team access expectations", () => {
  assert.deepEqual(
    getEventSubNavTabs("evt_1", "ticket_scanner").map((tab) => tab.id),
    ["scan"]
  );
  assert.equal(canShowEventPublicPage("ticket_scanner", "public-slug"), false);

  assert.deepEqual(
    getEventSubNavTabs("evt_1", "event_manager").map((tab) => tab.id),
    ["operations", "checkins", "scan", "guests", "seating", "team"]
  );
  assert.equal(canShowEventPublicPage("event_manager", "public-slug"), false);

  assert.deepEqual(
    getEventSubNavTabs("evt_1", "owner").map((tab) => tab.id),
    ["operations", "checkins", "scan", "guests", "seating", "team", "edit"]
  );
  assert.equal(canShowEventPublicPage("owner", "public-slug"), true);
});

test("ticket_scanner dashboard event actions exclude edit, delete, and bulk selection", () => {
  const scannerActions = getDashboardEventActionIds("ticket_scanner");

  assert.deepEqual(scannerActions, ["scan"]);
  assert.equal(scannerActions.includes("edit"), false);
  assert.equal(scannerActions.includes("delete"), false);
  assert.equal(canSelectDashboardEventForBulk({ user_role: "ticket_scanner" }), false);
});

test("queryDashboardEvents returns only events the scanner is assigned to", async () => {
  mockDashboardContext.supabaseAdmin = createFakeSupabase({
    events: [
      event({ id: "assigned-event", organizer_id: "org_a", title: "Assigned Event" }),
      event({ id: "unrelated-event", organizer_id: "org_b", title: "Unrelated Event" }),
    ],
    event_team_members: [
      {
        event_id: "assigned-event",
        user_id: "scanner-user",
        role: "ticket_scanner",
        status: "active",
      },
    ],
    ticket_orders: [],
  });

  const { queryDashboardEvents } = require("@/lib/dashboard-data");
  const result = await queryDashboardEvents({
    userId: "scanner-user",
    organizerIds: [],
    page: 1,
    perPage: 25,
  });

  assert.deepEqual(result.items.map((row) => row.id), ["assigned-event"]);
  assert.equal(result.items[0].user_role, "ticket_scanner");
  assert.equal(result.items[0].is_staff, true);
});

test("queryDashboardEvents deduplicates events when a user is organizer and team member", async () => {
  mockDashboardContext.supabaseAdmin = createFakeSupabase({
    events: [
      event({ id: "owned-event", organizer_id: "org_owned", title: "Owned Event" }),
      event({ id: "other-staff-event", organizer_id: "org_other", title: "Other Staff Event" }),
    ],
    event_team_members: [
      {
        event_id: "owned-event",
        user_id: "owner-user",
        role: "ticket_scanner",
        status: "active",
      },
    ],
    ticket_orders: [],
  });

  const { queryDashboardEvents } = require("@/lib/dashboard-data");
  const result = await queryDashboardEvents({
    userId: "owner-user",
    organizerIds: ["org_owned"],
    page: 1,
    perPage: 25,
  });

  assert.deepEqual(result.items.map((row) => row.id), ["owned-event"]);
  assert.equal(result.items[0].user_role, "owner");
});

test("organizer common case uses indexed membership lookup and skips staff event fetch when empty", async () => {
  const supabase = createFakeSupabase({
    events: [event({ id: "owned-event", organizer_id: "org_owned" })],
    event_team_members: [],
    ticket_orders: [],
  });
  mockDashboardContext.supabaseAdmin = supabase;

  const { queryDashboardEvents } = require("@/lib/dashboard-data");
  await queryDashboardEvents({
    userId: "owner-user",
    organizerIds: ["org_owned"],
    page: 1,
    perPage: 25,
  });

  const membershipQuery = supabase.log.find((entry) => entry.table === "event_team_members");
  assert.ok(membershipQuery);
  assert.deepEqual(
    membershipQuery.filters.filter((filter) => filter.op === "eq").map((filter) => [
      filter.field,
      filter.value,
    ]),
    [
      ["user_id", "owner-user"],
      ["status", "active"],
    ]
  );

  const staffEventFetches = supabase.log.filter(
    (entry) =>
      entry.table === "events" &&
      entry.filters.some((filter) => filter.op === "in" && filter.field === "id")
  );
  assert.equal(staffEventFetches.length, 0);
});
