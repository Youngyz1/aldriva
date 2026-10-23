export type PageActionPayload =
  | {
      actionType: "RSVP_SUBMISSION";
      response: "accepted" | "declined";
      guestCount?: number;
      guestNames?: string;
      message?: string;
    }
  | { actionType: "BUSINESS_LEAD"; name: string; email: string; message: string };

export function buildRsvpSubmissionPayload(
  response: "accepted" | "declined",
  details?: { guestCount?: number; guestNames?: string; message?: string },
): PageActionPayload {
  const payload: Extract<PageActionPayload, { actionType: "RSVP_SUBMISSION" }> = {
    actionType: "RSVP_SUBMISSION",
    response,
  };
  if (details?.guestCount !== undefined) payload.guestCount = details.guestCount;
  if (details?.guestNames !== undefined) payload.guestNames = details.guestNames;
  if (details?.message !== undefined) payload.message = details.message;
  return payload;
}

export type PageActionHandler = (payload: PageActionPayload) => Promise<unknown>;
