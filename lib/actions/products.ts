"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { createSlug } from "@/lib/slug";
import { revalidatePath } from "next/cache";
import { MAX_IMAGES } from "@/lib/products-constants";

async function getUniqueSlug(name: string, supabase: any, excludeId?: string): Promise<string> {
  let baseSlug = createSlug(name);
  // Ensure slug matches constraint: '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  baseSlug = baseSlug.replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-");
  if (!baseSlug || baseSlug === "-") {
    baseSlug = "product";
  }

  let slug = baseSlug;
  let counter = 1;
  while (counter < 100) {
    let query = supabase.from("products").select("id").eq("slug", slug);
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

async function validateBusinessOwnership(
  businessId: string | null | undefined,
  userId: string,
  supabase: any
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!businessId) return { ok: true };

  const { data: business } = await supabase
    .from("businesses")
    .select("id, owner_id")
    .eq("id", businessId)
    .maybeSingle();

  if (!business || business.owner_id !== userId) {
    return { ok: false, error: "You can only tag products with a business you own." };
  }

  return { ok: true };
}

export type ProductInput = {
  name: string;
  description: string;
  images?: string[];
  price_type: "one_time" | "subscription";
  stripe_price_id?: string | null;
  stock_quantity?: number | null;
  status?: "active" | "out_of_stock" | "archived";
  business_id?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
};

export async function createProduct(input: ProductInput) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const trimmedName = input.name.trim();
  if (trimmedName.length < 3 || trimmedName.length > 180) {
    return { success: false, error: "Name must be between 3 and 180 characters" };
  }

  const trimmedDescription = input.description.trim();
  if (trimmedDescription.length < 20) {
    return { success: false, error: "Description must be at least 20 characters long" };
  }

  if (input.seo_title && input.seo_title.length > 70) {
    return { success: false, error: "SEO Title cannot exceed 70 characters" };
  }

  if (input.seo_description && input.seo_description.length > 180) {
    return { success: false, error: "SEO Description cannot exceed 180 characters" };
  }

  const images = (input.images || []).slice(0, MAX_IMAGES);

  if (input.stock_quantity !== null && input.stock_quantity !== undefined && input.stock_quantity < 0) {
    return { success: false, error: "Stock quantity cannot be negative." };
  }

  const businessCheck = await validateBusinessOwnership(input.business_id, user.id, supabase);
  if (!businessCheck.ok) {
    return { success: false, error: businessCheck.error };
  }

  const slug = await getUniqueSlug(trimmedName, supabase);

  // Listing is free, but publicly going live requires admin approval — see
  // migration_38_content_approval_workflow.sql. Every new product starts
  // pending_review regardless of anything the owner sets.
  const { data, error } = await supabase
    .from("products")
    .insert({
      owner_id: user.id,
      business_id: input.business_id || null,
      name: trimmedName,
      slug,
      description: trimmedDescription,
      images,
      price_type: input.price_type,
      stripe_price_id: input.stripe_price_id || null,
      stock_quantity: input.stock_quantity ?? null,
      status: "pending_review",
      seo_title: input.seo_title || null,
      seo_description: input.seo_description || null,
    })
    .select("id, slug")
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/products");
  revalidatePath("/dashboard/products");
  return { success: true, data };
}

export async function updateProduct(id: string, input: Partial<ProductInput>) {
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

  if (input.images !== undefined) {
    updates.images = input.images.slice(0, MAX_IMAGES);
  }

  if (input.stock_quantity !== undefined) {
    if (input.stock_quantity !== null && input.stock_quantity < 0) {
      return { success: false, error: "Stock quantity cannot be negative." };
    }
    updates.stock_quantity = input.stock_quantity;
  }

  if (input.business_id !== undefined) {
    const businessCheck = await validateBusinessOwnership(input.business_id, user.id, supabase);
    if (!businessCheck.ok) {
      return { success: false, error: businessCheck.error };
    }
    updates.business_id = input.business_id || null;
  }

  if (input.price_type !== undefined) updates.price_type = input.price_type;
  if (input.stripe_price_id !== undefined) updates.stripe_price_id = input.stripe_price_id || null;
  if (input.status !== undefined) updates.status = input.status;

  const { data, error } = await supabase
    .from("products")
    .update(updates)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id, slug")
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/products");
  revalidatePath(`/products/${data.slug}`);
  revalidatePath("/dashboard/products");
  return { success: true, data };
}

export async function deleteProduct(id: string) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  // RLS only allows owner-delete when status = 'archived'; a still-active
  // product (or one with order history, via ON DELETE RESTRICT) will fail
  // here and surface as error.message below.
  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/products");
  revalidatePath("/dashboard/products");
  return { success: true };
}
