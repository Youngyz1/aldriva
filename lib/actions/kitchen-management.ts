"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { checkTenantAccess } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { generateWorkerToken, hashWorkerToken } from "@/lib/kitchen/worker-session";
import { getCookInvitationState, isValidWorkerPhone } from "@/lib/kitchen/worker-validation";

const MANAGE_ROLES = ["owner", "admin", "manager"] as const;
const INVITE_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;

type ScopeResult =
  | { ok: true; admin: ReturnType<typeof createSupabaseAdmin>; userId: string }
  | { ok: false; error: "unauthorized" | "forbidden" };

async function authorizeBusiness(organizerId: string, businessId: string): Promise<ScopeResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "unauthorized" };

  // This is the same owner/admin/manager check as updateOrderStatus.
  const access = await checkTenantAccess(user.id, organizerId, [...MANAGE_ROLES]);
  if (!access.hasAccess) return { ok: false, error: "forbidden" };

  const admin = createSupabaseAdmin();
  const { data: business, error } = await admin
    .from("businesses")
    .select("id, organizer_id")
    .eq("id", businessId)
    .eq("organizer_id", organizerId)
    .maybeSingle();
  if (error || !business) return { ok: false, error: "forbidden" };

  return { ok: true, admin, userId: user.id };
}

async function authorizeOrganizer(organizerId: string): Promise<ScopeResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "unauthorized" };
  const access = await checkTenantAccess(user.id, organizerId, [...MANAGE_ROLES]);
  if (!access.hasAccess) return { ok: false, error: "forbidden" };
  return { ok: true, admin: createSupabaseAdmin(), userId: user.id };
}

async function authorizeCook(organizerId: string, workerId: string) {
  const base = await authorizeOrganizer(organizerId);
  if (!base.ok) return base;
  const { data: worker, error } = await base.admin
    .from("business_workers")
    .select("id, business_id, kitchen_id, is_active, deactivated_at")
    .eq("id", workerId)
    .eq("role", "cook")
    .maybeSingle();
  if (error || !worker) return { ok: false as const, error: "forbidden" as const };
  const scope = await authorizeBusiness(organizerId, worker.business_id);
  if (!scope.ok) return scope;
  return { ...scope, worker };
}

async function authorizeKitchen(organizerId: string, kitchenId: string) {
  const base = await authorizeOrganizer(organizerId);
  if (!base.ok) return base;
  const { data: kitchen, error } = await base.admin
    .from("business_kitchens")
    .select("id, business_id")
    .eq("id", kitchenId)
    .maybeSingle();
  if (error || !kitchen) return { ok: false as const, error: "forbidden" as const };
  const scope = await authorizeBusiness(organizerId, kitchen.business_id);
  if (!scope.ok) return scope;
  return { ...scope, kitchen };
}

function revalidateKitchenPage(organizerId: string) {
  revalidatePath(`/dashboard/org/${organizerId}/kitchen`);
}

async function ensureKitchen(admin: ReturnType<typeof createSupabaseAdmin>, businessId: string) {
  return admin
    .from("business_kitchens")
    .upsert({ business_id: businessId }, { onConflict: "business_id" })
    .select("id, business_id")
    .single();
}

export async function getKitchenManagementData(organizerId: string) {
  const scope = await authorizeOrganizer(organizerId);
  if (!scope.ok) return { ok: false as const, error: scope.error, businesses: [] };

  const { data: businesses, error: businessError } = await scope.admin
    .from("businesses")
    .select("id, name")
    .eq("organizer_id", organizerId)
    .order("name");
  if (businessError) return { ok: false as const, error: "unavailable" as const, businesses: [] };

  const businessIds = (businesses ?? []).map((business: { id: string }) => business.id);
  if (businessIds.length === 0) return { ok: true as const, businesses: [] };

  const { data: kitchens, error: kitchenError } = await scope.admin
    .from("business_kitchens")
    .select("id, business_id")
    .in("business_id", businessIds);
  if (kitchenError) return { ok: false as const, error: "unavailable" as const, businesses: [] };

  const kitchenIds = (kitchens ?? []).map((kitchen: { id: string }) => kitchen.id);
  const [workersResult, displayResult] = await Promise.all([
    scope.admin
      .from("business_workers")
      .select("id, business_id, kitchen_id, full_name, phone, whatsapp_number, is_active, deactivated_at")
      .in("business_id", businessIds)
      .eq("role", "cook"),
    kitchenIds.length
      ? scope.admin
          .from("business_kitchen_display_links")
          .select("id, kitchen_id, created_at, revoked_at")
          .in("kitchen_id", kitchenIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (workersResult.error || displayResult.error) {
    return { ok: false as const, error: "unavailable" as const, businesses: [] };
  }

  const workers = workersResult.data ?? [];
  const workerIds = workers.map((worker: { id: string }) => worker.id);
  const invitationsResult = workerIds.length
    ? await scope.admin
        .from("business_worker_invitations")
        .select("id, worker_id, expires_at, token_consumed_at, accepted_at, revoked_at")
        .in("worker_id", workerIds)
    : { data: [], error: null };
  if (invitationsResult.error) return { ok: false as const, error: "unavailable" as const, businesses: [] };

  const kitchensByBusiness = new Map((kitchens ?? []).map((kitchen: any) => [kitchen.business_id, kitchen]));
  const invitationByWorker = new Map((invitationsResult.data ?? []).map((invite: any) => [invite.worker_id, invite]));
  const displayByKitchen = new Map((displayResult.data ?? []).map((link: any) => [link.kitchen_id, link]));

  return {
    ok: true as const,
    businesses: (businesses ?? []).map((business: any) => {
      const kitchen: any = kitchensByBusiness.get(business.id) ?? null;
      return {
        id: business.id,
        name: business.name,
        kitchen: kitchen
          ? {
              id: kitchen.id,
              displayLink: (() => {
                const link: any = displayByKitchen.get(kitchen.id);
                return link ? { exists: true, revoked: Boolean(link.revoked_at), createdAt: link.created_at } : null;
              })(),
            }
          : null,
        cooks: workers
          .filter((worker: any) => worker.business_id === business.id)
          .map((worker: any) => {
            const invitation: any = invitationByWorker.get(worker.id) ?? null;
            return {
              id: worker.id,
              fullName: worker.full_name,
              phone: worker.phone,
              whatsappNumber: worker.whatsapp_number,
              active: worker.is_active && !worker.deactivated_at,
              invitationState: getCookInvitationState(invitation),
              expiresAt: invitation?.expires_at ?? null,
            };
          }),
      };
    }),
  };
}

export async function createKitchen(organizerId: string, businessId: string) {
  const scope = await authorizeBusiness(organizerId, businessId);
  if (!scope.ok) return { ok: false as const, error: scope.error };
  const { error } = await ensureKitchen(scope.admin, businessId);
  if (error) return { ok: false as const, error: "unavailable" as const };
  revalidateKitchenPage(organizerId);
  return { ok: true as const };
}

export async function inviteCook(
  organizerId: string,
  businessId: string,
  input: { fullName: string; phone: string; whatsappNumber: string }
) {
  const scope = await authorizeBusiness(organizerId, businessId);
  if (!scope.ok) return { ok: false as const, error: scope.error };

  const fullName = input.fullName.trim();
  if (fullName.length < 1 || fullName.length > 100) return { ok: false as const, error: "invalid_name" as const };
  if (!isValidWorkerPhone(input.phone) || !isValidWorkerPhone(input.whatsappNumber)) {
    return { ok: false as const, error: "invalid_phone" as const };
  }

  const kitchenResult = await ensureKitchen(scope.admin, businessId);
  if (kitchenResult.error || !kitchenResult.data) return { ok: false as const, error: "unavailable" as const };

  const { data: worker, error: workerError } = await scope.admin
    .from("business_workers")
    .insert({
      business_id: businessId,
      kitchen_id: kitchenResult.data.id,
      role: "cook",
      full_name: fullName,
      phone: input.phone.trim(),
      whatsapp_number: input.whatsappNumber.trim(),
      is_active: true,
      deactivated_at: null,
    })
    .select("id")
    .single();
  if (workerError || !worker) return { ok: false as const, error: "unavailable" as const };

  const token = generateWorkerToken();
  const now = new Date();
  const { error: invitationError } = await scope.admin
    .from("business_worker_invitations")
    .insert({
      worker_id: worker.id,
      token_hash: hashWorkerToken(token),
      expires_at: new Date(now.getTime() + INVITE_LIFETIME_MS).toISOString(),
      token_consumed_at: null,
      accepted_at: null,
      revoked_at: null,
    });
  if (invitationError) {
    await scope.admin
      .from("business_workers")
      .update({ is_active: false, deactivated_at: now.toISOString(), updated_at: now.toISOString() })
      .eq("id", worker.id)
      .eq("business_id", businessId);
    return { ok: false as const, error: "unavailable" as const };
  }

  revalidateKitchenPage(organizerId);
  // The plaintext token is returned once to the component and is never stored.
  return { ok: true as const, token, path: "/kitchen/accept" };
}

export async function resendCookInvitation(organizerId: string, workerId: string) {
  const scope = await authorizeCook(organizerId, workerId);
  if (!scope.ok) return { ok: false as const, error: scope.error };
  if (!scope.worker.is_active || scope.worker.deactivated_at) return { ok: false as const, error: "inactive" as const };

  const { data: invitation, error: invitationReadError } = await scope.admin
    .from("business_worker_invitations")
    .select("id")
    .eq("worker_id", workerId)
    .maybeSingle();
  if (invitationReadError || !invitation) return { ok: false as const, error: "unavailable" as const };

  const now = new Date();
  const { error: sessionsError } = await scope.admin
    .from("business_worker_sessions")
    .update({ revoked_at: now.toISOString(), updated_at: now.toISOString() })
    .eq("worker_id", workerId)
    .is("revoked_at", null);
  if (sessionsError) return { ok: false as const, error: "unavailable" as const };

  const token = generateWorkerToken();
  const { error: rotateError } = await scope.admin
    .from("business_worker_invitations")
    .update({
      token_hash: hashWorkerToken(token),
      expires_at: new Date(now.getTime() + INVITE_LIFETIME_MS).toISOString(),
      token_consumed_at: null,
      accepted_at: null,
      // Resend intentionally reactivates this invitation row after rotating.
      revoked_at: null,
      updated_at: now.toISOString(),
    })
    .eq("id", invitation.id)
    .eq("worker_id", workerId);
  if (rotateError) return { ok: false as const, error: "unavailable" as const };

  revalidateKitchenPage(organizerId);
  return { ok: true as const, token, path: "/kitchen/accept" };
}

export async function revokeCookInvitation(organizerId: string, workerId: string) {
  const scope = await authorizeCook(organizerId, workerId);
  if (!scope.ok) return { ok: false as const, error: scope.error };
  const now = new Date().toISOString();
  const { error: invitationError } = await scope.admin
    .from("business_worker_invitations")
    .update({ revoked_at: now, updated_at: now })
    .eq("worker_id", workerId)
    .is("revoked_at", null);
  const { error: sessionsError } = await scope.admin
    .from("business_worker_sessions")
    .update({ revoked_at: now, updated_at: now })
    .eq("worker_id", workerId)
    .is("revoked_at", null);
  if (invitationError || sessionsError) return { ok: false as const, error: "unavailable" as const };
  revalidateKitchenPage(organizerId);
  return { ok: true as const };
}

export async function deactivateCook(organizerId: string, workerId: string) {
  const scope = await authorizeCook(organizerId, workerId);
  if (!scope.ok) return { ok: false as const, error: scope.error };
  const now = new Date().toISOString();
  const { error: workerError } = await scope.admin
    .from("business_workers")
    .update({ is_active: false, deactivated_at: now, updated_at: now })
    .eq("id", workerId)
    .eq("business_id", scope.worker.business_id)
    .eq("role", "cook");
  if (workerError) return { ok: false as const, error: "unavailable" as const };

  // Also issue the revocations explicitly; the migration trigger is a second
  // safety net and catches deactivation outside this owner action.
  const [invitationResult, sessionResult] = await Promise.all([
    scope.admin
      .from("business_worker_invitations")
      .update({ revoked_at: now, updated_at: now })
      .eq("worker_id", workerId)
      .is("revoked_at", null),
    scope.admin
      .from("business_worker_sessions")
      .update({ revoked_at: now, updated_at: now })
      .eq("worker_id", workerId)
      .is("revoked_at", null),
  ]);
  if (invitationResult.error || sessionResult.error) return { ok: false as const, error: "unavailable" as const };
  revalidateKitchenPage(organizerId);
  return { ok: true as const };
}

export async function regenerateKitchenDisplayLink(organizerId: string, kitchenId: string) {
  const scope = await authorizeKitchen(organizerId, kitchenId);
  if (!scope.ok) return { ok: false as const, error: scope.error };
  const token = generateWorkerToken();
  const { error } = await scope.admin
    .from("business_kitchen_display_links")
    .upsert(
      { kitchen_id: kitchenId, token_hash: hashWorkerToken(token), revoked_at: null, updated_at: new Date().toISOString() },
      { onConflict: "kitchen_id" }
    );
  if (error) return { ok: false as const, error: "unavailable" as const };
  revalidateKitchenPage(organizerId);
  return { ok: true as const, token, path: "/kitchen/display" };
}

export async function revokeKitchenDisplayLink(organizerId: string, kitchenId: string) {
  const scope = await authorizeKitchen(organizerId, kitchenId);
  if (!scope.ok) return { ok: false as const, error: scope.error };
  const { error } = await scope.admin
    .from("business_kitchen_display_links")
    .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("kitchen_id", kitchenId)
    .is("revoked_at", null);
  if (error) return { ok: false as const, error: "unavailable" as const };
  revalidateKitchenPage(organizerId);
  return { ok: true as const };
}
