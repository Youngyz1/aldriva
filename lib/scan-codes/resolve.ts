import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import type { ResolvedScannerPrincipal } from "@/lib/scanner/resolve-principal";
import { classifyScanPayload, normalizeScannedPayload } from "@/lib/scan-codes/format";
import { lookupScanCode, type LookedUpScanCode, type ScanCodeType } from "@/lib/scan-codes/issue";

/**
 * Optional expected-scope boundaries a caller can assert against a resolved
 * code. Any field present and non-matching rejects with scope_mismatch.
 * Absent fields are not checked (Phase 2 principals carry no tenant/
 * business/branch scope yet — Phase 3 wires that in).
 */
export interface ScanCodeScope {
  tenantId?: string;
  businessId?: string;
  branchId?: string;
}

export type ResolvedScanTarget =
  | { kind: "ticket"; code: string }
  | ({ kind: "subject" } & LookedUpScanCode)
  | { kind: "unknown" }
  | { kind: "revoked" }
  | { kind: "code_type_mismatch" }
  | { kind: "scope_mismatch" };

export function logRejection(requestId: string, reason: string, extra: Record<string, unknown> = {}) {
  console.warn(JSON.stringify({ event: "scan_code_rejected", requestId, reason, ...extra }));
}

function principalAllowsCodeType(principal: ResolvedScannerPrincipal | undefined, codeType: ScanCodeType): boolean {
  if (!principal) return true;
  return principal.codeType.includes(codeType);
}

function scopeMatches(scope: ScanCodeScope | undefined, resolved: LookedUpScanCode): boolean {
  if (!scope) return true;
  if (scope.tenantId !== undefined && scope.tenantId !== resolved.tenantId) return false;
  if (scope.businessId !== undefined && scope.businessId !== resolved.businessId) return false;
  if (scope.branchId !== undefined && scope.branchId !== resolved.branchId) return false;
  return true;
}

/**
 * Resolves a raw scanned string to either the existing ticket path (caller
 * keeps using it unchanged) or a scan-code subject (order/reservation).
 * Performs NO scan action — issuance/resolution only.
 */
export async function resolveScannedCode(
  admin: ReturnType<typeof createSupabaseAdmin>,
  raw: string,
  opts: {
    principal?: ResolvedScannerPrincipal;
    scope?: ScanCodeScope;
    requestId: string;
  }
): Promise<ResolvedScanTarget> {
  const { principal, scope, requestId } = opts;
  const normalized = normalizeScannedPayload(raw);
  const kind = classifyScanPayload(raw);

  if (kind === "ticket") {
    return { kind: "ticket", code: normalized };
  }

  if (kind === "unknown") {
    logRejection(requestId, "unknown_format");
    return { kind: "unknown" };
  }

  const resolved = await lookupScanCode(admin, normalized);
  if (!resolved) {
    logRejection(requestId, "unknown", { codeType: kind });
    return { kind: "unknown" };
  }

  if (!principalAllowsCodeType(principal, resolved.codeType)) {
    logRejection(requestId, "code_type_mismatch", { codeType: resolved.codeType });
    return { kind: "code_type_mismatch" };
  }

  if (!scopeMatches(scope, resolved)) {
    logRejection(requestId, "scope_mismatch", { codeType: resolved.codeType });
    return { kind: "scope_mismatch" };
  }

  if (resolved.status === "revoked") {
    logRejection(requestId, "revoked", { codeType: resolved.codeType });
    return { kind: "revoked" };
  }

  return { kind: "subject", ...resolved };
}
