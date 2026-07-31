import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { Star } from "lucide-react";

export default async function OrgReviewsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();

  const { data: org } = await supabase
    .from("organizers")
    .select("average_rating, review_count")
    .eq("id", id)
    .maybeSingle();

  const { data: reviews } = await supabase
    .from("reviews")
    .select("id, rating, body, created_at")
    .eq("organizer_id", id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-orange-600">Organization</p>
        <h1 className="mt-1 text-2xl font-black">Reviews</h1>
        {org?.average_rating && (
          <p className="mt-1 text-sm font-medium text-zinc-500">
            ★ {Number(org.average_rating).toFixed(1)} average · {org.review_count ?? 0} reviews
          </p>
        )}
      </div>

      {(reviews ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
          <Star className="mb-3 h-10 w-10 text-zinc-300" />
          <p className="font-black text-zinc-900">No reviews yet</p>
          <p className="mt-1 text-sm text-zinc-500">Reviews from attendees and donors will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {(reviews ?? []).map((r) => (
            <div key={r.id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`h-4 w-4 ${i < r.rating ? "fill-yellow-400 text-yellow-400" : "text-zinc-200"}`} />
                ))}
                <span className="ml-2 text-xs text-zinc-400">
                  {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
              {r.body && <p className="mt-3 text-sm leading-relaxed text-zinc-700">{r.body}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
