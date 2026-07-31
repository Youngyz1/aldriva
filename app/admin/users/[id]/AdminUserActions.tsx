"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminUserActions({
  userId,
  status,
}: {
  userId: string;
  status: string;
}) {
  const router = useRouter();
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function updateStatus(nextStatus: "active" | "suspended") {
    setWorking(nextStatus);
    setMessage("");
    setError("");

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to update user.");
    } else {
      setMessage(nextStatus === "active" ? "User reactivated." : "User suspended.");
      router.refresh();
    }
    setWorking(null);
  }

  async function resetPassword() {
    setWorking("reset");
    setMessage("");
    setError("");

    const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
      method: "POST",
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Failed to send reset email.");
    } else {
      setMessage("Password reset email sent.");
    }
    setWorking(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "active" ? (
          <button
            disabled={working !== null}
            onClick={() => updateStatus("suspended")}
            className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-black text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {working === "suspended" ? "Suspending..." : "Suspend User"}
          </button>
        ) : (
          <button
            disabled={working !== null}
            onClick={() => updateStatus("active")}
            className="rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-black text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            {working === "active" ? "Reactivating..." : "Reactivate User"}
          </button>
        )}
        <button
          disabled={working !== null}
          onClick={resetPassword}
          className="rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-black text-violet-700 hover:bg-violet-50 disabled:opacity-50"
        >
          {working === "reset" ? "Sending..." : "Reset Password"}
        </button>
      </div>
      {message && <p className="text-sm font-semibold text-emerald-700">{message}</p>}
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
    </div>
  );
}
