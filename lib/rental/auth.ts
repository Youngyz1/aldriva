import "server-only";

import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkTenantAccess, type EntityRole } from "@/lib/entity-auth";

export const WRITE_ROLES: EntityRole[] = ["owner", "admin", "manager", "editor"];
export const VIEW_ROLES: EntityRole[] = [
  "owner",
  "admin",
  "manager",
  "editor",
  "finance",
  "viewer",
];

export async function verifyAuth(organizerId: string, allowedRoles: EntityRole[]) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const access = await checkTenantAccess(user.id, organizerId, allowedRoles);
  if (!access.hasAccess) throw new Error("Forbidden");
  return user;
}