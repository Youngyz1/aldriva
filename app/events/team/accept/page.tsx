"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCircle2, AlertTriangle, XCircle, Clock, Loader2, ArrowRight, Shield, Scan } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { BRAND } from "@/config/branding";

type Preview = {
  email: string;
  eventId: string;
  role: string;
  roleLabel: string | null;
  positionLabel: string | null;
  staffName: string | null;
};

function AcceptInvitationInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations("Events");
  const token = searchParams.get("token")?.trim() || "";

  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [staffName, setStaffName] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [result, setResult] = useState<{
    status: "success" | "email_mismatch" | "expired" | "already_used" | "invalid" | "error";
    message: string;
    role?: string;
    roleLabel?: string | null;
    positionLabel?: string | null;
    staffName?: string | null;
    eventId?: string;
  } | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setResult({
        status: "invalid",
        message: "No invitation token was provided in the link.",
      });
      return;
    }

    async function checkAuthAndPreview() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        // Redirect to login preserving the token return path
        const currentPath = `/events/team/accept?token=${encodeURIComponent(token)}`;
        router.push(`/login?redirect=${encodeURIComponent(currentPath)}`);
        return;
      }

      setUserEmail(user.email || null);

      try {
        const res = await fetch(`/api/events/team/accept?token=${encodeURIComponent(token)}`);
        const data = await res.json();

        if (res.ok && data.ok) {
          setPreview({
            email: data.email,
            eventId: data.eventId,
            role: data.role,
            roleLabel: data.roleLabel ?? null,
            positionLabel: data.positionLabel ?? null,
            staffName: data.staffName ?? null,
          });
          setStaffName(data.staffName || "");
        } else if (res.status === 403) {
          setResult({
            status: "email_mismatch",
            message: data.error || "This invitation was sent to a different email address.",
          });
        } else if (res.status === 410) {
          setResult({
            status: "expired",
            message: data.error || "This invitation link has expired.",
          });
        } else if (res.status === 409) {
          setResult({
            status: "already_used",
            message: data.error || "This invitation has already been accepted.",
          });
        } else {
          setResult({
            status: "invalid",
            message: data.error || "Invalid invitation link.",
          });
        }
      } catch {
        setResult({
          status: "error",
          message: "Could not load invitation due to a network error.",
        });
      } finally {
        setLoading(false);
      }
    }

    checkAuthAndPreview();
  }, [token, router]);

  async function handleAccept() {
    if (!preview || accepting) return;
    setAccepting(true);
    try {
      const res = await fetch("/api/events/team/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, staffName }),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        setResult({
          status: "success",
          message: data.message || "Invitation accepted successfully!",
          role: data.role,
          roleLabel: data.roleLabel ?? null,
          positionLabel: data.positionLabel ?? null,
          staffName: data.staffName ?? null,
          eventId: data.eventId,
        });
        setPreview(null);
      } else if (res.status === 403) {
        setResult({
          status: "email_mismatch",
          message: data.error || "This invitation was sent to a different email address.",
        });
      } else if (res.status === 410) {
        setResult({
          status: "expired",
          message: data.error || "This invitation link has expired.",
        });
      } else if (res.status === 409) {
        setResult({
          status: "already_used",
          message: data.error || "This invitation has already been accepted.",
        });
      } else {
        setResult({
          status: "error",
          message: data.error || "Could not accept invitation. Please try again.",
        });
      }
    } catch {
      setResult({
        status: "error",
        message: "Could not accept invitation due to a network error.",
      });
    } finally {
      setAccepting(false);
    }
  }

  const permissionLabel =
    (preview?.role ?? result?.role) === "event_manager"
      ? t("staffPermissionManager")
      : t("staffPermissionScanner");
  const shownRoleLabel = preview?.roleLabel ?? result?.roleLabel ?? null;
  const shownPositionLabel = preview?.positionLabel ?? result?.positionLabel ?? null;

  return (
    <main className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center">
        {/* Branding Header */}
        <div className="flex items-center justify-center gap-2">
          <img src="/icons/icon-source.png" alt="Logo" className="h-6 w-6 object-contain" />
          <span className="font-black text-sm uppercase tracking-widest text-orange-600">
            {BRAND.name}
          </span>
        </div>

        <h1 className="text-2xl font-black text-zinc-950">Event Team Invitation</h1>

        {loading && (
          <div className="py-8 space-y-3">
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-orange-600" />
            <p className="text-sm font-bold text-zinc-500">Loading invitation...</p>
          </div>
        )}

        {!loading && preview && !result && (
          <div className="space-y-5 text-left">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 space-y-2">
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                Invited as {preview.email}
              </p>
              {(shownRoleLabel || shownPositionLabel) && (
                <p className="text-sm font-black text-zinc-900">
                  {[shownRoleLabel, shownPositionLabel].filter(Boolean).join(" · ")}
                </p>
              )}
              <p className="flex items-center gap-1.5 text-xs font-black uppercase text-zinc-600">
                {(preview.role === "event_manager" ? <Shield size={13} /> : <Scan size={13} />)}
                {permissionLabel}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
                {t("staffAcceptNameLabel")}
              </label>
              <input
                type="text"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder={t("staffNamePlaceholder")}
                maxLength={120}
                className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm font-semibold text-zinc-900 focus:ring-2 focus:ring-orange-500 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={handleAccept}
              disabled={accepting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-600 px-6 py-3.5 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {accepting && <Loader2 className="animate-spin h-4 w-4" />}
              {accepting ? t("staffAccepting") : t("staffAcceptButton")}
            </button>
          </div>
        )}

        {!loading && result && (
          <div className="space-y-6">
            {result.status === "success" && (
              <div className="space-y-4">
                <div className="h-16 w-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 size={36} />
                </div>
                <h2 className="text-xl font-black text-emerald-900">Welcome to the Team!</h2>
                <p className="text-sm font-semibold text-zinc-600">{result.message}</p>
                {(result.staffName || shownRoleLabel || shownPositionLabel) && (
                  <p className="text-sm font-bold text-zinc-800">
                    {[result.staffName, shownRoleLabel, shownPositionLabel].filter(Boolean).join(" · ")}
                  </p>
                )}
                <p className="text-xs font-black uppercase text-zinc-500">{permissionLabel}</p>
                <div className="pt-4">
                  {result.role === "ticket_scanner" ? (
                    <Link
                      href={result.eventId ? `/dashboard/events/${result.eventId}/scan` : "/dashboard/events"}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-600 px-6 py-3.5 text-sm font-black text-white hover:bg-orange-700 shadow-md"
                    >
                      Launch Ticket Scanner <ArrowRight size={16} />
                    </Link>
                  ) : (
                    <Link
                      href={result.eventId ? `/dashboard/events/${result.eventId}/team` : "/dashboard/events"}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-600 px-6 py-3.5 text-sm font-black text-white hover:bg-orange-700 shadow-md"
                    >
                      Go to Event Management <ArrowRight size={16} />
                    </Link>
                  )}
                </div>
              </div>
            )}

            {result.status === "email_mismatch" && (
              <div className="space-y-4">
                <div className="h-16 w-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
                  <AlertTriangle size={36} />
                </div>
                <h2 className="text-xl font-black text-amber-900">Email Address Mismatch</h2>
                <p className="text-sm font-semibold text-zinc-600">{result.message}</p>
                {userEmail && (
                  <p className="text-xs font-mono bg-zinc-100 p-2.5 rounded-xl text-zinc-700">
                    Currently signed in as: <strong>{userEmail}</strong>
                  </p>
                )}
                <div className="pt-2">
                  <Link
                    href={`/login?redirect=${encodeURIComponent(`/events/team/accept?token=${token}`)}`}
                    className="w-full inline-block rounded-2xl bg-zinc-900 px-6 py-3 text-sm font-black text-white hover:bg-black"
                  >
                    Switch Account & Try Again
                  </Link>
                </div>
              </div>
            )}

            {result.status === "expired" && (
              <div className="space-y-4">
                <div className="h-16 w-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
                  <Clock size={36} />
                </div>
                <h2 className="text-xl font-black text-red-900">Invitation Expired</h2>
                <p className="text-sm font-semibold text-zinc-600">{result.message}</p>
                <div className="pt-2">
                  <Link
                    href="/dashboard"
                    className="w-full inline-block rounded-2xl border border-zinc-200 px-6 py-3 text-sm font-black text-zinc-700 hover:bg-zinc-50"
                  >
                    Return to Dashboard
                  </Link>
                </div>
              </div>
            )}

            {(result.status === "already_used" || result.status === "invalid" || result.status === "error") && (
              <div className="space-y-4">
                <div className="h-16 w-16 bg-zinc-100 text-zinc-600 rounded-full flex items-center justify-center mx-auto">
                  <XCircle size={36} />
                </div>
                <h2 className="text-xl font-black text-zinc-900">Invalid Invitation</h2>
                <p className="text-sm font-semibold text-zinc-600">{result.message}</p>
                <div className="pt-2">
                  <Link
                    href="/dashboard"
                    className="w-full inline-block rounded-2xl bg-orange-600 px-6 py-3 text-sm font-black text-white hover:bg-orange-700"
                  >
                    Return to Dashboard
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </main>
    }>
      <AcceptInvitationInner />
    </Suspense>
  );
}
