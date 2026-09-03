import { redirect } from "next/navigation";

export default async function LegacyMyTicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const queryString = new URLSearchParams();

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") {
        queryString.set(key, value);
      } else if (Array.isArray(value)) {
        value.forEach((v) => queryString.append(key, v));
      }
    }
  }

  const qs = queryString.toString();
  const destination = qs ? `/events/my-tickets?${qs}` : "/events/my-tickets";
  redirect(destination);
}
