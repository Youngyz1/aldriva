import crypto from "crypto";

export type TableOrderingMode =
  | "disabled"
  | "menu_only"
  | "order_pay_later"
  | "order_pay_now"
  | "pay_online_first";

export type DineInConfirmationStatus =
  | "not_applicable"
  | "pending"
  | "confirmed"
  | "declined";

export type TableSessionStatus =
  | "active"
  | "bill_requested"
  | "paid"
  | "closed";

export interface BusinessTable {
  id: string;
  business_id: string;
  label: string;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface QrRedirectCode {
  id: string;
  code: string;
  target_type: "menu" | "table";
  business_id: string;
  table_id: string | null;
  is_active: boolean;
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TableSession {
  id: string;
  table_id: string;
  business_id: string;
  session_token_hash: string;
  status: TableSessionStatus;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Computes deterministic SHA-256 hash formatted as a 64-char lowercase hex string.
 * Used for session tokens and guest device identifiers so raw tokens are never stored at rest.
 */
export function hashToken(rawToken: string): string {
  if (!rawToken || typeof rawToken !== "string") {
    throw new Error("Invalid raw token: must be a non-empty string");
  }
  return crypto.createHash("sha256").update(rawToken.trim()).digest("hex").toLowerCase();
}

/**
 * Validates whether a token hash matches the required 64-character lowercase hex format.
 */
export function isValidTokenHash(hash: string | null | undefined): boolean {
  if (!hash || typeof hash !== "string") return false;
  return /^[0-9a-f]{64}$/.test(hash);
}

/**
 * Generates a cryptographically secure random token (e.g. 24 bytes = 48 hex chars).
 */
export function generateRawToken(bytes: number = 24): string {
  return crypto.randomBytes(bytes).toString("hex").toLowerCase();
}

/**
 * Generates a URL-safe random short code for QR redirects (12 hex chars).
 */
export function generateQrShortCode(): string {
  return crypto.randomBytes(6).toString("hex").toLowerCase();
}

/**
 * Validates a QR short code format (at least 8 chars, URL-safe alphanumeric).
 */
export function isValidShortCode(code: string | null | undefined): boolean {
  if (!code || typeof code !== "string") return false;
  const trimmed = code.trim();
  return trimmed.length >= 8 && /^[a-zA-Z0-9_-]+$/.test(trimmed);
}

/**
 * Cookie names used for table ordering context.
 */
export const TABLE_CONTEXT_COOKIE = "aldriva_table_ctx";
export const GUEST_DEVICE_TOKEN_COOKIE = "aldriva_guest_token";

export interface TableContextPayload {
  businessId: string;
  organizerId?: string;
  tableId: string;
  tableLabel: string;
  qrCode: string;
  tableOrderingMode?: TableOrderingMode;
  timestamp: number;
}
