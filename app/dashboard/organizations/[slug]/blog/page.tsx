import { createSupabaseAdmin } from "@/lib/supabase-admin";
import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";
import { ResponsiveDataTable } from "@/components/dashboard/ResponsiveDataTable";
import { ResponsiveDataRow } from "@/components/dashboard/ResponsiveDataRow";

export default async function OrgBlogPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createSupabaseAdmin();

  const { data: org } = await supabase
    .from("organizers").select("id").eq("slug", slug).maybeSingle();

  const { data: articles } = org
    ? await supabase
        .from("articles")
        .select("id, title, slug, status, published_at")
        .eq("organizer_id", org.id)
        .order("created_at", { ascending: false })
    : { data: [] };

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
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <ResponsiveDataTable
            columns={[
              { id: "title", header: "Title" },
              { id: "status", header: "Status" },
              { id: "published", header: "Published", hideBelow: "md" },
              { id: "actions", header: "", align: "right" },
            ]}
          >
            {(articles ?? []).map((a) => {
              const formattedDate = a.published_at
                ? new Date(a.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                : "—";

              const statusBadge = (
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  a.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600"
                }`}>{a.status}</span>
              );

              return (
                <ResponsiveDataRow
                  key={a.id}
                  id={a.id}
                  desktopCells={[
                    <span key="title" className="font-bold text-zinc-900 block">{a.title}</span>,
                    <div key="status">{statusBadge}</div>,
                    <span key="published" className="text-zinc-600 block">{formattedDate}</span>,
                    <div key="actions" className="text-right">
                      <Link href={`/articles/${a.slug}`} className="text-xs font-bold text-orange-600 hover:underline">View</Link>
                    </div>,
                  ]}
                  identity={<span className="font-bold text-zinc-950 text-left line-clamp-1">{a.title}</span>}
                  state={statusBadge}
                  secondary={[`Published: ${formattedDate}`]}
                  actions={<Link href={`/articles/${a.slug}`} className="text-xs font-bold text-orange-600 hover:underline">View</Link>}
                  expandedDetails={
                    <div className="space-y-1 text-xs text-zinc-600 py-1">
                      <div><span className="font-bold text-zinc-500">Published:</span> {formattedDate}</div>
                      <div><span className="font-bold text-zinc-500">Slug:</span> {a.slug}</div>
                    </div>
                  }
                />
              );
            })}
          </ResponsiveDataTable>
        </div>
      )}
    </div>
  );
}
