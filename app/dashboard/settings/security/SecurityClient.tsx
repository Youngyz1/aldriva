"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { SettingsCard } from "@/components/ui/settings-card";
import { AlertTriangle, Loader2, X } from "lucide-react";

export default function SecurityClient({
  email,
  createdAt,
  lastSignIn,
}: {
  email: string;
  createdAt: string;
  lastSignIn?: string;
}) {
  const router = useRouter();

  // Password change state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  // Delete account modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  async function handlePasswordUpdate(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!newPassword) {
      setError("Please enter a new password.");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setUpdatingPassword(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw new Error(updateError.message);

      setNewPassword("");
      setConfirmPassword("");
      showToast("Password updated successfully.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setUpdatingPassword(false);
    }
  }

  async function sendPasswordReset() {
    setError("");
    setSendingReset(true);
    try {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        (typeof window !== "undefined" ? window.location.origin : "");
      const redirectTo = appUrl ? `${appUrl}/reset-password` : undefined;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (resetError) throw new Error(resetError.message);
      showToast("Password reset email sent. Check your inbox.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send password reset email.");
    } finally {
      setSendingReset(false);
    }
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDeleteError("");

    if (deleteConfirmEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
      setDeleteError("Email address does not match. Please type your email exactly.");
      return;
    }

    if (!deletePassword) {
      setDeleteError("Please enter your current password to confirm.");
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to schedule account deletion.");

      // Sign out locally then redirect to home
      await supabase.auth.signOut();
      router.push("/");
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setDeleting(false);
    }
  }

  // Format dates
  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const emailMatches =
    deleteConfirmEmail.trim().toLowerCase() === email.trim().toLowerCase();

  return (
    <div className="space-y-6">
      {toast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {toast}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* Direct Password Update */}
      <form onSubmit={handlePasswordUpdate}>
        <SettingsCard
          title="Update Password"
          description="Update your account password. Must be at least 6 characters."
          footer={
            <button
              type="submit"
              disabled={updatingPassword}
              className="rounded-xl bg-orange-600 px-5 py-2.5 text-xs font-black text-white hover:bg-orange-700 disabled:opacity-60 transition"
            >
              {updatingPassword ? "Updating..." : "Update Password"}
            </button>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-zinc-500">
                New Password
              </span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold outline-hidden transition focus:border-orange-500 focus:ring-4 focus:ring-orange-100 sm:rounded-xl sm:px-4 sm:py-2.5"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-zinc-500">
                Confirm New Password
              </span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold outline-hidden transition focus:border-orange-500 focus:ring-4 focus:ring-orange-100 sm:rounded-xl sm:px-4 sm:py-2.5"
              />
            </label>
          </div>
        </SettingsCard>
      </form>

      {/* Password Reset via Email Link */}
      <SettingsCard
        title="Email Password Reset Link"
        description="Alternatively, we can send you an email containing a secure link to reset your password outside the app."
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-zinc-800">Send Reset Email to</p>
            <p className="text-xs font-medium text-zinc-500">{email}</p>
          </div>
          <button
            type="button"
            onClick={sendPasswordReset}
            disabled={sendingReset}
            className="rounded-xl border border-zinc-200 bg-white px-5 py-3 text-sm font-black text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 transition text-center"
          >
            {sendingReset ? "Sending..." : "Send Reset Email"}
          </button>
        </div>
      </SettingsCard>

      {/* Account Info Details */}
      <SettingsCard
        title="Access History"
        description="Metadata and security statistics regarding your account access."
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between py-2 border-b border-zinc-100">
            <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Registered Email</span>
            <span className="text-sm font-bold text-zinc-900">{email}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-zinc-100">
            <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Account Created</span>
            <span className="text-sm font-bold text-zinc-900">{formatDate(createdAt)}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-xs font-black uppercase tracking-wide text-zinc-500">Last Signed In</span>
            <span className="text-sm font-bold text-zinc-900">{formatDate(lastSignIn)}</span>
          </div>
        </div>
      </SettingsCard>

      {/* ── Danger Zone ─────────────────────────────────────────────────── */}
      <div className="relative rounded-2xl border-2 border-red-200 bg-red-50/40 p-6">
        {/* Label badge */}
        <span className="absolute -top-3 left-5 rounded-full border border-red-300 bg-white px-3 py-0.5 text-xs font-black uppercase tracking-widest text-red-600">
          Danger Zone
        </span>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-black text-zinc-900">Delete Account</h3>
            <p className="mt-1 text-sm font-medium text-zinc-500 max-w-md">
              Schedule your account for permanent deletion. You will have a{" "}
              <strong className="text-zinc-700">14-day grace period</strong> to change your
              mind. After that, all your data — profile, events, fundraisers, and organizer
              pages — will be irreversibly purged.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setDeleteConfirmEmail("");
              setDeletePassword("");
              setDeleteError("");
              setShowDeleteModal(true);
            }}
            className="shrink-0 rounded-xl border-2 border-red-500 bg-white px-5 py-2.5 text-sm font-black text-red-600 transition hover:bg-red-50 active:scale-95"
          >
            Delete Account
          </button>
        </div>
      </div>

      {/* ── Delete Confirmation Modal ──────────────────────────────────── */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDeleteModal(false);
          }}
        >
          <div className="relative w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
            {/* Close button */}
            <button
              type="button"
              onClick={() => setShowDeleteModal(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Icon + title */}
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h2 className="text-base font-black text-zinc-900">Delete your account?</h2>
                <p className="text-xs font-medium text-zinc-500">This starts a 14-day grace period.</p>
              </div>
            </div>

            {/* What will happen */}
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p className="mb-2 font-black">What will happen:</p>
              <ul className="space-y-1.5 font-medium">
                <li>• Your public profile and organizer pages are hidden immediately.</li>
                <li>• All your events and fundraisers are hidden from public listings.</li>
                <li>• You are signed out of all sessions.</li>
                <li>• After 14 days, <strong>all data is permanently deleted</strong>.</li>
                <li>• You can cancel by logging in before the grace period ends.</li>
              </ul>
            </div>

            <form onSubmit={handleDeleteAccount} className="space-y-4">
              {/* Type email to confirm */}
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-zinc-500">
                  Type your email to confirm
                </span>
                <input
                  type="email"
                  value={deleteConfirmEmail}
                  onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                  placeholder={email}
                  autoComplete="off"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-100"
                />
              </label>

              {/* Password */}
              <label className="block">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-zinc-500">
                  Enter your password to confirm
                </span>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold outline-none transition focus:border-red-400 focus:ring-4 focus:ring-red-100"
                />
              </label>

              {deleteError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {deleteError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-black text-zinc-700 transition hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!emailMatches || !deletePassword || deleting}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Scheduling…
                    </>
                  ) : (
                    "Delete My Account"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
