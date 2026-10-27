"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { IconUserPlus as UserPlus, IconScan as Scan, IconTrash as Trash2, IconMail as Mail, IconRefresh as RefreshCw, IconCopy as Copy, IconCheck as Check, IconChevronDown as ChevronDown, IconLoader2 as Loader2 } from "@tabler/icons-react";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import AdminConfirmDialog from "@/components/admin/AdminConfirmDialog";

type Member = {
  id: string;
  user_id: string | null;
  user_name: string;
  user_email: string | null;
  role: "event_manager" | "ticket_scanner";
  role_label: string | null;
  position_label: string | null;
  staff_name: string | null;
  status: "active" | "removed";
  created_at: string;
};

type Invitation = {
  id: string;
  email: string;
  role: "event_manager" | "ticket_scanner";
  role_label: string | null;
  position_label: string | null;
  staff_name: string | null;
  status: "pending" | "accepted" | "declined" | "expired" | "revoked" | "locked";
  is_accountless: boolean;
  created_at: string;
  expires_at: string;
};

type Props = {
  eventId: string;
  eventTitle: string;
};

type ActivityStaff = {
  id: string;
  name: string | null;
  role: "event_manager" | "ticket_scanner";
  roleLabel: string | null;
  positionLabel: string | null;
  entranceId: string | null;
  status: string;
  invitationStatus: string | null;
  accessStatus: "active" | "expired" | "revoked";
  successful: number;
  rejected: number;
  total: number;
  lastActivityAt: string | null;
};

type ActivityHistoryEntry = {
  entry_id: string;
  result: "successful" | "rejected";
  reason_code: string | null;
  scan_source: "online" | "offline" | "offline_sync";
  entrance_id: string | null;
  occurred_at: string;
};

type EventActivity = {
  successful: number;
  rejected: number;
  total: number;
  syncIssues: number;
  activeMembers: number;
  invitations: Record<string, number>;
};

export default function TeamClient({ eventId, eventTitle }: Props) {
  const t = useTranslations("Events");
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [activity, setActivity] = useState<EventActivity | null>(null);
  const [activityStaff, setActivityStaff] = useState<ActivityStaff[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [staffHistory, setStaffHistory] = useState<ActivityHistoryEntry[]>([]);
  const [staffSummary, setStaffSummary] = useState<{ successful: number; rejected: number; total: number } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasMore, setHistoryHasMore] = useState(false);

  // Invite Form State
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteAccountless, setInviteAccountless] = useState(false);
  const [inviteRole, setInviteRole] = useState<"event_manager" | "ticket_scanner">("ticket_scanner");
  const [inviteRoleLabel, setInviteRoleLabel] = useState("");
  const [invitePositionLabel, setInvitePositionLabel] = useState("");
  const [inviteStaffName, setInviteStaffName] = useState("");
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

  const fetchActivity = useCallback(async () => {
    setActivityLoading(true);
    setActivityError("");
    try {
      const res = await fetch(`/api/events/${eventId}/scan-activity`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load activity.");
      setActivity(data.event);
      setActivityStaff(data.staff || []);
    } catch {
      setActivity(null);
      setActivityStaff([]);
      setActivityError(t("loadActivityFailed"));
    } finally {
      setActivityLoading(false);
    }
  }, [eventId, t]);

  const loadStaffHistory = useCallback(async (staffId: string, page: number, append: boolean) => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const res = await fetch(`/api/events/${eventId}/scan-activity?staff_id=${encodeURIComponent(staffId)}&page=${page}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load staff history.");
      setStaffSummary(data.summary);
      setStaffHistory((current) => append ? [...current, ...(data.history || [])] : (data.history || []));
      setHistoryPage(page);
      setHistoryHasMore(Boolean(data.hasMore));
    } catch {
      setHistoryError(t("loadActivityFailed"));
    } finally {
      setHistoryLoading(false);
    }
  }, [eventId, t]);

  async function toggleStaffHistory(staffId: string) {
    if (selectedStaffId === staffId) {
      setSelectedStaffId(null);
      setStaffHistory([]);
      setStaffSummary(null);
      return;
    }
    setSelectedStaffId(staffId);
    setStaffHistory([]);
    setStaffSummary(null);
    await loadStaffHistory(staffId, 1, false);
  }

  useEffect(() => {
    fetchTeamData();
  }, [fetchTeamData]);

  useEffect(() => {
    void fetchActivity();
  }, [fetchActivity]);

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
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          roleLabel: inviteRoleLabel,
          positionLabel: invitePositionLabel,
          staffName: inviteStaffName,
          isAccountless: inviteAccountless,
          phone: invitePhone,
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Could not send invitation.");

      setInviteEmail("");
      setInvitePhone("");
      setInviteRoleLabel("");
      setInvitePositionLabel("");
      setInviteStaffName("");
      if (data.acceptUrl && !data.emailed) {
        setManualAcceptUrl(data.acceptUrl);
        setSuccessMsg("Invitation created. Share the link manually below.");
      } else {
        setSuccessMsg(`Invitation sent to ${inviteEmail}.`);
      }
      await fetchTeamData();
      await fetchActivity();
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
      await fetchActivity();
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
      await fetchActivity();
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
      await fetchActivity();
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
  const invitationLabel = (status: string | null) => {
    if (!status) return t("statusNone");
    if (status === "pending") return t("statusPending");
    if (status === "accepted") return t("statusAccepted");
    if (status === "declined") return t("statusDeclined");
    if (status === "locked") return t("statusLocked");
    if (status === "expired") return t("accessExpired");
    if (status === "revoked") return t("accessRevoked");
    return status;
  };
  const rejectionLabel = (reason: string | null) => {
    if (reason === "already_checked_in") return t("reasonAlreadyCheckedIn");
    if (reason === "ticket_not_found") return t("reasonTicketNotFound");
    if (reason === "wrong_event") return t("reasonWrongEvent");
    if (reason === "ticket_cancelled") return t("reasonCancelled");
    if (reason === "ticket_refunded") return t("reasonRefunded");
    if (reason === "ticket_not_valid" || reason === "ticket_ineligible") return t("reasonInvalid");
    if (reason === "unauthorized_entrance") return t("reasonUnauthorizedEntrance");
    if (reason === "verification_error") return t("reasonVerificationError");
    if (reason === "offline_conflict") return t("reasonOfflineConflict");
    return t("reasonOther");
  };

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

      <section aria-label={t("activitySummary")} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-black uppercase tracking-wide text-zinc-800">{t("activitySummary")}</h2>
          {activity && <p className="text-xs font-semibold text-zinc-500">{t("activeTeamMembers")}: {activity.activeMembers}</p>}
        </div>
        {activityLoading ? (
          <div className="py-5 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-orange-500" /></div>
        ) : activityError ? (
          <p role="status" className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            {activityError}
            <button type="button" onClick={() => void fetchActivity()} className="underline underline-offset-2">{t("retryActivity")}</button>
          </p>
        ) : activity ? (
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              [t("eventAdmissions"), activity.successful],
              [t("rejectedAttempts"), activity.rejected],
              [t("scanAttempts"), activity.total],
              [t("activeTeamMembers"), activity.activeMembers],
              [t("pendingInvitations"), activity.invitations.pending || 0],
              [t("syncIssues"), activity.syncIssues],
            ].map(([label, value]) => (
              <div key={String(label)} className="border-l-2 border-orange-500 pl-2">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{label}</dt>
                <dd className="text-lg font-black tabular-nums text-zinc-950">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>

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

      {/* Invite Staff Form — open, inputs + button keep their boundaries. */}
      <div className="space-y-4 border-t border-zinc-200 pt-6">
        <h2 className="flex items-center gap-2 border-b border-zinc-100 pb-3 text-lg font-black text-zinc-950">
          <UserPlus size={18} className="text-orange-600" /> Invite Event Staff
        </h2>
        <form onSubmit={handleSendInvite} className="mt-4 grid gap-4 sm:grid-cols-6 items-end">
          <label className="sm:col-span-6 flex items-center gap-2 text-sm font-semibold text-zinc-700">
            <input
              type="checkbox"
              checked={inviteAccountless}
              onChange={(e) => setInviteAccountless(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500"
            />
            Invite without an Aldriva account (verify by phone last four digits)
          </label>

          <div className="sm:col-span-2">
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

          {inviteAccountless && (
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
                Phone Number (E.164)
              </label>
              <input
                type="tel"
                inputMode="tel"
                required
                value={invitePhone}
                onChange={(e) => setInvitePhone(e.target.value)}
                placeholder="+2348012345678"
                autoComplete="tel"
                className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm font-semibold text-zinc-900 focus:ring-2 focus:ring-orange-500 focus:outline-none"
              />
            </div>
          )}

          <div className="sm:col-span-1">
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
              {t("staffRoleLabel")} <span className="font-semibold normal-case text-zinc-400">(optional)</span>
            </label>
            <input
              type="text"
              value={inviteRoleLabel}
              onChange={(e) => setInviteRoleLabel(e.target.value)}
              placeholder={t("staffRoleLabelPlaceholder")}
              maxLength={80}
              className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm font-semibold text-zinc-900 focus:ring-2 focus:ring-orange-500 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-1">
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
              {t("staffPositionLabel")} <span className="font-semibold normal-case text-zinc-400">(optional)</span>
            </label>
            <input
              type="text"
              value={invitePositionLabel}
              onChange={(e) => setInvitePositionLabel(e.target.value)}
              placeholder={t("staffPositionLabelPlaceholder")}
              maxLength={80}
              className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm font-semibold text-zinc-900 focus:ring-2 focus:ring-orange-500 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-1">
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
              {t("staffName")} <span className="font-semibold normal-case text-zinc-400">(optional)</span>
            </label>
            <input
              type="text"
              value={inviteStaffName}
              required={inviteAccountless}
              onChange={(e) => setInviteStaffName(e.target.value)}
              placeholder={t("staffNamePlaceholder")}
              maxLength={120}
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
              <option value="ticket_scanner">{t("staffPermissionScanner")}</option>
              <option value="event_manager">{t("staffPermissionManager")}</option>
            </select>
          </div>

          <div className="sm:col-span-6">
          <button
            type="submit"
            disabled={submittingInvite || !inviteEmail.trim()}
            className="rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submittingInvite ? <Loader2 className="animate-spin h-4 w-4" /> : <Mail size={16} />}
            Send Invitation
          </button>
          </div>
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
                  <p className="font-black text-zinc-950 text-sm">{m.staff_name || m.user_name}</p>
                    <p className="text-xs text-zinc-500 font-semibold">{m.user_email || m.user_id || "Account-less staff"}</p>
                  {(m.role_label || m.position_label) && (
                    <p className="text-xs text-zinc-600 font-semibold truncate">
                      {[m.role_label, m.position_label].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${
                      m.role === "event_manager"
                        ? "bg-violet-100 text-violet-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                    title={m.role === "event_manager" ? t("staffPermissionManager") : t("staffPermissionScanner")}
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

      <section aria-label={t("staffActivity")} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xs">
        <div className="border-b border-zinc-200 bg-zinc-50/80 px-5 py-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-zinc-800">{t("staffActivity")}</h2>
        </div>
        {activityLoading ? (
          <div className="p-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-orange-500" /></div>
        ) : activityError ? (
          <p role="status" className="flex flex-wrap items-center gap-3 p-5 text-sm font-semibold text-amber-800">
            {activityError}
            <button type="button" onClick={() => void fetchActivity()} className="underline underline-offset-2">{t("retryActivity")}</button>
          </p>
        ) : activityStaff.length === 0 ? (
          <p className="p-5 text-sm font-medium text-zinc-500">{t("noStaffToMonitor")}</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {activityStaff.map((staff) => {
              const member = members.find((item) => item.id === staff.id);
              const displayName = member?.staff_name || member?.user_name || staff.name || t("eventStaff");
              return (
                <div key={staff.id}>
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-zinc-950">{displayName}</p>
                      <p className="text-xs font-semibold text-zinc-600">
                        {staff.role === "event_manager" ? t("staffPermissionManager") : t("staffPermissionScanner")}
                        {staff.roleLabel ? ` · ${staff.roleLabel}` : ""}
                        {staff.positionLabel ? ` · ${staff.positionLabel}` : ""}
                      </p>
                      {staff.entranceId && <p className="text-xs text-zinc-500">{t("assignedEntrance")}: {staff.entranceId}</p>}
                      <p className="mt-1 text-xs font-medium text-zinc-500">
                        {t("accessStatus")}: {staff.accessStatus === "active" ? t("accessActive") : staff.accessStatus === "expired" ? t("accessExpired") : t("accessRevoked")}
                        {` · ${t("invitationStatus")}: ${invitationLabel(staff.invitationStatus)}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                      <span><strong className="font-black text-emerald-700">{staff.successful}</strong> {t("successfulCheckIns")}</span>
                      <span><strong className="font-black text-red-700">{staff.rejected}</strong> {t("rejectedAttempts")}</span>
                      <span><strong className="font-black text-zinc-800">{staff.total}</strong> {t("scanAttempts")}</span>
                      <span className="text-zinc-500">
                        {t("lastActivity")}: {staff.lastActivityAt ? new Date(staff.lastActivityAt).toLocaleString() : t("neverScanned")}
                      </span>
                      <button
                        type="button"
                        aria-expanded={selectedStaffId === staff.id}
                        aria-controls={`staff-history-${staff.id}`}
                        onClick={() => void toggleStaffHistory(staff.id)}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 font-bold text-zinc-700 hover:bg-zinc-50"
                      >
                        {selectedStaffId === staff.id ? t("hideActivity") : t("activityDetail")}
                      </button>
                    </div>
                  </div>
                  {selectedStaffId === staff.id && (
                    <div id={`staff-history-${staff.id}`} className="border-t border-zinc-100 bg-zinc-50/60 px-4 py-4 sm:px-5">
                      <h3 className="text-xs font-black uppercase tracking-wide text-zinc-700">{t("activityHistory")}</h3>
                      {staffSummary && <p className="mt-1 text-xs text-zinc-600">{staffSummary.successful} {t("successfulCheckIns")} · {staffSummary.rejected} {t("rejectedAttempts")} · {staffSummary.total} {t("scanAttempts")}</p>}
                      {historyLoading && staffHistory.length === 0 ? (
                        <div className="py-4"><Loader2 className="mx-auto h-5 w-5 animate-spin text-orange-500" /></div>
                      ) : historyError ? (
                        <p role="status" className="mt-3 flex flex-wrap items-center gap-3 text-sm font-semibold text-amber-800">
                          {historyError}
                          <button type="button" onClick={() => void loadStaffHistory(staff.id, 1, false)} className="underline underline-offset-2">{t("retryActivity")}</button>
                        </p>
                      ) : staffHistory.length === 0 ? (
                        <p className="mt-3 text-sm text-zinc-500">{t("noActivityYet")}</p>
                      ) : (
                        <ol className="mt-3 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
                          {staffHistory.map((entry) => (
                            <li key={entry.entry_id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5 text-xs">
                              <div>
                                <p className={`font-black ${entry.result === "successful" ? "text-emerald-700" : "text-red-700"}`}>
                                  {entry.result === "successful" ? t("recordedCheckIn") : `${t("recordedRejection")}: ${rejectionLabel(entry.reason_code)}`}
                                </p>
                                <p className="mt-0.5 text-zinc-500">
                                  {entry.scan_source === "offline_sync" ? t("offlineSync") : t("onlineScan")}
                                  {entry.entrance_id ? ` · ${t("assignedEntrance")}: ${entry.entrance_id}` : ""}
                                </p>
                              </div>
                              <time dateTime={entry.occurred_at} className="font-medium text-zinc-500">{new Date(entry.occurred_at).toLocaleString()}</time>
                            </li>
                          ))}
                        </ol>
                      )}
                      {historyHasMore && !historyError && (
                        <button
                          type="button"
                          onClick={() => void loadStaffHistory(staff.id, historyPage + 1, true)}
                          disabled={historyLoading}
                          className="mt-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                        >
                          {historyLoading ? t("syncing") : t("loadMoreActivity")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

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
                  <p className="font-black text-zinc-900 text-sm">{inv.staff_name || inv.email}</p>
                  {inv.staff_name && (
                    <p className="text-xs text-zinc-500 font-semibold">{inv.email}</p>
                  )}
                  {(inv.role_label || inv.position_label) && (
                    <p className="text-xs text-zinc-600 font-semibold">
                      {[inv.role_label, inv.position_label].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <p className="text-xs text-zinc-400 font-medium">
                    Invited {new Date(inv.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-amber-100 text-amber-800 px-2.5 py-1 text-xs font-black uppercase">
                    {inv.role === "event_manager" ? "Manager" : "Scanner"}
                  </span>
                  {inv.is_accountless && (
                    <span className="rounded-full bg-violet-100 text-violet-800 px-2.5 py-1 text-xs font-black uppercase">
                      No account
                    </span>
                  )}

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
                  {inv.is_accountless && <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 font-black text-violet-800">No account</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-black uppercase text-zinc-400">{inv.status}</span>
                  {["expired", "declined", "locked"].includes(inv.status) && (
                    <button
                      type="button"
                      onClick={() => handleResendInvite(inv.id)}
                      disabled={workingAction === `resend:${inv.id}`}
                      className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 font-black text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      Resend
                    </button>
                  )}
                </div>
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
        description={`Revoke access for ${memberToRemove?.staff_name || memberToRemove?.user_name || "this user"}? They will immediately lose ticket scanning and event permissions for this event.`}
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
