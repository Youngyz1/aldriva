
export const SCAN_ACTIONS = ["pick_up", "deliver", "seat", "no_show", "refund"] as const;

export type ScanBody = {
  code: string;
  action: typeof SCAN_ACTIONS[number];
  clientScanId?: string | null;
  clientScannedAt?: string | null;
  deviceId?: string | null;
  cashCollected?: boolean;
};

export function isScanAction(value: unknown): value is typeof SCAN_ACTIONS[number] {
  return typeof value === "string" && (SCAN_ACTIONS as readonly string[]).includes(value);
}

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function validateBody(body: unknown): ScanBody | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  if (typeof b.code !== "string") return null;
  const code = b.code.trim();
  if (code.length < 1 || code.length > 128) return null;

  if (!isScanAction(b.action)) return null;

  if (b.clientScanId !== undefined && b.clientScanId !== null) {
    if (typeof b.clientScanId !== "string") return null;
    const csid = b.clientScanId.trim();
    if (csid.length < 1 || csid.length > 64) return null;
  }

  if (b.deviceId !== undefined && b.deviceId !== null) {
    if (typeof b.deviceId !== "string") return null;
    const did = b.deviceId.trim();
    if (did.length < 1 || did.length > 64) return null;
  }

  if (b.clientScannedAt !== undefined && b.clientScannedAt !== null) {
    if (typeof b.clientScannedAt !== "string") return null;
    if (!ISO_DATETIME.test(b.clientScannedAt)) return null;
    const parsed = Date.parse(b.clientScannedAt);
    if (!Number.isFinite(parsed)) return null;
    const now = Date.now();
    if (parsed > now + FIVE_MINUTES_MS) return null;
    if (parsed < now - SEVEN_DAYS_MS) return null;
  }

  if (b.cashCollected !== undefined && b.cashCollected !== null && typeof b.cashCollected !== "boolean") return null;

  return {
    code,
    action: b.action as typeof SCAN_ACTIONS[number],
    clientScanId: b.clientScanId !== undefined && b.clientScanId !== null ? (b.clientScanId as string).trim() : null,
    clientScannedAt: b.clientScannedAt ?? null,
    deviceId: b.deviceId !== undefined && b.deviceId !== null ? (b.deviceId as string).trim() : null,
    cashCollected: b.cashCollected ?? false,
  };
}
