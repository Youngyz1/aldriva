import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { getDashboardContext } from "@/lib/dashboard-context";
import { createSupabaseServer } from "@/lib/supabase-server";
import { deleteArticle } from "@/lib/actions/articles";
import { revalidatePath } from "next/cache";
import ArticleRowActions from "./ArticleRowActions";

export const revalidate = 0; // Fresh dashboard data on every load

const statusBadge: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-700 border-zinc-200",
  published: "bg-emerald-50 text-emerald-700 border-emerald-200",
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  archived: "bg-amber-50 text-amber-700 border-amber-200",
  expired: "bg-red-50 text-red-700 border-red-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

export default async function DashboardArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const ctx = await getDashboardContext();
  if (!ctx) {
    redirect("/login");
  }

  const { q = "", status = "all" } = await searchParams;
  const supabase = await createSupabaseServer();

  let query = supabase
    .from("articles")
    .select("*")
    .eq("owner_id", ctx.user.id);

  if (q.trim()) {
    query = query.ilike("title", `%${q.trim()}%`);
  }

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data: articles, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading user articles:", error);
  }

  async function handleDelete(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    if (id) {
      await deleteArticle(id);
      revalidatePath("/dashboard/articles");
    }
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            My Articles
          </h1>
          <p className="text-sm font-semibold text-slate-500">
            Manage your draft, published, and scheduled editorial articles.
          </p>
        </div>
        <Link
          href="/dashboard/articles/new"
          className="inline-flex items-center justify-center rounded-xl bg-orange-600 px-4 py-2.5 text-center text-sm font-black text-white hover:bg-orange-700 transition"
        >
          + New Article
        </Link>
      </div>

      {/* Toolbar / Filters */}
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-100/5">
        <form method="GET" action="/dashboard/articles" className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search articles by title..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
            />
          </div>
          <div className="w-full sm:w-48">
            <select
              name="status"
              defaultValue={status}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="scheduled">Scheduled</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
          >
            Apply
          </button>
        </form>
      </div>

      {/* Articles Table / List */}
      {articles && articles.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-slate-150 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm text-slate-500">
              <thead className="border-b border-slate-150 bg-slate-50 text-xs font-black uppercase tracking-wider text-slate-400">
                <tr>
                  <th scope="col" className="px-6 py-4">Article</th>
                  <th scope="col" className="px-6 py-4">Status</th>
                  <th scope="col" className="px-6 py-4">Visibility</th>
                  <th scope="col" className="px-6 py-4">Categories &amp; Tags</th>
                  <th scope="col" className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {articles.map((article) => {
                  const hasImage = !!article.cover_image_url;
                  const displayDate = new Date(article.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });

                  return (
                    <tr key={article.id} className="hover:bg-slate-50/50 transition">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="relative h-10 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                            <Image
                              src={article.cover_image_url || "https://images.unsplash.com/photo-1499750310107-5fef28a66643?q=80&w=120&auto=format&fit=crop"}
                              alt={article.title}
                              fill
                              unoptimized
                              className="object-cover"
                            />
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={`/articles/${article.slug}`}
                              className="font-black text-slate-900 hover:text-orange-600 block truncate max-w-[240px]"
                              target="_blank"
                            >
                              {article.title}
                            </Link>
                            <span className="text-xs text-slate-400">Created on {displayDate}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                            statusBadge[article.status] || "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {article.status}
                        </span>
                        {article.status === "scheduled" && article.scheduled_for && (
                          <div className="mt-1 text-[10px] text-slate-400 font-semibold">
                            {new Date(article.scheduled_for).toLocaleString()}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 capitalize font-bold text-slate-700">
                        {article.visibility}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1 max-w-[200px]">
                          {article.categories && article.categories.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {article.categories.map((c: string) => (
                                <span
                                  key={c}
                                  className="rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-black text-orange-700"
                                >
                                  {c}
                                </span>
                              ))}
                            </div>
                          )}
                          {article.tags && article.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {article.tags.slice(0, 3).map((t: string) => (
                                <span
                                  key={t}
                                  className="text-[10px] text-slate-400 font-semibold"
                                >
                                  #{t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <Link
                            href={`/dashboard/articles/${article.id}/edit`}
                            className="text-sm font-black text-orange-600 hover:text-orange-700"
                          >
                            Edit
                          </Link>
                          <ArticleRowActions articleId={article.id} onDelete={handleDelete} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center bg-white shadow-sm">
          <p className="text-sm font-bold text-slate-500">No articles found.</p>
          <Link
            href="/dashboard/articles/new"
            className="mt-4 inline-flex items-center gap-1 text-sm font-black text-orange-600 hover:text-orange-700"
          >
            Create your first article →
          </Link>
        </div>
      )}
    </div>
  );
}
