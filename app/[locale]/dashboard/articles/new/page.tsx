import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import NewArticleClient from "./NewArticleClient";

export default async function NewArticlePage() {
  const ctx = await getDashboardContext();
  if (!ctx) {
    redirect("/login");
  }

  // Map organizers for select dropdown
  const organizers = ctx.organizers.map((org) => ({
    id: org.id,
    name: org.name,
  }));

  return (
    <div className="flex-1 p-6 max-w-4xl mx-auto">
      <NewArticleClient organizers={organizers} />
    </div>
  );
}
