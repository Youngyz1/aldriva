"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { createSlug } from "@/lib/slug";
import { revalidatePath } from "next/cache";

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function calculateReadingTime(body: string): number {
  const plainText = stripHtml(body);
  const wordCount = plainText.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(wordCount / 200));
}

async function getUniqueSlug(title: string, supabase: any, excludeId?: string): Promise<string> {
  let baseSlug = createSlug(title);
  // Ensure slug matches constraint: '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  baseSlug = baseSlug.replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-");
  if (!baseSlug || baseSlug === "-") {
    baseSlug = "article";
  }

  let slug = baseSlug;
  let counter = 1;
  while (counter < 100) {
    let query = supabase.from("articles").select("id").eq("slug", slug);
    if (excludeId) {
      query = query.neq("id", excludeId);
    }
    const { data } = await query;
    if (!data || data.length === 0) {
      return slug;
    }
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  return `${slug}-${Math.floor(Math.random() * 1000)}`;
}

export type ArticleInput = {
  title: string;
  body: string;
  excerpt?: string | null;
  cover_image_url?: string | null;
  categories: string[];
  tags: string[];
  seo_title?: string | null;
  seo_description?: string | null;
  canonical_url?: string | null;
  visibility: "public" | "private";
  status: "draft" | "published" | "scheduled" | "archived" | "expired" | "rejected";
  scheduled_for?: string | null;
  organizer_id?: string | null;
  business_id?: string | null;
};

export async function createArticle(input: ArticleInput) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  // Validate title and body length to match DB constraints
  const trimmedTitle = input.title.trim();
  if (trimmedTitle.length < 3 || trimmedTitle.length > 180) {
    return { success: false, error: "Title must be between 3 and 180 characters" };
  }

  const trimmedBody = input.body.trim();
  if (trimmedBody.length < 20) {
    return { success: false, error: "Body content must be at least 20 characters long" };
  }

  if (input.excerpt && input.excerpt.length > 320) {
    return { success: false, error: "Excerpt cannot exceed 320 characters" };
  }

  if (input.seo_title && input.seo_title.length > 70) {
    return { success: false, error: "SEO Title cannot exceed 70 characters" };
  }

  if (input.seo_description && input.seo_description.length > 180) {
    return { success: false, error: "SEO Description cannot exceed 180 characters" };
  }

  const slug = await getUniqueSlug(trimmedTitle, supabase);
  const readingTime = calculateReadingTime(trimmedBody);

  // Publishing requires admin approval — see
  // migration_38_content_approval_workflow.sql. This action always runs as
  // the owner's own session (never admin), so 'published'/'rejected' are
  // never valid here; the DB-level trigger would reject them too, but
  // clamping here avoids surfacing a raw RLS/trigger error to the owner.
  // 'scheduled' still submits for review — approval decides whether it goes
  // live immediately or stays scheduled. published_at is only ever set by
  // the admin approve action, never here.
  const effectiveStatus =
    input.status === "published" || input.status === "rejected"
      ? "pending_review"
      : input.status;

  const insertData = {
    owner_id: user.id,
    title: trimmedTitle,
    slug,
    body: trimmedBody,
    excerpt: input.excerpt || null,
    cover_image_url: input.cover_image_url || null,
    categories: input.categories,
    tags: input.tags,
    seo_title: input.seo_title || null,
    seo_description: input.seo_description || null,
    canonical_url: input.canonical_url || null,
    visibility: input.visibility,
    status: effectiveStatus,
    scheduled_for: effectiveStatus === "scheduled" ? input.scheduled_for : null,
    reading_time: readingTime,
    business_id: input.business_id || null,
    organizer_id: input.organizer_id || null,
    published_at: null,
  };

  const { data, error } = await supabase
    .from("articles")
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error("Error creating article:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/articles");
  revalidatePath("/sitemap.xml");
  return { success: true, data };
}

export async function updateArticle(id: string, input: ArticleInput) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  // Verify ownership or admin role
  const { data: existing } = await supabase
    .from("articles")
    .select("owner_id, slug")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, error: "Article not found" };
  }

  const isAdmin = await checkIsAdmin(user.id, supabase);
  if (existing.owner_id !== user.id && !isAdmin) {
    return { success: false, error: "Forbidden" };
  }

  // Validate title and body length
  const trimmedTitle = input.title.trim();
  if (trimmedTitle.length < 3 || trimmedTitle.length > 180) {
    return { success: false, error: "Title must be between 3 and 180 characters" };
  }

  const trimmedBody = input.body.trim();
  if (trimmedBody.length < 20) {
    return { success: false, error: "Body content must be at least 20 characters long" };
  }

  if (input.excerpt && input.excerpt.length > 320) {
    return { success: false, error: "Excerpt cannot exceed 320 characters" };
  }

  if (input.seo_title && input.seo_title.length > 70) {
    return { success: false, error: "SEO Title cannot exceed 70 characters" };
  }

  if (input.seo_description && input.seo_description.length > 180) {
    return { success: false, error: "SEO Description cannot exceed 180 characters" };
  }

  const slug = await getUniqueSlug(trimmedTitle, supabase, id);
  const readingTime = calculateReadingTime(trimmedBody);

  // Same approval-workflow clamp as createArticle — but here the caller may
  // genuinely be an admin (checked above), in which case 'published'/
  // 'rejected' are legitimate and left as-is; the DB trigger permits it too,
  // since this runs on the admin's own authenticated session, not
  // service-role. Only a non-admin owner's attempt gets clamped.
  const effectiveStatus =
    !isAdmin && (input.status === "published" || input.status === "rejected")
      ? "pending_review"
      : input.status;

  const updateData = {
    title: trimmedTitle,
    slug,
    body: trimmedBody,
    excerpt: input.excerpt || null,
    cover_image_url: input.cover_image_url || null,
    categories: input.categories,
    tags: input.tags,
    seo_title: input.seo_title || null,
    seo_description: input.seo_description || null,
    canonical_url: input.canonical_url || null,
    visibility: input.visibility,
    status: effectiveStatus,
    scheduled_for: effectiveStatus === "scheduled" ? input.scheduled_for : null,
    reading_time: readingTime,
    business_id: input.business_id || null,
    organizer_id: input.organizer_id || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("articles")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating article:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/articles");
  revalidatePath(`/articles/${existing.slug}`);
  revalidatePath(`/articles/${slug}`);
  revalidatePath("/sitemap.xml");
  return { success: true, data };
}

export async function deleteArticle(id: string) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const { data: existing } = await supabase
    .from("articles")
    .select("owner_id, slug")
    .eq("id", id)
    .single();

  if (!existing) {
    return { success: false, error: "Article not found" };
  }

  const isAdmin = await checkIsAdmin(user.id, supabase);
  if (existing.owner_id !== user.id && !isAdmin) {
    return { success: false, error: "Forbidden" };
  }

  const { error } = await supabase
    .from("articles")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting article:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/articles");
  revalidatePath("/sitemap.xml");
  return { success: true };
}

async function checkIsAdmin(userId: string, supabase: any): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", userId)
    .single();

  return profile?.role === "admin" && profile?.status === "active";
}
