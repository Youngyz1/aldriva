"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { pageThemeButtonClassName, type PageGlobalTheme } from "@/lib/page-composition";
import type { PageActionHandler } from "@/lib/page-actions";
import type { InvitationPageData } from "@/types/invitation-template";
import { ExpandableSvgQr } from "@/components/cards/ExpandableQr";
import { downloadIcsFile, generateGoogleCalendarUrl } from "@/lib/event-time";
import { getInvitationDictionary, localizeInvitationSystemCopy } from "@/lib/invitation-i18n";
import { buildRsvpSubmissionPayload } from "@/lib/page-actions";

export type ActionPortalType = "RSVP_SUBMISSION" | "BUSINESS_LEAD";

export function ActionPortalBlock({
  actionType,
  theme,
  onAction,
  title,
  description,
  guestName,
  currentResponse,
  invitationData,
  shared = false,
  evergreenRsvp = false,
  showQrContext = false,
}: {
  actionType: ActionPortalType;
  theme: PageGlobalTheme;
  onAction?: PageActionHandler;
  title?: string;
  description?: string;
  guestName?: string | null;
  currentResponse?: "pending" | "accepted" | "declined" | null;
  invitationData?: InvitationPageData;
  shared?: boolean;
  evergreenRsvp?: boolean;
  showQrContext?: boolean;
}) {
  const t = useTranslations("Events");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [name, setName] = useState(guestName ?? "");
  const [email, setEmail] = useState("");
  const [leadMessage, setLeadMessage] = useState("");
  const [response, setResponse] = useState(currentResponse ?? "pending");
  const [evergreenResponse, setEvergreenResponse] = useState<"" | "accepted" | "declined">(
    currentResponse === "accepted" || currentResponse === "declined" ? currentResponse : "",
  );
  const [guestCount, setGuestCount] = useState("");
  const [guestNames, setGuestNames] = useState("");
  const [wishes, setWishes] = useState("");
  const locale = invitationData?.locale ?? "en";
  const actionLabel = localizeInvitationSystemCopy(actionType === "RSVP_SUBMISSION" ? "RSVP" : "Contact us", locale);
  const blockTitle = localizeInvitationSystemCopy(title || actionLabel, locale);
  const blockDescription = description ? localizeInvitationSystemCopy(description, locale) : null;
  const dictionary = getInvitationDictionary(locale);

  function calendarPayload() {
    if (!invitationData) return null;
    return {
      title: invitationData.title,
      description: invitationData.guest?.name
        ? `${locale === "fr" ? "Invitation officielle pour" : "Official Invitation for"} ${invitationData.guest.name}`
        : undefined,
      venue: invitationData.venue,
      address: invitationData.address,
      startDate: invitationData.eventDate,
      endDate: invitationData.endDate,
      timezone: invitationData.timezone || "UTC",
    };
  }

  const calendar = actionType === "RSVP_SUBMISSION" ? calendarPayload() : null;

  useEffect(() => {
    setResponse(currentResponse ?? "pending");
    setEvergreenResponse(currentResponse === "accepted" || currentResponse === "declined" ? currentResponse : "");
  }, [currentResponse]);

  async function submitRsvp(nextResponse: "accepted" | "declined") {
    if (!onAction || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await onAction(buildRsvpSubmissionPayload(nextResponse));
      setResponse(nextResponse);
      setMessage(nextResponse === "accepted" ? dictionary.attendanceConfirmed : dictionary.responseNoted);
    } catch {
      setMessage(dictionary.rsvpFailed);
    } finally {
      setBusy(false);
    }
  }

  async function submitEvergreenRsvp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onAction || busy || !evergreenResponse) return;
    if (evergreenResponse === "accepted" && !guestCount) return;

    setBusy(true);
    setMessage("");
    try {
      await onAction(buildRsvpSubmissionPayload(evergreenResponse, {
        ...(evergreenResponse === "accepted" ? {
          guestCount: Number(guestCount),
          guestNames,
        } : {}),
        message: wishes,
      }));
      setResponse(evergreenResponse);
      setMessage(evergreenResponse === "accepted" ? dictionary.attendanceConfirmed : dictionary.responseNoted);
    } catch {
      setMessage(dictionary.rsvpFailed);
    } finally {
      setBusy(false);
    }
  }

  const configuredAllowance = invitationData?.guest.guestAllowance;
  const maxAttendees = typeof configuredAllowance === "number"
    && Number.isInteger(configuredAllowance)
    && configuredAllowance >= 1
    && configuredAllowance <= 20
    ? configuredAllowance
    : 10;
  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onAction || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await onAction({ actionType: "BUSINESS_LEAD", name, email, message: leadMessage });
      setMessage(localizeInvitationSystemCopy("Thank you. Your message has been sent.", locale));
      setLeadMessage("");
    } catch {
      setMessage(localizeInvitationSystemCopy("We could not send your message. Please try again.", locale));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={theme.classes.section ?? ""} aria-label={blockTitle}>
      <div className="mx-auto min-w-0 w-full max-w-3xl px-6 py-14 sm:py-20">
        <div className="min-w-0">
          <h2 className={`text-center text-2xl ${theme.classes.heading ?? ""}`}>
            {blockTitle}
          </h2>
          {blockDescription ? <p className={`mx-auto mt-3 min-w-0 max-w-xl break-words text-center ${theme.classes.body ?? ""}`}>{blockDescription}</p> : null}

          {shared ? (
            <p className={`mt-5 text-center text-sm ${theme.classes.body ?? ""}`}>
              {localizeInvitationSystemCopy("RSVP controls are available from your personal invitation link.", locale)}
            </p>
          ) : actionType === "RSVP_SUBMISSION" ? (
            <>
              {invitationData ? (
                <div className="mt-6 text-center">
                  <p className={`text-xs font-semibold uppercase tracking-wide ${theme.classes.body ?? ""}`}>
                    {invitationData.guest.isVip ? dictionary.vipGuestPass : dictionary.officialGuestPass}
                  </p>
                  <p className={`mt-2 break-words text-lg ${theme.classes.heading ?? ""}`}>{localizeInvitationSystemCopy(invitationData.guest.name, locale)}</p>
                  {invitationData.guest.title || invitationData.guest.organization ? (
                    <p className={`mt-1 break-words text-sm ${theme.classes.body ?? ""}`}>
                      {[invitationData.guest.title, invitationData.guest.organization].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                  {invitationData.seat ? (
                    <p className={`mt-3 break-words text-sm ${theme.classes.body ?? ""}`}>
                      {dictionary.reservedSeat}: {localizeInvitationSystemCopy(invitationData.seat.label, locale)}
                      {invitationData.seat.tableName ? ` — ${invitationData.seat.tableName}` : ""}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {evergreenRsvp ? (
                <form className="mx-auto mt-6 grid max-w-xl gap-4 text-left" onSubmit={(event) => void submitEvergreenRsvp(event)}>
                  <label className={`grid gap-1 text-sm ${theme.classes.body ?? ""}`}>
                    {t("evergreenRsvpGuestNames")}
                    <input
                      name="guestNames"
                      value={guestNames}
                      onChange={(event) => setGuestNames(event.target.value)}
                      maxLength={300}
                      disabled={!onAction || busy || response === "accepted" || response === "declined"}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-950"
                    />
                  </label>
                  <label className={`grid gap-1 text-sm ${theme.classes.body ?? ""}`}>
                    {t("evergreenRsvpResponse")}
                    <select
                      name="response"
                      required
                      value={evergreenResponse}
                      onChange={(event) => setEvergreenResponse(event.target.value as "" | "accepted" | "declined")}
                      disabled={!onAction || busy || response === "accepted" || response === "declined"}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-950"
                    >
                      <option value="">{t("evergreenRsvpChooseResponse")}</option>
                      <option value="accepted">{t("evergreenRsvpAccept")}</option>
                      <option value="declined">{t("evergreenRsvpDecline")}</option>
                    </select>
                  </label>
                  <label className={`grid gap-1 text-sm ${theme.classes.body ?? ""}`}>
                    {t("evergreenRsvpCount")}
                    <select
                      name="guestCount"
                      required={evergreenResponse === "accepted"}
                      value={guestCount}
                      onChange={(event) => setGuestCount(event.target.value)}
                      disabled={!onAction || busy || response === "accepted" || response === "declined"}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-950"
                    >
                      <option value="">{t("evergreenRsvpChooseCount")}</option>
                      {Array.from({ length: maxAttendees }, (_, index) => index + 1).map((count) => (
                        <option key={count} value={count}>{count}</option>
                      ))}
                    </select>
                  </label>
                  <label className={`grid gap-1 text-sm ${theme.classes.body ?? ""}`}>
                    {t("evergreenRsvpWishes")}
                    <textarea
                      name="message"
                      rows={4}
                      value={wishes}
                      onChange={(event) => setWishes(event.target.value)}
                      maxLength={500}
                      disabled={!onAction || busy || response === "accepted" || response === "declined"}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-950"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={!onAction || busy || !evergreenResponse || (evergreenResponse === "accepted" && !guestCount) || response === "accepted" || response === "declined"}
                    className={`justify-self-start disabled:cursor-not-allowed disabled:opacity-60 ${pageThemeButtonClassName(theme, "px-5 py-3 text-sm font-semibold")}`}
                  >
                    {t("evergreenRsvpSubmit")}
                  </button>
                </form>
              ) : (
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    disabled={!onAction || busy || response === "accepted"}
                    onClick={() => void submitRsvp("accepted")}
                    className={`max-w-full whitespace-normal break-words disabled:cursor-not-allowed disabled:opacity-60 ${pageThemeButtonClassName(theme, "px-5 py-3 text-sm font-semibold")}`}
                  >
                    {response === "accepted" ? dictionary.attending : dictionary.accept}
                  </button>
                  <button
                    type="button"
                    disabled={!onAction || busy || response === "declined"}
                    onClick={() => void submitRsvp("declined")}
                    className={`max-w-full whitespace-normal break-words disabled:cursor-not-allowed disabled:opacity-60 ${pageThemeButtonClassName(theme, "px-5 py-3 text-sm font-semibold")}`}
                  >
                    {response === "declined" ? dictionary.declined : dictionary.decline}
                  </button>
                </div>
              )}
              {invitationData?.ticketInstance?.qrCode && response !== "declined" ? (
                <div className="mt-6 flex flex-col items-center">
                  <ExpandableSvgQr
                    value={invitationData.ticketInstance.qrCode}
                    triggerSize={160}
                    openLabel={dictionary.qrTapToEnlarge}
                    title={dictionary.presentForAdmission}
                    hint={dictionary.qrBrightnessHint}
                    context={showQrContext ? [invitationData.guest.name, invitationData.title].filter((item): item is string => Boolean(item?.trim())) : undefined}
                    portalIntoNearestDialog={showQrContext}
                  />
                  <p className={`mt-2 text-xs ${theme.classes.body ?? ""}`}>{dictionary.presentForAdmission}</p>
                </div>
              ) : null}
              {calendar ? (
                <div className="mt-6 flex flex-wrap justify-center gap-4 border-t border-current/10 pt-5 text-sm">
                  <button type="button" onClick={() => downloadIcsFile(calendar)} className="font-semibold underline underline-offset-4">
                    {dictionary.downloadIcal}
                  </button>
                  <a href={generateGoogleCalendarUrl(calendar)} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4">
                    {dictionary.googleCalendar}
                  </a>
                </div>
              ) : null}
            </>
          ) : (
            <form className="mx-auto mt-6 grid max-w-xl gap-3" onSubmit={(event) => void submitLead(event)}>
              <label className={`grid gap-1 text-sm ${theme.classes.body ?? ""}`}>
                {localizeInvitationSystemCopy("Name", locale)}
                <input required value={name} onChange={(event) => setName(event.target.value)} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-950" />
              </label>
              <label className={`grid gap-1 text-sm ${theme.classes.body ?? ""}`}>
                {localizeInvitationSystemCopy("Email", locale)}
                <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-950" />
              </label>
              <label className={`grid gap-1 text-sm ${theme.classes.body ?? ""}`}>
                {localizeInvitationSystemCopy("Message", locale)}
                <textarea required rows={4} value={leadMessage} onChange={(event) => setLeadMessage(event.target.value)} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-950" />
              </label>
              <button type="submit" disabled={!onAction || busy} className={`justify-self-start disabled:cursor-not-allowed disabled:opacity-60 ${pageThemeButtonClassName(theme, "px-5 py-3 text-sm font-semibold")}`}>
                {localizeInvitationSystemCopy("Send message", locale)}
              </button>
            </form>
          )}

          {!onAction && !shared ? (
            <p className={`mt-4 text-center text-xs ${theme.classes.body ?? ""}`}>
              {localizeInvitationSystemCopy(actionType === "RSVP_SUBMISSION" ? "Responses are disabled in preview." : "This form is shown in preview.", locale)}
            </p>
          ) : null}
          {message ? <p className={`mt-4 text-center text-sm ${theme.classes.body ?? ""}`} role="status">{message}</p> : null}
        </div>
      </div>
    </section>
  );
}
