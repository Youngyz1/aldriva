import type { Metadata } from "next";
import RedeemClient from "./RedeemClient";

export const metadata: Metadata = {
  title: "Accept event staff invitation | Aldriva",
  referrer: "no-referrer",
};

export default function RedeemEventStaffInvitationPage() {
  return <RedeemClient />;
}
