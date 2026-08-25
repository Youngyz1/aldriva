"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { UserPlus, Shield, Scan, Trash2, Mail, RefreshCw, Copy, Check, ChevronDown, ArrowLeft, Loader2 } from "lucide-react";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import AdminConfirmDialog from "@/components/admin/AdminConfirmDialog";

type Member = {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string | null;
  role: "event_manager" | "ticket_scanner";
  status: "active" | "removed";
  created_at: string;
};

type Invitation = {
  id: string;
  email: string;
  role: "event_manager" | "ticket_scanner";
  status: "pending" | "accepted" | "declined" | "expired" | "revoked";
  created_at: string;
  expires_at: string;
};

type Props = {
  eventId: string;
  eventTitle: string;
};

export default function TeamClient({ eventId, eventTitle }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Invite Form State
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"event_manager" | "ticket_scanner">("ticket_scanner");
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [manualAcceptUrl, setManualAcceptUrl] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Revoke / Cancel Dialog State
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
  const [inviteToCancel, setInviteToCancel] = useState<Invitation | null>(null);
  const [workingAction, setWorkingAction] = useState<string | null>(null);

  const fetchTeamData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/events/${eventId}/team`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load team roster.");
      setMembers(data.members || []);
      setInvitations(data.invitations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load team roster.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchTeamData();
  }, [fetchTeamData]);

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setSubmittingInvite(true);
    setError("");
    setSuccessMsg("");
    setManualAcceptUrl(null);

    try {
      const res = await fetch(`/api/events/${eventId}/team/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Could not send invitation.");

      setInviteEmail("");
      if (data.acceptUrl && !data.emailed) {
        setManualAcceptUrl(data.acceptUrl);
        setSuccessMsg("Invitation created. Share the link manually below.");
      } else {
        setSuccessMsg(`Invitation sent to ${inviteEmail}.`);
      }
      await fetchTeamData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invitation.");
    } finally {
      setSubmittingInvite(false);
    }
  }

  async function handleRevokeMember() {
    if (!memberToRemove) return;
    setWorkingAction(`revoke:${memberToRemove.id}`);
    setError("");
    try {
      const res = await fetch(`/api/events/${eventId}/team/members/${memberToRemove.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not revoke member access.");

      setSuccessMsg("Member access revoked successfully.");
      setMemberToRemove(null);
      await fetchTeamData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke member.");
    } finally {
      setWorkingAction(null);
    }
  }

  async function handleCancelInvite() {
    if (!inviteToCancel) return;
    setWorkingAction(`cancel:${inviteToCancel.id}`);
    setError("");
    try {
      const res = await fetch(`/api/events/${eventId}/team/invitations/${inviteToCancel.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not cancel invitation.");

      setSuccessMsg("Invitation cancelled successfully.");
      setInviteToCancel(null);
      await fetchTeamData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel invitation.");
    } finally {
      setWorkingAction(null);
    }
  }

  async function handleResendInvite(inviteId: string) {
    setWorkingAction(`resend:${inviteId}`);
    setError("");
    setSuccessMsg("");
    setManualAcceptUrl(null);
    try {
      const res = await fetch(`/api/events/${eventId}/team/invitations/${inviteId}/resend`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not resend invitation.");

      if (data.acceptUrl && !data.emailed) {
        setManualAcceptUrl(data.acceptUrl);
        setSuccessMsg("New token generated. Share the updated link manually below.");
      } else {
        setSuccessMsg("Invitation resent successfully!");
      }
      await fetchTeamData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend invitation.");
    } finally {
      setWorkingAction(null);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  }

  const activeMembers = members.filter((m) => m.status === "active");
  const pendingInvitations = invitations.filter((i) => i.status === "pending");
  const historyInvitations = invitations.filter((i) => i.status !== "pending");

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        eyebrow="Event Management"
        title={`Team Staff — ${eventTitle}`}
        description="Invite staff, assign roles, and manage door permissions."
        action={
          <div className="flex gap-2">
            <Link
              href={`/dashboard/events/${eventId}/scan`}
              className="flex items-center gap-1.5 shrink-0 rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-black text-white hover:bg-orange-700"
            >
              <Scan size={15} /> Launch Door Scanner
            </Link>
          </div>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700">
          {successMsg}
        </div>
      )}

      {/* Manual Accept URL Copy Box */}
      {manualAcceptUrl && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 space-y-2">
          <p className="text-xs font-black uppercase text-orange-800">
            Shareable Invitation Link (Email Not Configured)
          </p>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              readOnly
              value={manualAcceptUrl}
              className="flex-1 rounded-xl border border-orange-200 bg-white px-3 py-2 text-xs font-mono text-zinc-800"
            />
            <button
              type="button"
              onClick={() => copyToClipboard(manualAcceptUrl)}
              className="flex items-center gap-1 shrink-0 rounded-xl bg-orange-600 px-3 py-2 text-xs font-bold text-white hover:bg-orange-700"
            >
              {copiedUrl ? <Check size={14} /> : <Copy size={14} />}
              {copiedUrl ? "Copied!" : "Copy Link"}
            </button>
          </div>
        </div>
      )}

      {/* Invite Staff Form Card */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs sm:p-6">
        <h2 className="text-lg font-black text-zinc-950 flex items-center gap-2">
          <UserPlus size={18} className="text-orange-600" /> Invite Event Staff
        </h2>
        <form onSubmit={handleSendInvite} className="mt-4 grid gap-4 sm:grid-cols-3 items-end">
          <div className="sm:col-span-1">
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="staff@example.com"
              className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm font-semibold text-zinc-900 focus:ring-2 focus:ring-orange-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
              Role Permission
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as any)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm font-bold text-zinc-900 focus:ring-2 focus:ring-orange-500 focus:outline-none"
            >
              <option value="ticket_scanner">Ticket Scanner (Door Only)</option>
              <option value="event_manager">Event Manager (Full Access)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={submittingInvite || !inviteEmail.trim()}
            className="rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submittingInvite ? <Loader2 className="animate-spin h-4 w-4" /> : <Mail size={16} />}
            Send Invitation
          </button>
        </form>
      </div>

      {/* Active Team Members List */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-zinc-200 bg-zinc-50/80">
          <h3 className="text-sm font-black uppercase tracking-wider text-zinc-700">
            Active Team Members ({activeMembers.length})
          </h3>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-orange-500" />
          </div>
        ) : activeMembers.length === 0 ? (
          <div className="p-8 text-center text-sm font-medium text-zinc-500">
            No active staff members assigned to this event yet.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {activeMembers.map((m) => (
              <div key={m.id} className="p-4 sm:px-6 flex items-center justify-between gap-4 hover:bg-zinc-50/60">
                <div className="min-w-0">
                  <p className="font-black text-zinc-950 text-sm">{m.user_name}</p>
                  <p className="text-xs text-zinc-500 font-semibold">{m.user_email || m.user_id}</p>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${
                      m.role === "event_manager"
                        ? "bg-violet-100 text-violet-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {m.role === "event_manager" ? "Manager" : "Scanner"}
                  </span>

                  <button
                    type="button"
                    onClick={() => setMemberToRemove(m)}
                    className="rounded-lg border border-red-200 bg-white p-2 text-red-600 hover:bg-red-50"
                    title="Revoke access"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending Invitations List */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-zinc-200 bg-amber-50/50">
          <h3 className="text-sm font-black uppercase tracking-wider text-amber-900">
            Pending Invitations ({pendingInvitations.length})
          </h3>
        </div>

        {pendingInvitations.length === 0 ? (
          <div className="p-6 text-center text-sm font-medium text-zinc-400">
            No pending invitations for this event.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {pendingInvitations.map((inv) => (
              <div key={inv.id} className="p-4 sm:px-6 flex items-center justify-between gap-4">
                <div>
                  <p className="font-black text-zinc-900 text-sm">{inv.email}</p>
                  <p className="text-xs text-zinc-400 font-medium">
                    Invited {new Date(inv.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-amber-100 text-amber-800 px-2.5 py-1 text-xs font-black uppercase">
                    {inv.role === "event_manager" ? "Manager" : "Scanner"}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleResendInvite(inv.id)}
                    disabled={workingAction === `resend:${inv.id}`}
                    className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-black text-zinc-700 hover:bg-zinc-50 flex items-center gap-1"
                  >
                    <RefreshCw size={13} /> Resend
                  </button>

                  <button
                    type="button"
                    onClick={() => setInviteToCancel(inv)}
                    className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-black text-red-600 hover:bg-red-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Collapsible Invitation History */}
      {historyInvitations.length > 0 && (
        <details className="rounded-2xl border border-zinc-200/80 bg-white overflow-hidden shadow-xs group">
          <summary className="px-5 py-4 font-black text-xs uppercase tracking-wider text-zinc-500 cursor-pointer flex items-center justify-between select-none">
            <span>Invitation History ({historyInvitations.length})</span>
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="divide-y divide-zinc-100 border-t border-zinc-100">
            {historyInvitations.map((inv) => (
              <div key={inv.id} className="p-4 px-6 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-zinc-900">{inv.email}</span>
                  <span className="text-zinc-400 ml-2 font-mono">({inv.role})</span>
                </div>
                <span className="font-black uppercase text-zinc-400">{inv.status}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Confirmation Dialog for Revoking Active Member */}
      <AdminConfirmDialog
        open={memberToRemove !== null}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
        title="Revoke Staff Access"
        description={`Revoke access for ${memberToRemove?.user_name || "this user"}? They will immediately lose ticket scanning and event permissions for this event.`}
        confirmLabel="Revoke Access"
        onConfirm={handleRevokeMember}
        loading={workingAction?.startsWith("revoke:")}
        variant="danger"
      />

      {/* Confirmation Dialog for Cancelling Pending Invitation */}
      <AdminConfirmDialog
        open={inviteToCancel !== null}
        onOpenChange={(open) => !open && setInviteToCancel(null)}
        title="Cancel Invitation"
        description={`Cancel invitation for ${inviteToCancel?.email}? The invite link will be permanently invalidated.`}
        confirmLabel="Cancel Invite"
        onConfirm={handleCancelInvite}
        loading={workingAction?.startsWith("cancel:")}
        variant="danger"
      />
    </div>
  );
}
