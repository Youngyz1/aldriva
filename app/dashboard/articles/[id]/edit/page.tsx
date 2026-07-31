import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import { createSupabaseServer } from "@/lib/supabase-server";
import { isAdmin as checkIsAdmin } from "@/lib/auth";
import EditArticleClient from "./EditArticleClient";

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getDashboardContext();
  if (!ctx) {
    redirect("/login");
  }

  const supabase = await createSupabaseServer();

  // Load article
  const { data: article } = await supabase
    .from("articles")
    .select("*")
    .eq("id", id)
    .single();

  if (!article) {
    notFound();
  }

  // Check authorization (must be owner or admin)
  const isAdmin = await checkIsAdmin();
  if (article.owner_id !== ctx.user.id && !isAdmin) {
    redirect("/dashboard/articles");
  }

  // Map organizers for select dropdown
  const organizers = ctx.organizers.map((org) => ({
    id: org.id,
    name: org.name,
  }));

  // Parse date for input field
  let scheduledForStr = "";
  if (article.scheduled_for) {
    const d = new Date(article.scheduled_for);
    scheduledForStr = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  }

  const mappedArticle = {
    ...article,
    categoriesStr: article.categories.join(", "),
    tagsStr: article.tags.join(", "),
    scheduled_for: scheduledForStr,
  };

  return (
    <div className="flex-1 p-6 max-w-4xl mx-auto">
      <EditArticleClient organizers={organizers} article={mappedArticle} />
    </div>
  );
}
