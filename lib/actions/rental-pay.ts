"use server";

import { redirect } from "next/navigation";
import { createRentalCheckout } from "@/lib/rental/checkout";

// The client only sends the lookup token. Booking id, organizer id, amount and kind all come from the database.
export async function startRentalPayment(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) redirect("/");
  const res = await createRentalCheckout(token);
  if (res.ok) redirect(res.url);
  redirect("/rentals/lookup/" + encodeURIComponent(token) + "?pay=" + res.reason);
}