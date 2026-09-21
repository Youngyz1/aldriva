/**
 * lib/entity-authz.ts — Centralized per-entity server-side guards.
 * Each helper is entity-specific; do not merge into generic (type,id) to preserve divergent ownership models.
 */
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkTenantAccess, getEntityRole, type EntityRole } from "@/lib/entity-auth";
import { getCurrentUser } from "@/lib/auth";

const supabaseAdmin = createSupabaseAdmin();

export type AuthzResult = { ok: true; userId: string; role?: EntityRole | null } | { ok: false; error: string; status: 401 | 403 | 404 };

async function requireUser(): Promise<{ userId: string } | { error: string; status: 401 }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated", status: 401 };
  return { userId: user.id };
}

export async function assertCanManageOrganizer(organizerId: string, allowed: EntityRole[] = ["owner","admin","manager","editor","finance","viewer"]): Promise<AuthzResult> {
  const u = await requireUser();
  if ("error" in u) return { ok: false, error: u.error, status: 401 };
  const res = await checkTenantAccess(u.userId, organizerId, allowed);
  if (!res.hasAccess) return { ok: false, error: "Forbidden", status: 403 };
  return { ok: true, userId: u.userId, role: res.role };
}

export async function assertCanManageEvent(eventId: string, opts: { requireManager?: boolean } = {}): Promise<AuthzResult & { event?: { id: string; organizer_id: string | null; user_id: string } }> {
  const u = await requireUser();
  if ("error" in u) return { ok: false, error: u.error, status: 401 };
  const { data: event, error } = await supabaseAdmin.from("events").select("id, user_id, organizer_id").eq("id", eventId).maybeSingle();
  if (error || !event) return { ok: false, error: "Not found", status: 404 };
  // 1) Direct owner
  if (event.user_id === u.userId) return { ok: true, userId: u.userId, event } as const;
  // 2) Organizer delegation
  if (event.organizer_id) {
    const r = await checkTenantAccess(u.userId, event.organizer_id, ["owner","admin","manager","editor"]);
    // scanner/checkin are NOT granted full management; requireManager restricts to owner/admin/manager
    if (r.hasAccess && (!opts.requireManager || ["owner","admin","manager"].includes(r.role!))) {
      return { ok: true, userId: u.userId, role: r.role, event } as const;
    }
    // also allow event_team member with manager role for management
    const { data: team } = await supabaseAdmin.from("event_team_members").select("role").eq("event_id", eventId).eq("user_id", u.userId).maybeSingle();
    if (team && ["owner","manager"].includes(team.role)) return { ok: true, userId: u.userId, role: team.role as EntityRole, event } as const;
  } else {
    // orphan event with no organizer: still check event_team
    const { data: team } = await supabaseAdmin.from("event_team_members").select("role").eq("event_id", eventId).eq("user_id", u.userId).maybeSingle();
    if (team && ["owner","manager"].includes(team.role)) return { ok: true, userId: u.userId, event } as const;
  }
  return { ok: false, error: "Forbidden", status: 403 };
}

export async function assertCanAccessEventScan(eventId: string): Promise<AuthzResult> {
  const u = await requireUser();
  if ("error" in u) return { ok: false, error: u.error, status: 401 };
  const { data: event } = await supabaseAdmin.from("events").select("id, user_id, organizer_id").eq("id", eventId).maybeSingle();
  if (!event) return { ok: false, error: "Not found", status: 404 };
  if (event.user_id === u.userId) return { ok: true, userId: u.userId };
  if (event.organizer_id) {
    const r = await checkTenantAccess(u.userId, event.organizer_id, ["owner","admin","manager","editor","finance","viewer"]);
    if (r.hasAccess) return { ok: true, userId: u.userId };
  }
  const { data: team } = await supabaseAdmin.from("event_team_members").select("role").eq("event_id", eventId).eq("user_id", u.userId).maybeSingle();
  if (team && ["owner","manager","scanner","checkin"].includes(team.role)) return { ok: true, userId: u.userId };
  return { ok: false, error: "Forbidden", status: 403 };
}

export async function assertCanManageFundraiser(fundraiserId: string): Promise<AuthzResult> {
  const u = await requireUser();
  if ("error" in u) return { ok: false, error: u.error, status: 401 };
  const { data: f } = await supabaseAdmin.from("fundraisers").select("id, user_id, organizer_id").eq("id", fundraiserId).maybeSingle();
  if (!f) return { ok: false, error: "Not found", status: 404 };
  if (f.user_id === u.userId) return { ok: true, userId: u.userId };
  if (f.organizer_id) {
    const r = await checkTenantAccess(u.userId, f.organizer_id, ["owner","admin","manager","editor"]);
    if (r.hasAccess) return { ok: true, userId: u.userId, role: r.role };
  }
  return { ok: false, error: "Forbidden", status: 403 };
}

export async function assertCanManageBusiness(businessId: string): Promise<AuthzResult> {
  const u = await requireUser();
  if ("error" in u) return { ok: false, error: u.error, status: 401 };
  const { data: b } = await supabaseAdmin.from("businesses").select("id, owner_id, organizer_id").eq("id", businessId).maybeSingle();
  if (!b) return { ok: false, error: "Not found", status: 404 };
  if (b.owner_id === u.userId) return { ok: true, userId: u.userId };
  if (b.organizer_id) {
    const r = await checkTenantAccess(u.userId, b.organizer_id, ["owner","admin","manager","editor"]);
    if (r.hasAccess) return { ok: true, userId: u.userId, role: r.role };
  }
  return { ok: false, error: "Forbidden", status: 403 };
}

export async function assertCanManageArticle(articleId: string): Promise<AuthzResult> {
  const u = await requireUser();
  if ("error" in u) return { ok: false, error: u.error, status: 401 };
  const { data: a } = await supabaseAdmin.from("articles").select("id, owner_id, organizer_id").eq("id", articleId).maybeSingle();
  if (!a) return { ok: false, error: "Not found", status: 404 };
  if (a.owner_id === u.userId) return { ok: true, userId: u.userId };
  if (a.organizer_id) {
    const r = await checkTenantAccess(u.userId, a.organizer_id, ["owner","admin","manager","editor"]);
    if (r.hasAccess) return { ok: true, userId: u.userId, role: r.role };
  }
  return { ok: false, error: "Forbidden", status: 403 };
}

export async function assertCanManageProduct(productId: string): Promise<AuthzResult> {
  const u = await requireUser();
  if ("error" in u) return { ok: false, error: u.error, status: 401 };
  const { data: p } = await supabaseAdmin.from("products").select("id, owner_id, business_id").eq("id", productId).maybeSingle();
  if (!p) return { ok: false, error: "Not found", status: 404 };
  if (p.owner_id === u.userId) return { ok: true, userId: u.userId };
  if (p.business_id) {
    const r = await assertCanManageBusiness(p.business_id);
    if (r.ok) return { ok: true, userId: u.userId };
  }
  return { ok: false, error: "Forbidden", status: 403 };
}
