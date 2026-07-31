import { NextResponse } from "next/server";
import { createArticle, updateArticle } from "@/lib/actions/articles";
import { createSupabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: "Not logged in" }, { status: 401 });
  }

  console.log(`[E2E API] User authenticated: ${user.id}`);

  // 1. Create Article (Draft)
  console.log("[E2E API] Creating draft article...");
  const createRes = await createArticle({
    title: "E2E Test Story",
    body: "<p>This is a test body for E2E validation that has more than 20 characters.</p>",
    excerpt: "E2E test excerpt",
    cover_image_url: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?q=80&w=1200&auto=format&fit=crop",
    categories: ["E2E"],
    tags: ["e2e"],
    visibility: "public",
    status: "draft",
  });

  if (!createRes.success || !createRes.data) {
    return NextResponse.json({ success: false, error: "Failed to create", details: createRes.error }, { status: 500 });
  }

  const articleId = createRes.data.id;
  const initialSlug = createRes.data.slug;
  console.log(`[E2E API] Article created. ID: ${articleId}, Slug: ${initialSlug}`);

  // 2. Update/Publish Article
  console.log("[E2E API] Editing and publishing article...");
  const updateRes = await updateArticle(articleId, {
    title: "E2E Test Story Published",
    body: "<p>This is a test body for E2E validation that has more than 20 characters. It is now published.</p>",
    excerpt: "E2E test excerpt updated",
    cover_image_url: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?q=80&w=1200&auto=format&fit=crop",
    categories: ["E2E", "Success"],
    tags: ["e2e", "published"],
    visibility: "public",
    status: "published",
  });

  if (!updateRes.success || !updateRes.data) {
    // Cleanup draft on failure
    await supabase.from("articles").delete().eq("id", articleId);
    return NextResponse.json({ success: false, error: "Failed to update", details: updateRes.error }, { status: 500 });
  }

  const finalSlug = updateRes.data.slug;
  console.log(`[E2E API] Article updated. Slug: ${finalSlug}`);

  // 3. Confirm public URL returns 200
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  console.log(`[E2E API] Fetching public page at ${siteUrl}/articles/${finalSlug}...`);
  
  let fetchStatus = 500;
  try {
    const res = await fetch(`${siteUrl}/articles/${finalSlug}`, { cache: "no-store" });
    fetchStatus = res.status;
  } catch (err: any) {
    console.error("[E2E API] Public fetch failed:", err.message);
  }

  // 4. Cleanup
  console.log("[E2E API] Cleaning up article...");
  await supabase.from("articles").delete().eq("id", articleId);

  return NextResponse.json({
    success: true,
    articleId,
    initialSlug,
    finalSlug,
    publicUrl: `/articles/${finalSlug}`,
    publicFetchStatus: fetchStatus,
  });
}
