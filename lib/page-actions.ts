export type PageActionPayload =
  | { actionType: "RSVP_SUBMISSION"; response: "accepted" | "declined" }
  | { actionType: "BUSINESS_LEAD"; name: string; email: string; message: string };

export type PageActionHandler = (payload: PageActionPayload) => Promise<unknown>;
