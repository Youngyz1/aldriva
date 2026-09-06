import { redirect } from "next/navigation";

export default async function EventRootPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  redirect(`/dashboard/events/${eventId}/operations`);
}
