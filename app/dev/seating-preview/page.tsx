import { notFound } from "next/navigation";
import PreviewClient from "./PreviewClient";
import venueFixture from "@/lib/__tests__/fixtures/venue-layout.json";
import seatsFixture from "@/lib/__tests__/fixtures/seats-response.json";

// Development-only 3D seat-picker preview (P1). Not linked from anywhere.
// 404s in production unless ENABLE_SEATING_3D_PREVIEW=1.
const PREVIEW_ENABLED = process.env.ENABLE_SEATING_3D_PREVIEW === "1";

export default function SeatingPreviewPage() {
  if (process.env.NODE_ENV === "production" && !PREVIEW_ENABLED) {
    notFound();
  }
  return (
    <PreviewClient
      layout={venueFixture.layout as never}
      seats={seatsFixture.seats as never}
    />
  );
}
