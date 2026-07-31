import { createSupabaseAdmin } from "@/lib/supabase-admin";
import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";

export default async function OrgBlogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();

  const { data: articles } = await supabase
    .from("articles")
    .select("id, title, slug, status, published_at")
    .eq("organizer_id", id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-orange-600">Organization</p>
          <h1 className="mt-1 text-2xl font-black">Blog / Articles</h1>
        </div>
        <Link
          href="/dashboard/articles"
          className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-orange-700"
        >
          <Plus className="h-4 w-4" /> New Article
        </Link>
      </div>

      {(articles ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
          <BookOpen className="mb-3 h-10 w-10 text-zinc-300" />
          <p className="font-black text-zinc-900">No articles yet</p>
          <p className="mt-1 text-sm text-zinc-500">Share updates, stories, and news with your community.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wide text-zinc-500">Title</th>
                <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wide text-zinc-500">Status</th>
                <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wide text-zinc-500">Published</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(articles ?? []).map((a) => (
                <tr key={a.id} className="hover:bg-zinc-50">
                  <td className="px-5 py-4 font-bold text-zinc-900">{a.title}</td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      a.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600"
                    }`}>{a.status}</span>
                  </td>
                  <td className="px-5 py-4 text-zinc-600">
                    {a.published_at ? new Date(a.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link href={`/articles/${a.slug}`} className="text-xs font-bold text-orange-600 hover:underline">View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
