"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import jsQR from "jsqr";
import {
  Camera,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RotateCcw,
  HelpCircle,
  ArrowLeft,
  Search,
  RefreshCw,
  WifiOff,
  CloudUpload,
} from "lucide-react";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import ScannerPreparePanel from "@/components/scanner/ScannerPreparePanel";
import {
  findOfflineTicket,
  queueOfflineScan,
  getPendingScanCount,
  syncOfflineScans,
  getOrCreateDeviceId,
  getOfflineDataset,
  PendingScanRecord,
} from "@/lib/offline-scanner-db";

type ScanResultState = {
  status:
    | "valid"
    | "offline_valid"
    | "used"
    | "wrong_event"
    | "cancelled"
    | "refunded"
    | "not_found"
    | "not_in_local_data"
    | "error";
  title: string;
  message: string;
  isOffline?: boolean;
  order?: {
    id?: string;
    buyer_name?: string | null;
    buyer_email?: string | null;
    phone?: string | null;
    image_url?: string | null;
    guest_title?: string | null;
    organization?: string | null;
    quantity?: number;
    seat_label?: string | null;
    tier_name?: string | null;
    checked_in_at?: string | null;
    event_title?: string | null;
  };
};

type Props = {
  eventId: string;
  userId?: string | null;
  assignedEntrance?: string | null;
  eventTitle: string;
  eventDetails?: string;
};

export default function ScannerClient({
  eventId,
  userId,
  assignedEntrance,
  eventTitle,
  eventDetails,
}: Props) {
  const [manualCode, setManualCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResultState | null>(null);
  const [cameraActive] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [autoResetTimer, setAutoResetTimer] = useState<number | null>(null);
  const [selectedEntrance, setSelectedEntrance] = useState<string>(assignedEntrance || "");
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isVerifyingRef = useRef<boolean>(false);

  // Sync assignedEntrance if it loads or changes
  useEffect(() => {
    if (assignedEntrance && !selectedEntrance) {
      setSelectedEntrance(assignedEntrance);
    }
  }, [assignedEntrance, selectedEntrance]);

  // Refresh pending count
  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingScanCount(eventId);
      setPendingCount(count);
    } catch {
      // Ignore in SSR
    }
  }, [eventId]);

  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  // Flush offline queue when online
  const triggerSync = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (syncing) return;

    try {
      setSyncing(true);
      const dataset = await getOfflineDataset(eventId, userId);
      const token = dataset?.token || null;
      const syncRes = await syncOfflineScans(eventId, token);

      if (syncRes.synced > 0 || syncRes.conflicts > 0) {
        setSyncToast(
          `Auto-synced ${syncRes.synced} offline check-in${syncRes.synced === 1 ? "" : "s"}${
            syncRes.conflicts > 0 ? ` (${syncRes.conflicts} conflict logged)` : ""
          }`
        );
        setTimeout(() => setSyncToast(null), 4000);
      }
      await refreshPendingCount();
    } catch (err) {
      console.error("[ScannerClient] Sync error:", err);
    } finally {
      setSyncing(false);
    }
  }, [eventId, userId, syncing, refreshPendingCount]);

  // Auto-sync on network reconnect & periodic heartbeat
  useEffect(() => {
    const handleOnline = () => {
      triggerSync();
    };

    window.addEventListener("online", handleOnline);

    const interval = window.setInterval(() => {
      if (typeof navigator !== "undefined" && navigator.onLine) {
        triggerSync();
      }
    }, 15000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.clearInterval(interval);
    };
  }, [triggerSync]);

  const resetScanner = useCallback(() => {
    setResult(null);
    setManualCode("");
    setLoading(false);
    isVerifyingRef.current = false;
    if (autoResetTimer) {
      window.clearInterval(autoResetTimer);
      setAutoResetTimer(null);
    }
  }, [autoResetTimer]);

  const verifyTicketCode = useCallback(
    async (rawCode: string) => {
      if (isVerifyingRef.current || !rawCode.trim()) return;
      isVerifyingRef.current = true;

      // Cancel any pending camera animation frame immediately
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }

      setLoading(true);

      // Extract code if raw string is full URL e.g. https://domain/verify/CODE or https://domain/ticket-confirmation?qr=CODE
      let cleanCode = rawCode.trim();
      if (cleanCode.includes("qr=")) {
        const qrPart = cleanCode.split("qr=")[1];
        cleanCode = qrPart.split("&")[0].split("#")[0];
      } else if (cleanCode.includes("/verify/")) {
        const parts = cleanCode.split("/verify/");
        cleanCode = parts[parts.length - 1].split("?")[0].split("#")[0];
      }
      cleanCode = cleanCode.replace(/\/+$/, "").trim().toUpperCase();

      let onlineData: any = null;
      let onlineFailed = false;
      const isDeviceOffline = typeof navigator !== "undefined" && !navigator.onLine;

      // 1. Try Live Server Verification First if device is online
      if (!isDeviceOffline) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        try {
          const res = await fetch("/api/verify-ticket", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code: cleanCode,
              action: "checkin",
              eventId,
              entrance: selectedEntrance || undefined,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (res.ok || res.status === 400 || res.status === 403 || res.status === 404) {
            onlineData = await res.json();
          } else {
            // 500 or 502/503/504 server error - treat as online fail
            onlineFailed = true;
          }
        } catch {
          clearTimeout(timeoutId);
          onlineFailed = true;
        }
      } else {
        onlineFailed = true;
      }

      // 2. Handle Online Response
      if (onlineData && !onlineFailed) {
        if (onlineData.success) {
          setResult({
            status: "valid",
            title: "CHECK-IN SUCCESSFUL",
            message: "Guest verified and marked checked in.",
            order: onlineData.order,
          });
        } else {
          const status = onlineData.status || onlineData.error || "error";
          if (status === "used" || onlineData.message?.includes("already used")) {
            setResult({
              status: "used",
              title: "ALREADY CHECKED IN",
              message: onlineData.message || "This ticket was previously checked in.",
              order: onlineData.order,
            });
          } else if (status === "wrong_event" || onlineData.error === "WRONG_EVENT") {
            setResult({
              status: "wrong_event",
              title: "WRONG EVENT",
              message: "This ticket belongs to a different event.",
              order: onlineData.order,
            });
          } else if (status === "cancelled") {
            setResult({
              status: "cancelled",
              title: "TICKET CANCELLED",
              message: "This ticket has been cancelled.",
              order: onlineData.order,
            });
          } else if (status === "refunded") {
            setResult({
              status: "refunded",
              title: "TICKET REFUNDED",
              message: "This ticket was refunded.",
              order: onlineData.order,
            });
          } else if (onlineData.status === "not_found" || status === "not_found") {
            setResult({
              status: "not_found",
              title: "TICKET NOT FOUND",
              message: "Unrecognized QR code or ticket number.",
            });
          } else {
            setResult({
              status: "error",
              title: "CHECK-IN FAILED",
              message: onlineData.message || onlineData.error || "Could not check in ticket.",
            });
          }
        }
      } else if (onlineFailed) {
        // 3. Fallback to Local Offline Validation & Write Queue
        try {
          const offlineLookup = await findOfflineTicket(eventId, userId || null, cleanCode);

          if (offlineLookup.state === "found") {
            const t = offlineLookup.ticket;
            const orderData = {
              id: t.instance_id,
              buyer_name: t.buyer_name,
              buyer_email: t.buyer_email,
              guest_title: t.guest_title,
              organization: t.organization,
              quantity: 1,
              seat_label: t.seat_label,
              tier_name: t.tier_name,
              image_url: t.image_url,
            };

            if (t.status === "valid") {
              // Phase C: Enqueue offline scan into scan_queue_v1
              const scanId =
                typeof crypto !== "undefined" && crypto.randomUUID
                  ? crypto.randomUUID()
                  : `scan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
              const scannedAt = new Date().toISOString();

              const pendingScan: PendingScanRecord = {
                scanId,
                eventId,
                ticketInstanceId: t.instance_id,
                orderId: t.order_id || null,
                qrCode: cleanCode,
                buyerName: t.buyer_name,
                tierName: t.tier_name,
                seatLabel: t.seat_label,
                scannedAt,
                delegatingUserId: offlineLookup.dataset.userId || null,
                currentUserId: userId || null,
                entranceId: selectedEntrance || offlineLookup.dataset.entranceId || null,
                deviceId: getOrCreateDeviceId(),
                syncStatus: "pending",
              };

              await queueOfflineScan(pendingScan);
              await refreshPendingCount();

              setResult({
                status: "offline_valid",
                isOffline: true,
                title: "VALID (OFFLINE VERIFIED)",
                message: "OFFLINE — QUEUED FOR SYNC",
                order: {
                  ...orderData,
                  checked_in_at: scannedAt,
                },
              });
            } else if (t.status === "used") {
              setResult({
                status: "used",
                isOffline: true,
                title: "ALREADY CHECKED IN",
                message: "This ticket was previously checked in.",
                order: orderData,
              });
            } else if (t.status === "cancelled") {
              setResult({
                status: "cancelled",
                isOffline: true,
                title: "TICKET CANCELLED",
                message: "This ticket has been cancelled.",
                order: orderData,
              });
            } else if (t.status === "refunded") {
              setResult({
                status: "refunded",
                isOffline: true,
                title: "TICKET REFUNDED",
                message: "This ticket was refunded.",
                order: orderData,
              });
            }
          } else if (offlineLookup.state === "not_in_local_data") {
            setResult({
              status: "not_in_local_data",
              isOffline: true,
              title: "NOT FOUND IN LOCAL DATA",
              message:
                "This ticket was not found in the downloaded offline dataset. It may have been purchased after the last sync. Ask the guest for their confirmation email or order number, or verify manually when connection is restored.",
            });
          } else if (offlineLookup.state === "expired") {
            setResult({
              status: "error",
              isOffline: true,
              title: "OFFLINE DATA EXPIRED",
              message: "The cached dataset for this event has expired. Connect to the internet to re-sync.",
            });
          } else {
            // no_cache
            setResult({
              status: "error",
              isOffline: true,
              title: "OFFLINE — NO DATASET",
              message:
                "No connection to server and no offline dataset has been downloaded for this event. Prepare scanner when connected.",
            });
          }
        } catch (err: unknown) {
          console.error("[offline-validate]", err);
          setResult({
            status: "error",
            isOffline: true,
            title: "SCAN ERROR",
            message: "Error performing offline ticket validation.",
          });
        }
      }

      setLoading(false);
      // Start 3-second auto-reset countdown
      let count = 3;
      setAutoResetTimer(count);
      const timerId = window.setInterval(() => {
        count -= 1;
        if (count <= 0) {
          window.clearInterval(timerId);
          resetScanner();
        } else {
          setAutoResetTimer(count);
        }
      }, 1000);
    },
    [eventId, userId, selectedEntrance, resetScanner, refreshPendingCount]
  );

  // Camera Scan Frame Loop
  const scanFrame = useCallback(() => {
    if (!cameraActive || result !== null || isVerifyingRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });

        if (code && code.data) {
          verifyTicketCode(code.data);
          return;
        }
      }
    }

    animFrameRef.current = requestAnimationFrame(scanFrame);
  }, [cameraActive, result, verifyTicketCode]);

  // Start Camera
  useEffect(() => {
    if (!cameraActive) return;

    async function startCamera() {
      try {
        setCameraError(null);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        animFrameRef.current = requestAnimationFrame(scanFrame);
      } catch {
        setCameraError("Camera access denied or unavailable. Use manual code entry below.");
      }
    }

    startCamera();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraActive, scanFrame]);

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      <DashboardPageHeader
        eyebrow="Door Check-In"
        title={eventTitle}
        description={eventDetails || "Mobile Ticket Scanner Portal"}
        action={
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <button
                type="button"
                onClick={triggerSync}
                disabled={syncing}
                className="flex items-center gap-1.5 shrink-0 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-white hover:bg-amber-600 shadow-xs"
              >
                <CloudUpload size={14} className={syncing ? "animate-bounce" : ""} />
                <span>{syncing ? "Syncing..." : `${pendingCount} Queued`}</span>
              </button>
            )}
            <Link
              href={`/dashboard/events`}
              className="flex items-center gap-1.5 shrink-0 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
            >
              <ArrowLeft size={14} /> Back to Events
            </Link>
          </div>
        }
      />

      {/* Sync Toast Notification */}
      {syncToast && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-900 shadow-xs flex items-center gap-2 animate-fade-in">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{syncToast}</span>
        </div>
      )}

      {/* Prepare Scanner & Offline Dataset Panel */}
      <ScannerPreparePanel
        eventId={eventId}
        userId={userId}
        selectedEntrance={selectedEntrance}
        onEntranceChange={setSelectedEntrance}
        pendingCount={pendingCount}
        onManualSync={triggerSync}
        isSyncing={syncing}
      />

      {/* Scanner workspace */}
      <div className="space-y-4">
        {/* Result Overlay State Banner */}
        {result ? (
          <div className="p-6 text-center space-y-4">
            <div
              className={`rounded-2xl p-6 border ${
                result.status === "valid"
                  ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                  : result.status === "offline_valid"
                  ? "bg-emerald-50/95 border-emerald-400 text-emerald-950 shadow-sm"
                  : result.status === "not_in_local_data"
                  ? "bg-amber-50 border-amber-400 text-amber-950 shadow-sm"
                  : result.status === "used"
                  ? "bg-amber-50 border-amber-300 text-amber-900"
                  : result.status === "wrong_event"
                  ? "bg-red-50 border-red-300 text-red-900"
                  : result.status === "cancelled"
                  ? "bg-red-50 border-red-300 text-red-900"
                  : result.status === "refunded"
                  ? "bg-orange-50 border-orange-300 text-orange-900"
                  : "bg-zinc-100 border-zinc-300 text-zinc-800"
              }`}
            >
              <div className="flex justify-center mb-3">
                {result.status === "valid" && (
                  <CheckCircle2 className="h-16 w-16 text-emerald-600 animate-bounce" />
                )}
                {result.status === "offline_valid" && (
                  <div className="relative">
                    <CheckCircle2 className="h-16 w-16 text-emerald-600" />
                    <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs">
                      <CloudUpload size={13} />
                    </span>
                  </div>
                )}
                {result.status === "not_in_local_data" && (
                  <div className="relative">
                    <div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 shadow-2xs">
                      <Search className="h-8 w-8" />
                    </div>
                    <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white shadow-xs">
                      <WifiOff size={13} />
                    </span>
                  </div>
                )}
                {result.status === "used" && <AlertTriangle className="h-16 w-16 text-amber-600" />}
                {result.status === "wrong_event" && <XCircle className="h-16 w-16 text-red-600" />}
                {result.status === "cancelled" && <XCircle className="h-16 w-16 text-red-600" />}
                {result.status === "refunded" && <RotateCcw className="h-16 w-16 text-orange-600" />}
                {(result.status === "not_found" || result.status === "error") && (
                  <HelpCircle className="h-16 w-16 text-zinc-500" />
                )}
              </div>

              {result.isOffline && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-200/90 text-emerald-950 mb-2">
                  <CloudUpload size={12} />
                  <span>OFFLINE SCAN QUEUED</span>
                </div>
              )}

              <h2 className="text-2xl font-black uppercase tracking-tight">{result.title}</h2>
              <p className="text-sm font-semibold mt-1 opacity-90">{result.message}</p>

              {result.order && (
                <div className="mt-4 pt-4 border-t border-black/10 text-left text-xs font-medium space-y-2 bg-white/80 rounded-xl p-3.5 shadow-xs">
                  <div className="flex items-start gap-3">
                    {result.order.image_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={result.order.image_url}
                        alt="Guest Portrait"
                        className="h-16 w-16 rounded-xl object-cover border border-zinc-200 shadow-xs shrink-0"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-zinc-200 text-zinc-500 font-bold shrink-0 text-sm">
                        {result.order.buyer_name ? result.order.buyer_name.charAt(0).toUpperCase() : "?"}
                      </div>
                    )}
                    <div className="space-y-0.5 min-w-0 flex-1">
                      {result.order.buyer_name && (
                        <p className="text-sm font-black text-zinc-900 truncate">{result.order.buyer_name}</p>
                      )}
                      {result.order.guest_title && (
                        <p className="text-[11px] font-bold text-violet-700 truncate">{result.order.guest_title}</p>
                      )}
                      {result.order.organization && (
                        <p className="text-[11px] text-zinc-600 truncate">{result.order.organization}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-200/60 text-[11px]">
                    {result.order.seat_label && (
                      <p>
                        <strong className="font-bold text-zinc-700">Seat:</strong>{" "}
                        <span className="font-bold text-blue-700">{result.order.seat_label}</span>
                      </p>
                    )}
                    {result.order.tier_name && (
                      <p>
                        <strong className="font-bold text-zinc-700">Tier:</strong> {result.order.tier_name}
                      </p>
                    )}
                    {result.order.buyer_email && (
                      <p className="truncate">
                        <strong className="font-bold text-zinc-700">Email:</strong> {result.order.buyer_email}
                      </p>
                    )}
                    {result.order.phone && (
                      <p>
                        <strong className="font-bold text-zinc-700">Phone:</strong> {result.order.phone}
                      </p>
                    )}
                    {result.order.checked_in_at && (
                      <p className="col-span-2 text-emerald-800 font-bold">
                        <strong className="font-bold">Recorded:</strong>{" "}
                        {new Date(result.order.checked_in_at).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <span className="text-xs font-bold text-zinc-500">
                Auto-reset in {autoResetTimer ?? 3}s...
              </span>
              <button
                type="button"
                onClick={resetScanner}
                className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-700 shadow-xs"
              >
                <RefreshCw size={16} /> Scan Next
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Camera Feed Area */}
            <div className="relative aspect-square max-h-[360px] bg-black flex items-center justify-center overflow-hidden rounded-2xl">
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
              <canvas ref={canvasRef} className="hidden" />

              {/* Viewfinder Target Graphic */}
              {cameraActive && !cameraError && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-56 h-56 border-2 border-orange-500/80 rounded-3xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]">
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-orange-500 rounded-tl-xl" />
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-orange-500 rounded-tr-xl" />
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-orange-500 rounded-bl-xl" />
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-orange-500 rounded-br-xl" />
                  </div>
                </div>
              )}

              {loading && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center text-white">
                  <div className="text-center space-y-2">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto text-orange-500" />
                    <p className="text-xs font-black uppercase tracking-wider">Verifying Ticket...</p>
                  </div>
                </div>
              )}

              {cameraError && (
                <div className="absolute inset-0 bg-zinc-900 p-6 flex items-center justify-center text-center text-zinc-300">
                  <div>
                    <Camera className="h-10 w-10 mx-auto text-zinc-500 mb-2" />
                    <p className="text-xs font-semibold text-zinc-400">{cameraError}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Manual Entry Fallback Form */}
            <div className="mt-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  verifyTicketCode(manualCode);
                }}
                className="flex gap-2"
              >
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="Or enter ticket code manually..."
                    className="w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 py-2.5 text-sm font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !manualCode.trim()}
                  className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-50"
                >
                  Verify
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
