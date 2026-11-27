// Plain file on purpose: a "use server" module may export only async functions and types.
import type { EntityRole } from "@/lib/entity-auth";

export const PROMO_READ_ROLES: EntityRole[] = ["owner", "admin", "manager", "editor", "finance"];
export const PROMO_MANAGE_ROLES: EntityRole[] = ["owner", "admin", "manager"];
