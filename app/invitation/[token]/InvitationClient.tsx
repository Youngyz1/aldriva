"use client";

import { useState } from "react";
import { InvitationCard } from "@/components/cards/InvitationCard";

type Props = {
  token: string;
  guest: {
    name: string;
    title: string | null;
    organization: string | null;
    invitationStatus: string;
    rsvpStatus: string;
    rsvpAt: string | null;
  };
  event: {
    title: string;
    slug: string;
    eventDate: string | null;
    endDate: string | null;
    venue: string | null;
    city: string | null;
    banner: string | null;
  };
  ticketInstance: {
    qrCode: string;
    status: string;
    checkedInAt: string | null;
  } | null;
  seat: {
    label: string;
    isVip: boolean;
    tableNumber?: string | null;
    tableName?: string | null;
  } | null;
};

export default function InvitationClient({
  token,
  guest,
  event,
  ticketInstance,
  seat,
}: Props) {
  const [currentGuest, setCurrentGuest] = useState(guest);
  const [submittingRsvp, setSubmittingRsvp] = useState(false);
  const [rsvpFeedback, setRsvpFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleRsvp(response: "accepted" | "declined") {
    setSubmittingRsvp(true);
    setRsvpFeedback(null);

    try {
      const res = await fetch(`/api/invitation/${token}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });

      const data = await res.json();

      if (!res.ok) {
        setRsvpFeedback({ type: "error", text: data.error || "Failed to update RSVP." });
        return;
      }

      setCurrentGuest((prev) => ({
        ...prev,
        rsvpStatus: response,
        rsvpAt: new Date().toISOString(),
      }));

      setRsvpFeedback({
        type: "success",
        text:
          response === "accepted"
            ? "You have accepted the invitation! We look forward to seeing you."
            : "Your response has been recorded.",
      });
    } catch {
      setRsvpFeedback({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSubmittingRsvp(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-black px-4 py-10 sm:py-16 text-zinc-100 flex flex-col items-center justify-center print:bg-white print:p-0 print:text-zinc-900">
      <InvitationCard
        token={token}
        guest={currentGuest}
        event={event}
        ticketInstance={ticketInstance}
        seat={seat}
        onRsvp={handleRsvp}
        submittingRsvp={submittingRsvp}
        rsvpFeedback={rsvpFeedback}
        initialTemplate="elegant"
        allowTemplateSwitching={true}
      />
    </main>
  );
}
