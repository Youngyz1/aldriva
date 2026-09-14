"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Download,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronUp,
  DoorOpen,
  Trash2,
  CloudUpload,
} from "lucide-react";
import {
  getOfflineDataset,
  saveOfflineDataset,
  clearOfflineDataset,
  OfflineDatasetRecord,
} from "@/lib/offline-scanner-db";

interface Props {
  eventId: string;
  userId?: string | null;
  selectedEntrance: string;
  onEntranceChange: (entrance: string) => void;
  onDatasetStatusChange?: (hasDataset: boolean, count: number, lastSynced: string | null) => void;
  pendingCount?: number;
  onManualSync?: () => void;
  isSyncing?: boolean;
}

export default function ScannerPreparePanel({
  eventId,
  userId,
  selectedEntrance,
  onEntranceChange,
  onDatasetStatusChange,
  pendingCount = 0,
  onManualSync,
  isSyncing = false,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cachedData, setCachedData] = useState<OfflineDatasetRecord | null>(null);

  // Monitor online / offline state
  useEffect(() => {
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Load existing cached dataset from IndexedDB on mount
  const refreshLocalState = useCallback(async () => {
    try {
      const existing = await getOfflineDataset(eventId, userId);
      setCachedData(existing);
      if (onDatasetStatusChange) {
        onDatasetStatusChange(
          Boolean(existing),
          existing?.totalCount || 0,
          existing?.downloadedAt || null
        );
      }
      if (existing?.entranceId && !selectedEntrance) {
        onEntranceChange(existing.entranceId);
      }
    } catch (err) {
      console.error("[ScannerPreparePanel] Error checking cache:", err);
    }
  }, [eventId, userId, selectedEntrance, onEntranceChange, onDatasetStatusChange]);

  useEffect(() => {
    refreshLocalState();
  }, [refreshLocalState]);

  // Download / Sync Dataset
  const handleDownloadDataset = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch 8-hour scanner token
      const tokenRes = await fetch(`/api/events/${eventId}/scanner-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      let token: string | null = null;
      let detectedEntrance: string | null = null;

      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        token = tokenData.token || null;
        detectedEntrance = tokenData.entrance_id || null;
        if (detectedEntrance && !selectedEntrance) {
          onEntranceChange(detectedEntrance);
        }
      }

      // 2. Fetch ticket dataset
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const datasetRes = await fetch(`/api/events/${eventId}/scanner-dataset`, {
        headers,
      });

      if (!datasetRes.ok) {
        const errJson = await datasetRes.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to download ticket dataset.");
      }

      const data = await datasetRes.json();

      const record: OfflineDatasetRecord = {
        eventId,
        userId: userId || data.user_id || "current-staff",
        token,
        entranceId: selectedEntrance || detectedEntrance || null,
        eventDetails: {
          title: data.event_title,
          eventDate: data.event_date,
          venue: data.venue,
          city: data.city,
        },
        totalCount: data.total_count,
        downloadedAt: data.downloaded_at,
        expiresAt: data.expires_at,
        tickets: data.tickets || [],
      };

      // 3. Save to IndexedDB
      await saveOfflineDataset(record);
      setCachedData(record);

      if (onDatasetStatusChange) {
        onDatasetStatusChange(true, record.totalCount, record.downloadedAt);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error downloading offline dataset.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClearCache = async () => {
    if (!window.confirm("Are you sure you want to clear the local offline cache for this event?")) {
      return;
    }
    await clearOfflineDataset(eventId);
    setCachedData(null);
    if (onDatasetStatusChange) {
      onDatasetStatusChange(false, 0, null);
    }
  };

  const formatDateTime = (isoString?: string | null) => {
    if (!isoString) return "—";
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true }) + ", " +
        d.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white shadow-xs overflow-hidden transition-all">
      {/* Status Bar / Header (Always Visible) */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 border-b border-zinc-200">
        <div className="flex items-center gap-2.5">
          {/* Connectivity Pill */}
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
              isOnline
                ? "bg-emerald-100 text-emerald-800"
                : cachedData
                ? "bg-amber-100 text-amber-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {isOnline ? (
              <>
                <Wifi size={13} className="text-emerald-600 animate-pulse" />
                <span>Online (Live)</span>
              </>
            ) : cachedData ? (
              <>
                <WifiOff size={13} className="text-amber-600" />
                <span>Offline (Local Cache)</span>
              </>
            ) : (
              <>
                <WifiOff size={13} className="text-red-600" />
                <span>Offline (No Cache)</span>
              </>
            )}
          </div>

          {/* Pending Sync Badge */}
          {pendingCount > 0 && (
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
              <CloudUpload size={12} />
              <span>{pendingCount} queued</span>
            </div>
          )}

          {/* Cache Summary */}
          {cachedData ? (
            <span className="text-xs text-zinc-600 font-semibold hidden sm:inline">
              ✓ {cachedData.totalCount} tickets synced ({formatDateTime(cachedData.downloadedAt)})
            </span>
          ) : (
            <span className="text-xs text-zinc-500 font-medium hidden sm:inline">
              Offline mode not downloaded
            </span>
          )}
        </div>

        {/* Toggle Button */}
        <div className="flex items-center gap-2">
          {pendingCount > 0 && onManualSync && isOnline && (
            <button
              type="button"
              onClick={onManualSync}
              disabled={isSyncing}
              className="flex items-center gap-1 text-xs font-bold text-amber-900 bg-amber-200 hover:bg-amber-300 border border-amber-300 rounded-xl px-2.5 py-1.5 transition shadow-2xs"
            >
              <RefreshCw size={12} className={isSyncing ? "animate-spin" : ""} />
              <span>{isSyncing ? "Syncing..." : "Sync Now"}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-1 text-xs font-bold text-zinc-700 hover:text-zinc-900 bg-white border border-zinc-200 rounded-xl px-3 py-1.5 hover:bg-zinc-100 transition shadow-2xs"
          >
            <span>{cachedData ? "Manage Offline" : "Prepare Scanner"}</span>
            {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Expandable Prepare Panel Body */}
      {isOpen && (
        <div className="p-4 sm:p-5 space-y-4 bg-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-zinc-900 flex items-center gap-2">
                <Download size={16} className="text-orange-600" />
                Offline Dataset Preparation
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Download ticket hashes and guest details so scanning continues seamlessly without internet.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              {cachedData ? (
                <>
                  <button
                    type="button"
                    onClick={handleDownloadDataset}
                    disabled={loading || !isOnline}
                    className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white hover:bg-orange-700 disabled:opacity-50 transition"
                  >
                    <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                    {loading ? "Re-syncing..." : "Re-sync Dataset"}
                  </button>
                  <button
                    type="button"
                    onClick={handleClearCache}
                    title="Clear local offline cache"
                    className="flex items-center justify-center p-2 rounded-xl border border-zinc-200 text-zinc-500 hover:text-red-600 hover:bg-red-50 transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleDownloadDataset}
                  disabled={loading || !isOnline}
                  className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white hover:bg-orange-700 disabled:opacity-50 transition shadow-xs"
                >
                  <Download size={14} className={loading ? "animate-spin" : ""} />
                  {loading ? "Downloading..." : "Download Offline Dataset"}
                </button>
              )}
            </div>
          </div>

          {/* Entrance / Gate Selector */}
          <div className="pt-3 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <DoorOpen size={15} className="text-zinc-500" />
              <label htmlFor="entrance-input" className="text-xs font-bold text-zinc-700">
                Gate / Entrance:
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="entrance-input"
                type="text"
                value={selectedEntrance}
                onChange={(e) => onEntranceChange(e.target.value)}
                placeholder="e.g. Main Gate, VIP Entrance, North Door"
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 w-full sm:w-64"
              />
            </div>
          </div>

          {/* Pending Scans Status */}
          {pendingCount > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-300 p-3 text-xs text-amber-950 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CloudUpload size={16} className="text-amber-600 shrink-0" />
                <div>
                  <p className="font-bold">{pendingCount} offline check-in{pendingCount === 1 ? "" : "s"} waiting to sync</p>
                  <p className="text-[11px] text-amber-800">
                    {isOnline ? "Connected to internet. Sync is active." : "Offline. Will automatically sync once network returns."}
                  </p>
                </div>
              </div>
              {onManualSync && isOnline && (
                <button
                  type="button"
                  onClick={onManualSync}
                  disabled={isSyncing}
                  className="rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 transition shrink-0 shadow-2xs"
                >
                  {isSyncing ? "Syncing..." : "Sync Now"}
                </button>
              )}
            </div>
          )}

          {/* Dataset Status Banner */}
          {cachedData && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 size={14} className="text-emerald-600" />
                <span>Offline Dataset Ready ({cachedData.totalCount} tickets cached)</span>
              </div>
              <div className="text-[11px] text-emerald-700 flex flex-wrap gap-x-4">
                <span>Last synced: {formatDateTime(cachedData.downloadedAt)}</span>
                <span>Expires: {formatDateTime(cachedData.expiresAt)}</span>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-900 flex items-center gap-2">
              <AlertTriangle size={15} className="text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!isOnline && !cachedData && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-600 shrink-0" />
              <span>
                You are currently offline and have no cached dataset. Connect to the internet once to download the event tickets.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
