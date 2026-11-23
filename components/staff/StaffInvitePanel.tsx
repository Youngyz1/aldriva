"use client";

import { useState } from "react";
import { createStaffInvitation } from "@/lib/actions/staff-invitations";
import type { AssignableRoleRow } from "@/lib/actions/staff-role-assignments";
import { composeInviteLink } from "@/lib/staff/invitation-compose";

// Creates a link-channel invitation for a staff member who has no login yet.
// The link is held only in component state, shown once, and never stored.
export default function StaffInvitePanel({
  businessId,
  staffMemberId,
  defaultEmail,
  assignableRoles,
  siteUrl,
}: {
  businessId: string;
  staffMemberId: string;
  defaultEmail: string | null;
  assignableRoles: AssignableRoleRow[];
  siteUrl: string;
}) {
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [roleId, setRoleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // accept_staff_invitation rejects owner and admin roles, so do not offer them.
  const roles = assignableRoles.filter((r) => r.platform_role !== "owner" && r.platform_role !== "admin");

  async function handleCreate() {
    setError(null);
    setCopied(false);
    setBusy(true);
    const res = await createStaffInvitation(businessId, staffMemberId, {
      email,
      channel: "link",
      role_id: roleId || null,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    const composed = composeInviteLink(siteUrl, res.data.token);
    if (!composed) {
      setError("The invitation was created but its link could not be built.");
      return;
    }
    setLink(composed);
  }

  async function handleCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError("Could not copy automatically. Select the link and copy it by hand.");
    }
  }

  return (
    <div className="mt-6 space-y-3 rounded-2xl border border-zinc-200 p-4">
      <h2 className="text-sm font-bold">Invite to log in</h2>
      <p className="text-xs text-zinc-500">
        Creates a one-time link for this person. They must sign in with a confirmed account that uses the email below.
      </p>

      {link ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-700">Copy this link now. It is shown only once.</p>
          <input readOnly value={link} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs" />
          <div className="flex gap-2">
            <button type="button" onClick={handleCopy} className="rounded-full bg-orange-600 px-4 py-2 text-xs font-bold text-white">
              {copied ? "Copied" : "Copy link"}
            </button>
            <button type="button" onClick={() => setLink(null)} className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-bold">
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          >
            <option value="">No extra role</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleCreate}
            disabled={busy}
            className="rounded-full bg-orange-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
          >
            {busy ? "Creating..." : "Create invitation"}
          </button>
        </div>
      )}

      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
