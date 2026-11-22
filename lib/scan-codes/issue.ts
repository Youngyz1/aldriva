import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export type ScanCodeType = "order" | "reservation";

export interface IssuedScanCode {
  code: string;
  codeType: ScanCodeType;
  status: "active" | "revoked";
  created: boolean;
}

export interface LookedUpScanCode {
  codeType: ScanCodeType;
  subjectId: string;
  tenantId: string;
  businessId: string | null;
  branchId: string | null;
  status: "active" | "revoked";
  subjectNumber: string;
  subjectStatus: string;
}

function isScanCodeType(value: unknown): value is ScanCodeType {
  return value === "order" || value === "reservation";
}

function isScanCodeStatus(value: unknown): value is "active" | "revoked" {
  return value === "active" || value === "revoked";
}

/**
 * Issues (or re-fetches, idempotently) a scan code for a given subject via
 * the service_role-only issue_scan_code RPC. Returns null for an unknown
 * subject or bad codeType — issue_scan_code returns zero rows rather than
 * raising for a business rule.
 */
export async function issueScanCode(
  admin: ReturnType<typeof createSupabaseAdmin>,
  codeType: ScanCodeType,
  subjectId: string
): Promise<IssuedScanCode | null> {
  const { data, error } = await admin.rpc("issue_scan_code", {
    p_code_type: codeType,
    p_subject_id: subjectId,
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const value = row as Record<string, unknown>;

  if (
    typeof value.out_code !== "string" ||
    !isScanCodeType(value.out_code_type) ||
    !isScanCodeStatus(value.out_status) ||
    typeof value.out_created !== "boolean"
  ) {
    return null;
  }

  return {
    code: value.out_code,
    codeType: value.out_code_type,
    status: value.out_status,
    created: value.out_created,
  };
}

/**
 * Resolves a scan code string to its subject via the service_role-only
 * lookup_scan_code RPC. Returns identifiers and statuses only — never a
 * customer name, email, phone, address, or items.
 */
export async function lookupScanCode(
  admin: ReturnType<typeof createSupabaseAdmin>,
  code: string
): Promise<LookedUpScanCode | null> {
  const { data, error } = await admin.rpc("lookup_scan_code", { p_code: code });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const value = row as Record<string, unknown>;

  if (
    !isScanCodeType(value.out_code_type) ||
    typeof value.out_subject_id !== "string" ||
    typeof value.out_tenant_id !== "string" ||
    !isScanCodeStatus(value.out_status) ||
    typeof value.out_subject_number !== "string" ||
    typeof value.out_subject_status !== "string"
  ) {
    return null;
  }

  return {
    codeType: value.out_code_type,
    subjectId: value.out_subject_id,
    tenantId: value.out_tenant_id,
    businessId: typeof value.out_business_id === "string" ? value.out_business_id : null,
    branchId: typeof value.out_branch_id === "string" ? value.out_branch_id : null,
    status: value.out_status,
    subjectNumber: value.out_subject_number,
    subjectStatus: value.out_subject_status,
  };
}
