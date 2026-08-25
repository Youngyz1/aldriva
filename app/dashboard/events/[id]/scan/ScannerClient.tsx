"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import jsQR from "jsqr";
import { Camera, CheckCircle2, AlertTriangle, XCircle, RotateCcw, HelpCircle, ArrowLeft, Search, RefreshCw } from "lucide-react";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";

type ScanResultState = {
  status: "valid" | "used" | "wrong_event" | "cancelled" | "refunded" | "not_found" | "error";
  title: string;
  message: string;
  order?: {
    id?: string;
    buyer_name?: string | null;
    buyer_email?: string | null;
    quantity?: number;
    seat_label?: string | null;
    checked_in_at?: string | null;
    event_title?: string | null;
  };
};

type Props = {
  eventId: string;
  eventTitle: string;
  eventDetails?: string;
};

export default function ScannerClient({ eventId, eventTitle, eventDetails }: Props) {
  const [manualCode, setManualCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResultState | null>(null);
  const [cameraActive, setCameraActive] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [autoResetTimer, setAutoResetTimer] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isVerifyingRef = useRef<boolean>(false);

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

      // Extract code if raw string is full URL e.g. https://domain/verify/CODE
      let cleanCode = rawCode.trim();
      if (cleanCode.includes("/verify/")) {
        const parts = cleanCode.split("/verify/");
        cleanCode = parts[parts.length - 1].split("?")[0].split("#")[0];
      }

      try {
        const res = await fetch("/api/verify-ticket", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: cleanCode,
            action: "checkin",
            eventId,
          }),
        });

        const data = await res.json();

        if (res.ok && data.success) {
          // Valid Check-In Success
          setResult({
            status: "valid",
            title: "CHECK-IN SUCCESSFUL",
            message: "Guest verified and marked checked in.",
            order: data.order,
          });
        } else {
          const status = data.status || data.error || "error";
          if (status === "used" || data.message?.includes("already used")) {
            setResult({
              status: "used",
              title: "ALREADY CHECKED IN",
              message: data.message || "This ticket was previously checked in.",
              order: data.order,
            });
          } else if (status === "wrong_event" || data.error === "WRONG_EVENT") {
            setResult({
              status: "wrong_event",
              title: "WRONG EVENT",
              message: "This ticket belongs to a different event.",
              order: data.order,
            });
          } else if (status === "cancelled") {
            setResult({
              status: "cancelled",
              title: "TICKET CANCELLED",
              message: "This ticket has been cancelled.",
              order: data.order,
            });
          } else if (status === "refunded") {
            setResult({
              status: "refunded",
              title: "TICKET REFUNDED",
              message: "This ticket was refunded.",
              order: data.order,
            });
          } else if (res.status === 404 || status === "not_found") {
            setResult({
              status: "not_found",
              title: "TICKET NOT FOUND",
              message: "Unrecognized QR code or ticket number.",
            });
          } else {
            setResult({
              status: "error",
              title: "CHECK-IN FAILED",
              message: data.message || data.error || "Could not check in ticket.",
            });
          }
        }
      } catch (err: unknown) {
        setResult({
          status: "error",
          title: "SCAN ERROR",
          message: "Network or server error verifying ticket.",
        });
      } finally {
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
      }
    },
    [eventId, resetScanner]
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
      } catch (err: unknown) {
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
          <Link
            href={`/dashboard/events`}
            className="flex items-center gap-1.5 shrink-0 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
          >
            <ArrowLeft size={14} /> Back to Events
          </Link>
        }
      />

      {/* Main Scanner Container */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white overflow-hidden shadow-sm">
        {/* Result Overlay State Banner */}
        {result ? (
          <div className="p-6 text-center space-y-4">
            <div
              className={`rounded-2xl p-6 border ${
                result.status === "valid"
                  ? "bg-emerald-50 border-emerald-300 text-emerald-900"
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
                {result.status === "valid" && <CheckCircle2 className="h-16 w-16 text-emerald-600 animate-bounce" />}
                {result.status === "used" && <AlertTriangle className="h-16 w-16 text-amber-600" />}
                {result.status === "wrong_event" && <XCircle className="h-16 w-16 text-red-600" />}
                {result.status === "cancelled" && <XCircle className="h-16 w-16 text-red-600" />}
                {result.status === "refunded" && <RotateCcw className="h-16 w-16 text-orange-600" />}
                {(result.status === "not_found" || result.status === "error") && <HelpCircle className="h-16 w-16 text-zinc-500" />}
              </div>

              <h2 className="text-2xl font-black uppercase tracking-tight">{result.title}</h2>
              <p className="text-sm font-semibold mt-1 opacity-90">{result.message}</p>

              {result.order && (
                <div className="mt-4 pt-4 border-t border-black/10 text-left text-xs font-medium space-y-1 bg-white/60 rounded-xl p-3">
                  {result.order.buyer_name && (
                    <p><strong className="font-bold">Guest:</strong> {result.order.buyer_name}</p>
                  )}
                  {result.order.seat_label && (
                    <p><strong className="font-bold">Seat:</strong> {result.order.seat_label}</p>
                  )}
                  {result.order.checked_in_at && (
                    <p><strong className="font-bold">Checked In At:</strong> {new Date(result.order.checked_in_at).toLocaleTimeString()}</p>
                  )}
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
                className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-700"
              >
                <RefreshCw size={16} /> Scan Next
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Camera Feed Area */}
            <div className="relative aspect-square max-h-[360px] bg-black flex items-center justify-center overflow-hidden">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />
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
            <div className="p-4 bg-zinc-50 border-t border-zinc-200">
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
