"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { createSlug } from "@/lib/slug";
import { revalidatePath } from "next/cache";
import { MAX_IMAGES, MAX_PREVIEW_IMAGES } from "@/lib/products-constants";
import {
  isDigitalProductType,
  isValidLicense,
  isValidProductType,
  normalizeTags,
} from "@/lib/digital-products";

async function getUniqueSlug(name: string, supabase: any, excludeId?: string): Promise<string> {
  let baseSlug = createSlug(name);
  // Ensure slug matches constraint: '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  baseSlug = baseSlug.replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-");
  if (!baseSlug || baseSlug === "-") {
    baseSlug = "product";
  }

  // Reserved slugs collide with real sibling pages under /products/* (the
  // proxy product gate skips them, so a product owning one would be
  // unreachable). Suffix on collision instead of failing.
  const RESERVED_SLUGS = new Set(["library", "order-confirmation", "new"]);
  if (RESERVED_SLUGS.has(baseSlug)) {
    baseSlug = `${baseSlug}-product`;
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
  // Digital-product listing metadata (migration_116, all optional).
  subtitle?: string | null;
  product_type?: string | null;
  category?: string | null;
  tags?: string[] | string | null;
  cover_image_url?: string | null;
  license?: string | null;
  version?: string | null;
  update_policy?: string | null;
  preview_images?: string[] | null;
};

/**
 * Validates + normalizes the digital-listing fields shared by create and
 * update. Returns the columns to write, or an error string. Digital product
 * types ('ebook' … 'bundle', anything but 'other') never carry inventory:
 * stock is forced to NULL for them so no physical-stock language can leak
 * onto a digital listing. Physical ('other') behavior is unchanged.
 */
function normalizeDigitalFields(input: Partial<ProductInput>): {
  ok: true;
  columns: Record<string, unknown>;
} | { ok: false; error: string } {
  const columns: Record<string, unknown> = {};

  if (input.product_type !== undefined && input.product_type !== null) {
    if (!isValidProductType(input.product_type)) {
      return { ok: false, error: "Invalid product type." };
    }
    columns.product_type = input.product_type;
  }

  if (input.subtitle !== undefined) {
    const subtitle = (input.subtitle ?? "").trim();
    if (subtitle.length > 180) {
      return { ok: false, error: "Subtitle cannot exceed 180 characters." };
    }
    columns.subtitle = subtitle || null;
  }

  if (input.category !== undefined) {
    const category = (input.category ?? "").trim();
    if (category.length > 80) {
      return { ok: false, error: "Category cannot exceed 80 characters." };
    }
    columns.category = category || null;
  }

  if (input.tags !== undefined) {
    columns.tags = normalizeTags(input.tags ?? []);
  }

  if (input.cover_image_url !== undefined) {
    const cover = (input.cover_image_url ?? "").trim();
    if (cover.length > 2048) {
      return { ok: false, error: "Cover image URL is too long." };
    }
    columns.cover_image_url = cover || null;
  }

  if (input.license !== undefined) {
    const license = (input.license ?? "").trim() || "personal";
    if (!isValidLicense(license)) {
      return { ok: false, error: "Invalid license." };
    }
    columns.license = license;
  }

  if (input.version !== undefined) {
    const version = (input.version ?? "").trim() || "1.0";
    if (version.length > 20) {
      return { ok: false, error: "Version cannot exceed 20 characters." };
    }
    columns.version = version;
  }

  if (input.update_policy !== undefined) {
    const policy = (input.update_policy ?? "").trim();
    if (policy.length > 500) {
      return { ok: false, error: "Update policy cannot exceed 500 characters." };
    }
    columns.update_policy = policy || null;
  }

  if (input.preview_images !== undefined) {
    columns.preview_images = (input.preview_images || []).slice(0, MAX_PREVIEW_IMAGES);
  }

  return { ok: true, columns };
}

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

  const digital = normalizeDigitalFields(input);
  if (!digital.ok) {
    return { success: false, error: digital.error };
  }

  // Digital listings never carry inventory — a digital product_type forces
  // stock to NULL (unlimited) so physical-stock messaging can never leak
  // onto a digital listing. Physical ('other'/unset) behavior is unchanged.
  const isDigital = isDigitalProductType(input.product_type ?? "other");
  if (isDigital) {
    if (input.stock_quantity !== null && input.stock_quantity !== undefined) {
      return { success: false, error: "Digital products do not use stock quantity." };
    }
  } else if (input.stock_quantity !== null && input.stock_quantity !== undefined && input.stock_quantity < 0) {
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
      stock_quantity: isDigital ? null : (input.stock_quantity ?? null),
      status: "pending_review",
      seo_title: input.seo_title || null,
      seo_description: input.seo_description || null,
      ...digital.columns,
    })
    .select("id, slug")
    .single();

  if (error) {
    console.error("Error creating product:", error);
    return { success: false, error: "Could not create the product. Please try again." };
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

  const digital = normalizeDigitalFields(input);
  if (!digital.ok) {
    return { success: false, error: digital.error };
  }
  Object.assign(updates, digital.columns);

  // Resolve the effective product type (explicit change wins, otherwise the
  // stored value) so stock forcing stays correct when only other fields change.
  let effectiveType: string | null = null;
  if (input.product_type !== undefined && input.product_type !== null) {
    effectiveType = input.product_type;
  } else if (input.stock_quantity !== undefined) {
    const { data: current } = await supabase
      .from("products")
      .select("product_type")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle();
    effectiveType = (current?.product_type as string | null) ?? null;
  }
  const isDigital = isDigitalProductType(effectiveType ?? "other");

  if (input.stock_quantity !== undefined) {
    if (isDigital) {
      if (input.stock_quantity !== null) {
        return { success: false, error: "Digital products do not use stock quantity." };
      }
      updates.stock_quantity = null;
    } else {
      if (input.stock_quantity !== null && input.stock_quantity < 0) {
        return { success: false, error: "Stock quantity cannot be negative." };
      }
      updates.stock_quantity = input.stock_quantity;
    }
  } else if (input.product_type !== undefined && input.product_type !== null && isDigital) {
    // Switching a listing to a digital type clears any leftover inventory.
    updates.stock_quantity = null;
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
    console.error("Error updating product:", error);
    return { success: false, error: "Could not update the product. Please try again." };
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
    console.error("Error deleting product:", error);
    return { success: false, error: "Could not delete the product. Please try again." };
  }

  revalidatePath("/products");
  revalidatePath("/dashboard/products");
  return { success: true };
}
