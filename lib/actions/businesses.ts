"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { createSlug } from "@/lib/slug";
import { revalidatePath } from "next/cache";

async function getUniqueSlug(name: string, supabase: any, excludeId?: string): Promise<string> {
  let baseSlug = createSlug(name);
  // Ensure slug matches constraint: '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  baseSlug = baseSlug.replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-");
  if (!baseSlug || baseSlug === "-") {
    baseSlug = "business";
  }

  let slug = baseSlug;
  let counter = 1;
  while (counter < 100) {
    let query = supabase.from("businesses").select("id").eq("slug", slug);
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

export type BusinessInput = {
  name: string;
  description: string;
  industry: string;
  category: string;
  logo?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  listing_tier: "free" | "one_time" | "subscription";
  seo_title?: string | null;
  seo_description?: string | null;
};

export async function createBusiness(input: BusinessInput) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  // Validate fields to match DB constraints
  const trimmedName = input.name.trim();
  if (trimmedName.length < 3 || trimmedName.length > 180) {
    return { success: false, error: "Name must be between 3 and 180 characters" };
  }

  const trimmedDescription = input.description.trim();
  if (trimmedDescription.length < 20) {
    return { success: false, error: "Description must be at least 20 characters long" };
  }

  const trimmedIndustry = input.industry.trim();
  if (trimmedIndustry.length < 2) {
    return { success: false, error: "Industry must be at least 2 characters long" };
  }

  const trimmedCategory = input.category.trim();
  if (trimmedCategory.length < 2) {
    return { success: false, error: "Category must be at least 2 characters long" };
  }

  if (input.seo_title && input.seo_title.length > 70) {
    return { success: false, error: "SEO Title cannot exceed 70 characters" };
  }

  if (input.seo_description && input.seo_description.length > 180) {
    return { success: false, error: "SEO Description cannot exceed 180 characters" };
  }

  const slug = await getUniqueSlug(trimmedName, supabase);

  // Listing is free, but publicly going live requires admin approval — see
  // migration_38_content_approval_workflow.sql. listing_tier no longer gates
  // status at all; it only records which Featured upgrade (if any) the owner
  // has purchased, tracked separately via is_featured (set only by the
  // Stripe/crypto payment webhooks, never by this action).
  const { data, error } = await supabase
    .from("businesses")
    .insert({
      owner_id: user.id,
      name: trimmedName,
      slug,
      description: trimmedDescription,
      industry: trimmedIndustry,
      category: trimmedCategory,
      logo: input.logo || null,
      website: input.website || null,
      email: input.email || null,
      phone: input.phone || null,
      address: input.address || null,
      city: input.city || null,
      state: input.state || null,
      country: input.country || null,
      listing_tier: input.listing_tier,
      status: "pending_review",
      is_flagged: false,
    })
    .select("id, slug")
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/businesses");
  revalidatePath("/dashboard/businesses");
  return { success: true, data };
}

export async function updateBusiness(id: string, input: Partial<BusinessInput>) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const updates: Record<string, any> = {};

  if (input.name !== undefined) {
    const trimmedName = input.name.trim();
    if (trimmedName.length < 3 || trimmedName.length > 180) {
      return { success: false, error: "Name must be between 3 and 180 characters" };
    }
    updates.name = trimmedName;
    updates.slug = await getUniqueSlug(trimmedName, supabase, id);
  }

  if (input.description !== undefined) {
    const trimmedDescription = input.description.trim();
    if (trimmedDescription.length < 20) {
      return { success: false, error: "Description must be at least 20 characters long" };
    }
    updates.description = trimmedDescription;
  }

  if (input.industry !== undefined) {
    const trimmedIndustry = input.industry.trim();
    if (trimmedIndustry.length < 2) {
      return { success: false, error: "Industry must be at least 2 characters long" };
    }
    updates.industry = trimmedIndustry;
  }

  if (input.category !== undefined) {
    const trimmedCategory = input.category.trim();
    if (trimmedCategory.length < 2) {
      return { success: false, error: "Category must be at least 2 characters long" };
    }
    updates.category = trimmedCategory;
  }

  if (input.seo_title !== undefined) {
    if (input.seo_title && input.seo_title.length > 70) {
      return { success: false, error: "SEO Title cannot exceed 70 characters" };
    }
    updates.seo_title = input.seo_title || null;
  }

  if (input.seo_description !== undefined) {
    if (input.seo_description && input.seo_description.length > 180) {
      return { success: false, error: "SEO Description cannot exceed 180 characters" };
    }
    updates.seo_description = input.seo_description || null;
  }

  if (input.logo !== undefined) updates.logo = input.logo || null;
  if (input.website !== undefined) updates.website = input.website || null;
  if (input.email !== undefined) updates.email = input.email || null;
  if (input.phone !== undefined) updates.phone = input.phone || null;
  if (input.address !== undefined) updates.address = input.address || null;
  if (input.city !== undefined) updates.city = input.city || null;
  if (input.state !== undefined) updates.state = input.state || null;
  if (input.country !== undefined) updates.country = input.country || null;
  if (input.listing_tier !== undefined) updates.listing_tier = input.listing_tier;

  const { data, error } = await supabase
    .from("businesses")
    .update(updates)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id, slug")
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/businesses");
  revalidatePath(`/businesses/${data.slug}`);
  revalidatePath("/dashboard/businesses");
  return { success: true, data };
}

export async function deleteBusiness(id: string) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const { error } = await supabase
    .from("businesses")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/businesses");
  revalidatePath("/dashboard/businesses");
  return { success: true };
}
