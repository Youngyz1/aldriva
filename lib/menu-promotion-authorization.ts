export const PROMOTION_READ_ROLES = ["owner", "admin", "manager", "editor", "finance", "viewer"] as const;
export const PROMOTION_WRITE_ROLES = ["owner", "admin", "manager", "editor"] as const;
export const PROMOTION_DELETE_ROLES = ["owner", "admin", "manager"] as const;

export type PromotionRole = "owner" | "admin" | "manager" | "editor" | "finance" | "viewer";
export type PromotionPermission = "read" | "write" | "delete";

export function promotionRoleCan(role: string, permission: PromotionPermission): boolean {
  const roles = permission === "read" ? PROMOTION_READ_ROLES : permission === "write" ? PROMOTION_WRITE_ROLES : PROMOTION_DELETE_ROLES;
  return (roles as readonly string[]).includes(role);
}
