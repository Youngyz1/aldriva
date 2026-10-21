"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { checkTenantAccess } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { generateWorkerToken, hashWorkerToken } from "@/lib/kitchen/worker-session";
import { getCookInvitationState, isValidWorkerPhone as validateWorkerPhone } from "@/lib/kitchen/worker-validation";

const MANAGE_ROLES = ["owner", "admin", "manager"] as const;
const INVITE_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;

type CourierState = "Offline" | "Available" | "On delivery" | "Offline, delivery in progress";
type ScopeResult =
  | { ok: true; admin: ReturnType<typeof createSupabaseAdmin> }
  | { ok: false; error: "unauthorized" | "forbidden" };

function revalidateCourierPages(organizerId: string) {
  revalidatePath(`/dashboard/org/${organizerId}/kitchen`);
  revalidatePath(`/dashboard/org/${organizerId}/orders`);
}

async function authorizeOrganizer(organizerId: string): Promise<ScopeResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "unauthorized" };
  const access = await checkTenantAccess(user.id, organizerId, [...MANAGE_ROLES]);
  if (!access.hasAccess) return { ok: false, error: "forbidden" };
  return { ok: true, admin: createSupabaseAdmin() };
}

async function authorizeBusiness(organizerId: string, businessId: string) {
  const scope = await authorizeOrganizer(organizerId);
  if (!scope.ok) return scope;
  const { data: business, error } = await scope.admin
    .from("businesses")
    .select("id, name, organizer_id")
    .eq("id", businessId)
    .eq("organizer_id", organizerId)
    .maybeSingle();
  if (error || !business) return { ok: false as const, error: "forbidden" as const };
  return { ...scope, business };
}

async function authorizeCourier(organizerId: string, workerId: string) {
  const base = await authorizeOrganizer(organizerId);
  if (!base.ok) return base;
  const { data: worker, error } = await base.admin
    .from("business_workers")
    .select("id, business_id, full_name, phone, whatsapp_number, role, is_active, deactivated_at, is_available, updated_at")
    .eq("id", workerId)
    .eq("role", "courier")
    .maybeSingle();
  if (error || !worker) return { ok: false as const, error: "forbidden" as const };
  const scope = await authorizeBusiness(organizerId, worker.business_id);
  if (!scope.ok) return scope;
  return { ...scope, worker };
}

function derivedState(isAvailable: boolean, hasActiveOrder: boolean): CourierState {
  if (hasActiveOrder) return isAvailable ? "On delivery" : "Offline, delivery in progress";
  return isAvailable ? "Available" : "Offline";
}

async function rotateCourierInvitation(admin: ReturnType<typeof createSupabaseAdmin>, workerId: string) {
  const now = new Date();
  const token = generateWorkerToken();
  const [sessionResult, invitationResult] = await Promise.all([
    admin
      .from("business_worker_sessions")
      .update({ revoked_at: now.toISOString(), updated_at: now.toISOString() })
      .eq("worker_id", workerId)
      .is("revoked_at", null),
    admin
      .from("business_worker_invitations")
      .upsert(
        {
          worker_id: workerId,
          token_hash: hashWorkerToken(token),
          expires_at: new Date(now.getTime() + INVITE_LIFETIME_MS).toISOString(),
          token_consumed_at: null,
          accepted_at: null,
          revoked_at: null,
          updated_at: now.toISOString(),
        },
        { onConflict: "worker_id" }
      ),
  ]);
  return sessionResult.error || invitationResult.error ? null : token;
}

export async function getCourierManagementData(organizerId: string) {
  const scope = await authorizeOrganizer(organizerId);
  if (!scope.ok) return { ok: false as const, error: scope.error, businesses: [] };

  const { data: businesses, error: businessError } = await scope.admin
    .from("businesses")
    .select("id, name")
    .eq("organizer_id", organizerId)
    .order("name");
  if (businessError) return { ok: false as const, error: "unavailable" as const, businesses: [] };
  const businessRows = businesses ?? [];
  if (!businessRows.length) return { ok: true as const, businesses: [] };

  const businessIds = businessRows.map((business) => business.id);
  const { data: workers, error: workerError } = await scope.admin
    .from("business_workers")
    .select("id, business_id, full_name, phone, whatsapp_number, is_active, deactivated_at, is_available")
    .in("business_id", businessIds)
    .eq("role", "courier")
    .order("full_name");
  if (workerError) return { ok: false as const, error: "unavailable" as const, businesses: [] };
  const workerRows = workers ?? [];
  const workerIds = workerRows.map((worker) => worker.id);
  const [invitationsResult, activeOrdersResult] = workerIds.length
    ? await Promise.all([
        scope.admin
          .from("business_worker_invitations")
          .select("worker_id, expires_at, token_consumed_at, accepted_at, revoked_at")
          .in("worker_id", workerIds),
        scope.admin
          .from("orders")
          .select("courier_worker_id")
          .in("courier_worker_id", workerIds)
          .eq("status", "out_for_delivery"),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (invitationsResult.error || activeOrdersResult.error) {
    return { ok: false as const, error: "unavailable" as const, businesses: [] };
  }

  const invitations = new Map((invitationsResult.data ?? []).map((invitation) => [invitation.worker_id, invitation]));
  const busyIds = new Set((activeOrdersResult.data ?? []).map((order) => order.courier_worker_id));
  return {
    ok: true as const,
    businesses: businessRows.map((business) => ({
      id: business.id,
      name: business.name,
      couriers: workerRows
        .filter((worker) => worker.business_id === business.id)
        .map((worker) => {
          const invitation = invitations.get(worker.id);
          const hasActiveOrder = busyIds.has(worker.id);
          const isActive = worker.is_active === true && worker.deactivated_at == null;
          return {
            id: worker.id,
            fullName: worker.full_name,
            phone: worker.phone,
            whatsappNumber: worker.whatsapp_number,
            active: isActive,
            isAvailable: worker.is_available === true,
            hasActiveOrder,
            state: derivedState(worker.is_available === true, hasActiveOrder),
            invitationState: getCookInvitationState(invitation),
            expiresAt: invitation?.expires_at ?? null,
          };
        }),
    })),
  };
}

export async function listCouriersForAssignment(organizerId: string) {
  const result = await getCourierManagementData(organizerId);
  if (!result.ok) return result;
  return {
    ok: true as const,
    couriers: result.businesses.flatMap((business) => business.couriers
      .filter((courier) => courier.active)
      .map((courier) => ({
        id: courier.id,
        businessId: business.id,
        fullName: courier.fullName,
        phone: courier.phone,
        isAvailable: courier.isAvailable,
        hasActiveOrder: courier.hasActiveOrder,
        state: courier.state,
      }))),
  };
}

export async function createCourier(input: {
  organizerId: string;
  businessId: string;
  fullName: string;
  phone: string;
  whatsappNumber: string;
}) {
  const scope = await authorizeBusiness(input.organizerId, input.businessId);
  if (!scope.ok) return { ok: false as const, error: scope.error };
  const fullName = input.fullName.trim();
  if (!fullName || fullName.length > 100) return { ok: false as const, error: "invalid_name" as const };
  if (!validateWorkerPhone(input.phone) || !validateWorkerPhone(input.whatsappNumber)) {
    return { ok: false as const, error: "invalid_phone" as const };
  }

  const { data: worker, error } = await scope.admin
    .from("business_workers")
    .insert({
      business_id: input.businessId,
      kitchen_id: null,
      full_name: fullName,
      phone: input.phone.trim(),
      whatsapp_number: input.whatsappNumber.trim(),
      role: "courier",
      is_active: true,
      deactivated_at: null,
      is_available: false,
    })
    .select("id")
    .single();
  if (error || !worker) return { ok: false as const, error: "unavailable" as const };
  const token = await rotateCourierInvitation(scope.admin, worker.id);
  if (!token) return { ok: false as const, error: "unavailable" as const };
  revalidateCourierPages(input.organizerId);
  return { ok: true as const, workerId: worker.id, token, path: "/courier/accept" };
}

export async function inviteCourier(organizerId: string, workerId: string) {
  const scope = await authorizeCourier(organizerId, workerId);
  if (!scope.ok) return { ok: false as const, error: scope.error };
  if (!scope.worker.is_active || scope.worker.deactivated_at) return { ok: false as const, error: "inactive" as const };
  const token = await rotateCourierInvitation(scope.admin, workerId);
  if (!token) return { ok: false as const, error: "unavailable" as const };
  revalidateCourierPages(organizerId);
  return { ok: true as const, token, path: "/courier/accept" };
}

export async function resendCourierInvitation(organizerId: string, workerId: string) {
  return inviteCourier(organizerId, workerId);
}

export async function revokeCourierInvitation(organizerId: string, workerId: string) {
  const scope = await authorizeCourier(organizerId, workerId);
  if (!scope.ok) return { ok: false as const, error: scope.error };
  const now = new Date().toISOString();
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
  revalidateCourierPages(organizerId);
  return { ok: true as const };
}

export async function deactivateCourier(organizerId: string, workerId: string) {
  const scope = await authorizeCourier(organizerId, workerId);
  if (!scope.ok) return { ok: false as const, error: scope.error };
  const now = new Date().toISOString();
  const { error: workerError } = await scope.admin
    .from("business_workers")
    .update({ is_active: false, deactivated_at: now, is_available: false, updated_at: now })
    .eq("id", workerId)
    .eq("business_id", scope.worker.business_id)
    .eq("role", "courier");
  if (workerError) return { ok: false as const, error: "unavailable" as const };

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
  revalidateCourierPages(organizerId);
  return { ok: true as const };
}

export async function reactivateCourier(organizerId: string, workerId: string) {
  const scope = await authorizeCourier(organizerId, workerId);
  if (!scope.ok) return { ok: false as const, error: scope.error };
  if (scope.worker.is_active) {
    const lastChangedAt = Date.parse(scope.worker.updated_at ?? "");
    if (Number.isFinite(lastChangedAt) && Date.now() - lastChangedAt < 5_000) {
      return { ok: false as const, error: "reactivation_cooldown" as const };
    }
    return { ok: false as const, error: "already_active" as const };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const sessionResult = await scope.admin
    .from("business_worker_sessions")
    .update({ revoked_at: nowIso, updated_at: nowIso })
    .eq("worker_id", workerId)
    .is("revoked_at", null);
  if (sessionResult.error) return { ok: false as const, error: "unavailable" as const };

  let claimQuery = scope.admin
    .from("business_workers")
    .update({ is_active: true, deactivated_at: null, is_available: false, updated_at: nowIso })
    .eq("id", workerId)
    .eq("business_id", scope.worker.business_id)
    .eq("role", "courier")
    .eq("is_active", false);
  claimQuery = scope.worker.deactivated_at == null
    ? claimQuery.is("deactivated_at", null)
    : claimQuery.eq("deactivated_at", scope.worker.deactivated_at);
  const { data: claim, error: claimError } = await claimQuery.select("id").maybeSingle();
  if (claimError) return { ok: false as const, error: "unavailable" as const };
  if (!claim) return { ok: false as const, error: "reactivation_cooldown" as const };

  const token = await rotateCourierInvitation(scope.admin, workerId);
  if (!token) {
    await scope.admin
      .from("business_workers")
      .update({ is_active: false, deactivated_at: scope.worker.deactivated_at ?? nowIso, is_available: false, updated_at: new Date().toISOString() })
      .eq("id", workerId)
      .eq("business_id", scope.worker.business_id)
      .eq("role", "courier")
      .eq("is_active", true);
    return { ok: false as const, error: "unavailable" as const };
  }
  revalidateCourierPages(organizerId);
  return { ok: true as const, token, path: "/courier/accept" };
}

export async function setCourierAvailability(organizerId: string, workerId: string, isAvailable: boolean) {
  const scope = await authorizeCourier(organizerId, workerId);
  if (!scope.ok) return { ok: false as const, error: scope.error };
  if (!scope.worker.is_active || scope.worker.deactivated_at) return { ok: false as const, error: "inactive" as const };
  const { error } = await scope.admin
    .from("business_workers")
    .update({ is_available: isAvailable, updated_at: new Date().toISOString() })
    .eq("id", workerId)
    .eq("business_id", scope.worker.business_id)
    .eq("role", "courier");
  if (error) return { ok: false as const, error: "unavailable" as const };
  revalidateCourierPages(organizerId);
  return { ok: true as const };
}
