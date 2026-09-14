import { openDB, IDBPDatabase } from "idb";
import type { OfflineTicketRecord } from "@/app/api/events/[id]/scanner-dataset/route";

export interface OfflineDatasetRecord {
  eventId: string;
  userId: string;
  token: string | null;
  entranceId: string | null;
  eventDetails: {
    title: string;
    eventDate?: string | null;
    venue?: string | null;
    city?: string | null;
  };
  totalCount: number;
  downloadedAt: string;
  expiresAt: string;
  tickets: OfflineTicketRecord[];
}

export interface PendingScanRecord {
  scanId: string; // UUID
  eventId: string;
  ticketInstanceId: string;
  orderId?: string | null;
  qrCode: string;
  buyerName?: string | null;
  tierName?: string | null;
  seatLabel?: string | null;
  scannedAt: string; // ISO string
  delegatingUserId?: string | null;
  currentUserId?: string | null;
  entranceId?: string | null;
  deviceId?: string | null;
  syncStatus: "pending" | "syncing" | "synced" | "failed" | "conflict";
  syncError?: string | null;
  syncedAt?: string | null;
  conflictReason?: string | null;
}

export interface SyncResult {
  processed: number;
  synced: number;
  conflicts: number;
  failed: number;
  results: Array<{
    scan_id: string;
    status: "synced" | "conflict" | "failed";
    action?: string;
    reason?: string;
    error?: string;
  }>;
}

const DB_NAME = "aldriva_scanner_db";
const DB_VERSION = 2;
const CACHE_STORE = "scanner_cache_v1";
const QUEUE_STORE = "scan_queue_v1";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB is only available in browser environments."));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, _oldVersion) {
        if (!db.objectStoreNames.contains(CACHE_STORE)) {
          db.createObjectStore(CACHE_STORE, { keyPath: "eventId" });
        }
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          const queueStore = db.createObjectStore(QUEUE_STORE, { keyPath: "scanId" });
          queueStore.createIndex("by_event", "eventId");
          queueStore.createIndex("by_status", "syncStatus");
          queueStore.createIndex("by_event_status", ["eventId", "syncStatus"]);
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Gets or creates a persistent device ID stored in localStorage.
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "server-device";
  try {
    const KEY = "aldriva_scanner_device_id";
    let devId = localStorage.getItem(KEY);
    if (!devId) {
      devId = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `dev_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem(KEY, devId);
    }
    return devId;
  } catch {
    return `dev_fallback_${Date.now()}`;
  }
}

/**
 * Saves a downloaded ticket dataset to IndexedDB.
 */
export async function saveOfflineDataset(dataset: OfflineDatasetRecord): Promise<void> {
  const db = await getDb();
  await db.put(CACHE_STORE, dataset);
}

/**
 * Retrieves the offline dataset for an event.
 * Enforces cache expiry based on expiresAt (max(event_date + 6h, download_time + 24h)).
 */
export async function getOfflineDataset(
  eventId: string,
  userId?: string | null
): Promise<OfflineDatasetRecord | null> {
  try {
    const db = await getDb();
    const record: OfflineDatasetRecord | undefined = await db.get(CACHE_STORE, eventId);
    if (!record) return null;

    // Check expiry
    const expiresMs = new Date(record.expiresAt).getTime();
    if (Date.now() > expiresMs) {
      // Expired - clear and return null
      await db.delete(CACHE_STORE, eventId);
      return null;
    }

    if (userId && record.userId && record.userId !== userId && record.userId !== "current-staff") {
      console.debug("[offline-scanner-db] Active user differs from download user");
    }

    return record;
  } catch (err) {
    console.error("[offline-scanner-db] Error reading cache:", err);
    return null;
  }
}

/**
 * Clears the offline dataset for a specific event.
 */
export async function clearOfflineDataset(eventId: string): Promise<void> {
  try {
    const db = await getDb();
    await db.delete(CACHE_STORE, eventId);
  } catch (err) {
    console.error("[offline-scanner-db] Error deleting cache:", err);
  }
}

export type OfflineLookupResult =
  | { state: "found"; ticket: OfflineTicketRecord; dataset: OfflineDatasetRecord }
  | { state: "not_in_local_data"; dataset: OfflineDatasetRecord }
  | { state: "no_cache" }
  | { state: "expired" };

/**
 * Searches the local offline dataset for a given QR code.
 */
export async function findOfflineTicket(
  eventId: string,
  userId: string | null,
  cleanCode: string
): Promise<OfflineLookupResult> {
  try {
    const db = await getDb();
    const record: OfflineDatasetRecord | undefined = await db.get(CACHE_STORE, eventId);

    if (!record) {
      return { state: "no_cache" };
    }

    // Check expiry
    const expiresMs = new Date(record.expiresAt).getTime();
    if (Date.now() > expiresMs) {
      return { state: "expired" };
    }

    if (userId && record.userId && record.userId !== userId && record.userId !== "current-staff") {
      console.debug("[offline-scanner-db] Scanning under user ID:", userId);
    }

    const normalizedCode = cleanCode.trim().toUpperCase();
    const matched = record.tickets.find((t) => t.qr_code.trim().toUpperCase() === normalizedCode);

    if (matched) {
      return { state: "found", ticket: matched, dataset: record };
    }

    return { state: "not_in_local_data", dataset: record };
  } catch (err) {
    console.error("[offline-scanner-db] Error in findOfflineTicket:", err);
    return { state: "no_cache" };
  }
}

/**
 * Queues an offline scan into scan_queue_v1 and updates the local cache
 * in scanner_cache_v1 so subsequent scans on this same device show "ALREADY CHECKED IN (offline)".
 */
export async function queueOfflineScan(scan: PendingScanRecord): Promise<void> {
  try {
    const db = await getDb();
    
    // 1. Insert into scan_queue_v1
    await db.put(QUEUE_STORE, scan);

    // 2. Mark ticket in local dataset cache as 'used' to prevent duplicate local scans
    const cached: OfflineDatasetRecord | undefined = await db.get(CACHE_STORE, scan.eventId);
    if (cached && Array.isArray(cached.tickets)) {
      const idx = cached.tickets.findIndex(
        (t) => t.instance_id === scan.ticketInstanceId || t.qr_code.trim().toUpperCase() === scan.qrCode.trim().toUpperCase()
      );
      if (idx !== -1) {
        cached.tickets[idx] = {
          ...cached.tickets[idx],
          status: "used",
          checked_in_at: scan.scannedAt,
        };
        await db.put(CACHE_STORE, cached);
      }
    }
  } catch (err) {
    console.error("[offline-scanner-db] Error queueing offline scan:", err);
  }
}

/**
 * Retrieves all pending / un-synced scans for an event.
 */
export async function getPendingScans(eventId: string): Promise<PendingScanRecord[]> {
  try {
    const db = await getDb();
    const all = await db.getAllFromIndex(QUEUE_STORE, "by_event", eventId);
    return (all || []).filter((s) => s.syncStatus === "pending" || s.syncStatus === "failed");
  } catch (err) {
    console.error("[offline-scanner-db] Error fetching pending scans:", err);
    return [];
  }
}

/**
 * Returns the count of pending (un-synced) scans for an event.
 */
export async function getPendingScanCount(eventId: string): Promise<number> {
  try {
    const pending = await getPendingScans(eventId);
    return pending.length;
  } catch {
    return 0;
  }
}

/**
 * Retrieves all scan records for an event (including synced/conflicts).
 */
export async function getAllScans(eventId: string): Promise<PendingScanRecord[]> {
  try {
    const db = await getDb();
    const all = await db.getAllFromIndex(QUEUE_STORE, "by_event", eventId);
    return (all || []).sort((a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime());
  } catch (err) {
    console.error("[offline-scanner-db] Error fetching all scans:", err);
    return [];
  }
}

/**
 * Updates a scan item's sync status in IndexedDB.
 */
export async function updateScanStatus(
  scanId: string,
  status: PendingScanRecord["syncStatus"],
  extra?: Partial<PendingScanRecord>
): Promise<void> {
  try {
    const db = await getDb();
    const existing = await db.get(QUEUE_STORE, scanId);
    if (existing) {
      const updated = {
        ...existing,
        ...extra,
        syncStatus: status,
      };
      await db.put(QUEUE_STORE, updated);
    }
  } catch (err) {
    console.error("[offline-scanner-db] Error updating scan status:", err);
  }
}

/**
 * Flushes all pending scans for an event to the server sync endpoint:
 * POST /api/events/[id]/scanner-sync
 */
export async function syncOfflineScans(
  eventId: string,
  token?: string | null
): Promise<SyncResult> {
  const pending = await getPendingScans(eventId);
  if (!pending || pending.length === 0) {
    return { processed: 0, synced: 0, conflicts: 0, failed: 0, results: [] };
  }

  // Mark all pending as 'syncing'
  for (const scan of pending) {
    await updateScanStatus(scan.scanId, "syncing");
  }

  const payloadScans = pending.map((s) => ({
    scan_id: s.scanId,
    ticket_instance_id: s.ticketInstanceId,
    order_id: s.orderId || null,
    qr_code: s.qrCode,
    scanned_at: s.scannedAt,
    delegating_user_id: s.delegatingUserId || null,
    current_user_id: s.currentUserId || null,
    entrance_id: s.entranceId || null,
    device_id: s.deviceId || null,
  }));

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`/api/events/${eventId}/scanner-sync`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        scans: payloadScans,
        token: token || undefined,
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const errorMsg = errJson.error || "Sync endpoint returned error";
      // Mark all back to failed
      for (const scan of pending) {
        await updateScanStatus(scan.scanId, "failed", { syncError: errorMsg });
      }
      return {
        processed: pending.length,
        synced: 0,
        conflicts: 0,
        failed: pending.length,
        results: pending.map((s) => ({
          scan_id: s.scanId,
          status: "failed",
          error: errorMsg,
        })),
      };
    }

    const data = await res.json();
    const results: SyncResult["results"] = data.results || [];

    for (const r of results) {
      if (r.status === "synced") {
        await updateScanStatus(r.scan_id, "synced", {
          syncedAt: new Date().toISOString(),
          syncError: null,
        });
      } else if (r.status === "conflict") {
        await updateScanStatus(r.scan_id, "conflict", {
          syncedAt: new Date().toISOString(),
          conflictReason: r.reason || "Conflict detected",
          syncError: r.reason || null,
        });
      } else {
        await updateScanStatus(r.scan_id, "failed", {
          syncError: r.error || "Validation failed",
        });
      }
    }

    return {
      processed: data.processed ?? results.length,
      synced: data.synced ?? results.filter((r) => r.status === "synced").length,
      conflicts: data.conflicts ?? results.filter((r) => r.status === "conflict").length,
      failed: data.failed ?? results.filter((r) => r.status === "failed").length,
      results,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Network error during sync";
    for (const scan of pending) {
      await updateScanStatus(scan.scanId, "failed", { syncError: errorMsg });
    }
    return {
      processed: pending.length,
      synced: 0,
      conflicts: 0,
      failed: pending.length,
      results: pending.map((s) => ({
        scan_id: s.scanId,
        status: "failed",
        error: errorMsg,
      })),
    };
  }
}
