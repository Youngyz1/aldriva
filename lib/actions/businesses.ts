"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSlug } from "@/lib/slug";
import { revalidatePath } from "next/cache";
import { isValidIndustry, getCategoriesForIndustry, isValidBusinessTypeForCategory, isValidBusinessType, CATEGORIES_BY_INDUSTRY, BUSINESS_TYPES_BY_CATEGORY, normalizeIndustry } from "@/lib/business-taxonomy";
import { screenBusiness } from "@/lib/business-screening";

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
  business_type?: string | null;
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

  const trimmedIndustryRaw = input.industry.trim();
  if (!isValidIndustry(trimmedIndustryRaw)) {
    return { success: false, error: `Invalid industry: ${trimmedIndustryRaw}` };
  }
  const trimmedIndustry = normalizeIndustry(trimmedIndustryRaw);

  const trimmedCategory = input.category.trim();
  const validCats = getCategoriesForIndustry(trimmedIndustry);
  if (!validCats.includes(trimmedCategory)) {
    return { success: false, error: `Category "${trimmedCategory}" must belong to Industry "${trimmedIndustry}"` };
  }

  let trimmedBusinessType: string | null = null;
  if (input.business_type !== undefined && input.business_type !== null) {
    const bt = input.business_type.trim();
    if (bt) {
      if (bt !== "Custom Business" && !isValidBusinessTypeForCategory(bt, trimmedCategory)) {
        return { success: false, error: `Business Type "${bt}" must belong to Category "${trimmedCategory}"` };
      }
      trimmedBusinessType = bt;
    }
  }

  if (input.seo_title && input.seo_title.length > 70) {
    return { success: false, error: "SEO Title cannot exceed 70 characters" };
  }

  if (input.seo_description && input.seo_description.length > 180) {
    return { success: false, error: "SEO Description cannot exceed 180 characters" };
  }

  const slug = await getUniqueSlug(trimmedName, supabase);

  // New listings start as pending_review and require admin approval before
  // they are publicly visible — see migration_38_content_approval_workflow.sql.
  // listing_tier no longer gates status at all; it only records which Featured
  // upgrade (if any) the owner has purchased, tracked separately via is_featured
  // (set only by the Stripe/crypto payment webhooks, never by this action).
  const { data, error } = await supabase
    .from("businesses")
    .insert({
      owner_id: user.id,
      name: trimmedName,
      slug,
      description: trimmedDescription,
      industry: trimmedIndustry,
      category: trimmedCategory,
      business_type: trimmedBusinessType,
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
    console.error("Error creating business:", error);
    return { success: false, error: "Could not create the business. Please try again." };
  }

  // ── Automated screening (fail-closed, never auto-approve on error) ────────
  let decision: "approve" | "queue" | "reject" = "queue";
  let riskScore = 50;
  let reasons: string[] = [];
  let rejectionReason: string | null = null;
  try {
    const admin = createSupabaseAdmin();
    // Gather context (reads that user session cannot do use admin after insert)
    const { data: profile } = await admin.from("profiles").select("created_at").eq("id", user.id).maybeSingle();
    const accountCreatedAt = profile?.created_at ? new Date(profile.created_at) : new Date();
    const ownerAccountAgeDays = Math.floor((Date.now() - accountCreatedAt.getTime()) / 86400000);
    const ownerEmailVerified = !!user.email_confirmed_at;

    const { count: activeCount } = await admin.from("businesses").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("status", "active");
    const { count: rejectedCount } = await admin.from("businesses").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("status", "rejected");
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: last24hCount } = await admin.from("businesses").select("id", { count: "exact", head: true }).eq("owner_id", user.id).gte("created_at", since24h);

    // Duplicate matches against ACTIVE listings owned by someone else
    let byName = 0, byWebsite = 0, byPhone = 0;
    const normalizedName = trimmedName.toLowerCase().trim();
    const websiteDomain = input.website ? (() => { try { const u = new URL(input.website!.startsWith("http") ? input.website! : `https://${input.website!}`); return u.hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; } })() : null;
    const normalizedPhone = input.phone ? input.phone.replace(/\D/g, "") : null;

    // Query active listings (limited to avoid large scan)
    const { data: activeListings } = await admin.from("businesses").select("name, website, phone, owner_id").eq("status", "active").eq("is_flagged", false).limit(200);
    for (const row of (activeListings as any[]) || []) {
      if (row.owner_id === user.id) continue;
      if (row.name && row.name.toLowerCase().trim() === normalizedName) byName++;
      if (websiteDomain && row.website) {
        try {
          const d = new URL(row.website.startsWith("http") ? row.website : `https://${row.website}`).hostname.toLowerCase().replace(/^www\./, "");
          if (d === websiteDomain) byWebsite++;
        } catch {}
      }
      if (normalizedPhone && row.phone) {
        const p = row.phone.replace(/\D/g, "");
        if (p && p === normalizedPhone) byPhone++;
      }
    }

    const screened = screenBusiness(
      {
        name: trimmedName,
        description: trimmedDescription,
        website: input.website,
        email: input.email,
        phone: input.phone,
        industry: trimmedIndustry,
        category: trimmedCategory,
        business_type: trimmedBusinessType,
        address: input.address,
        city: input.city,
        state: input.state,
        country: input.country,
      },
      {
        ownerAccountAgeDays,
        ownerEmailVerified,
        ownerPriorActiveListings: activeCount || 0,
        ownerPriorRejectedListings: rejectedCount || 0,
        listingsCreatedLast24h: last24hCount || 0,
        duplicateMatches: { byName, byWebsite, byPhone },
      }
    );
    decision = screened.decision;
    riskScore = screened.riskScore;
    reasons = screened.reasons;

    // Map decision to DB writes (idempotent conditional on status pending_review)
    let newStatus: string | null = null;
    let dbDecision: string = "queued";
    if (decision === "approve") {
      newStatus = "active";
      dbDecision = "auto_approved";
    } else if (decision === "reject") {
      newStatus = "rejected";
      dbDecision = "auto_rejected";
      rejectionReason = "Your listing was not approved due to policy violation. Please review our business guidelines or contact support.";
    } else {
      dbDecision = "queued";
    }

    if (newStatus) {
      await admin.from("businesses").update({
        status: newStatus,
        screening_risk_score: riskScore,
        screened_at: new Date().toISOString(),
        ...(rejectionReason ? { rejection_reason: rejectionReason } : {}),
      }).eq("id", data.id).eq("status", "pending_review");
    } else {
      await admin.from("businesses").update({
        screening_risk_score: riskScore,
        screened_at: new Date().toISOString(),
      }).eq("id", data.id).eq("status", "pending_review");
    }

    await admin.from("business_moderation_events").insert({
      business_id: data.id,
      decision: dbDecision,
      risk_score: riskScore,
      reasons,
      actor: null,
    });
  } catch (e) {
    console.error("Screening failed, leaving pending_review (fail-closed):", e);
    decision = "queue";
    riskScore = 50;
    reasons = ["Screening error, queued for manual review"];
    try {
      const admin = createSupabaseAdmin();
      await admin.from("businesses").update({ screening_risk_score: riskScore, screened_at: new Date().toISOString() }).eq("id", data.id).eq("status", "pending_review");
      await admin.from("business_moderation_events").insert({ business_id: data.id, decision: "queued", risk_score: riskScore, reasons, actor: null });
    } catch {}
  }

  revalidatePath("/businesses");
  revalidatePath("/dashboard/businesses");
  revalidatePath(`/businesses/${data.slug}`);
  // Return decision so UI can say live now / under review / not approved
  if (decision === "approve") {
    return { success: true, data, decision: "approve", message: "Your business is now live." };
  }
  if (decision === "reject") {
    return { success: true, data, decision: "reject", message: rejectionReason || "Your listing was not approved.", rejection_reason: rejectionReason };
  }
  return { success: true, data, decision: "queue", message: "Your listing is under review — usually within minutes." };
}

export async function updateBusiness(id: string, input: Partial<BusinessInput>) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  // Fetch existing for re-screen comparison (need old status and screened fields)
  const { data: existingBusiness } = await supabase.from("businesses").select("name, description, website, phone, industry, category, business_type, address, city, state, country, status, owner_id").eq("id", id).eq("owner_id", user.id).maybeSingle();

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
    const trimmedIndustryRaw = input.industry.trim();
    if (!isValidIndustry(trimmedIndustryRaw)) {
      return { success: false, error: `Invalid industry: ${trimmedIndustryRaw}` };
    }
    updates.industry = normalizeIndustry(trimmedIndustryRaw);
  }

  if (input.category !== undefined) {
    const trimmedCategory = input.category.trim();
    const industryForCat = input.industry !== undefined ? input.industry.trim() : null;
    if (industryForCat) {
      if (!getCategoriesForIndustry(industryForCat).includes(trimmedCategory)) {
        return { success: false, error: `Category "${trimmedCategory}" must belong to Industry "${industryForCat}"` };
      }
    } else {
      const allCats = (Object.values(CATEGORIES_BY_INDUSTRY) as unknown as string[][]).flat();
      if (!allCats.includes(trimmedCategory) && trimmedCategory !== "Other") {
        return { success: false, error: `Invalid category: ${trimmedCategory}` };
      }
    }
    updates.category = trimmedCategory;
  }

  if (input.business_type !== undefined) {
    const rawBt = input.business_type;
    const bt = rawBt ? rawBt.trim() : null;
    if (bt) {
      const catForCheck = input.category !== undefined ? input.category.trim() : null;
      if (catForCheck) {
        if (bt !== "Custom Business" && !isValidBusinessTypeForCategory(bt, catForCheck)) {
          return { success: false, error: `Business Type "${bt}" must belong to Category "${catForCheck}"` };
        }
      } else if (!isValidBusinessType(bt) && bt !== "Custom Business") {
        const exists = (Object.values(BUSINESS_TYPES_BY_CATEGORY) as unknown as string[][]).some((arr) => arr.includes(bt));
        if (!exists) return { success: false, error: `Invalid business type: ${bt}` };
      }
      updates.business_type = bt;
    } else {
      updates.business_type = null;
    }
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
    console.error("Error updating business:", error);
    return { success: false, error: "Could not update the business. Please try again." };
  }

  // ── Re-screen on edit if screened fields changed on an ACTIVE listing ──────
  const screenedFields: (keyof BusinessInput)[] = ["name", "description", "website", "phone", "industry", "category"];
  const didScreenedFieldChange = screenedFields.some((f) => input[f] !== undefined);
  const wasActive = existingBusiness?.status === "active";

  let reScreenDecision: string | null = null;
  let reScreenMessage: string | null = null;

  const wasRejected = existingBusiness?.status === "rejected";

  if (didScreenedFieldChange && (wasActive || wasRejected)) {
    // For rejected listings, cap resubmissions at 3 per 24h per listing
    if (wasRejected) {
      try {
        const adminCap = createSupabaseAdmin();
        const since24hCap = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count: recentRescreens } = await adminCap.from("business_moderation_events").select("id", { count: "exact", head: true }).eq("business_id", id).in("decision", ["re_screen_queued", "re_screen_passed"]).gte("created_at", since24hCap);
        if ((recentRescreens || 0) >= 3) {
          return {
            success: false,
            error: "You have reached the resubmission limit for this listing. Please try again tomorrow.",
          };
        }
      } catch (e) {
        console.error("Failed to check resubmission cap:", e);
        // Fail open for cap check? Allow to proceed to screening
      }
    }

    try {
      const admin = createSupabaseAdmin();
      // Gather context similar to create
      const { data: profile } = await admin.from("profiles").select("created_at").eq("id", user.id).maybeSingle();
      const accountCreatedAt = profile?.created_at ? new Date(profile.created_at) : new Date();
      const ownerAccountAgeDays = Math.floor((Date.now() - accountCreatedAt.getTime()) / 86400000);
      const ownerEmailVerified = !!user.email_confirmed_at;
      const { count: activeCount } = await admin.from("businesses").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("status", "active");
      const { count: rejectedCount } = await admin.from("businesses").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("status", "rejected");
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: last24hCount } = await admin.from("businesses").select("id", { count: "exact", head: true }).eq("owner_id", user.id).gte("created_at", since24h);

      // Duplicate matches (same as create, but exclude self)
      let byName = 0, byWebsite = 0, byPhone = 0;
      const newName = (input.name ?? existingBusiness?.name ?? "").toLowerCase().trim();
      const newWebsiteRaw = (input.website !== undefined ? input.website : existingBusiness?.website) as string | null;
      const newPhoneRaw = (input.phone !== undefined ? input.phone : existingBusiness?.phone) as string | null;
      const websiteDomain = newWebsiteRaw ? (() => { try { const u = new URL(newWebsiteRaw.startsWith("http") ? newWebsiteRaw : `https://${newWebsiteRaw}`); return u.hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; } })() : null;
      const normalizedPhone = newPhoneRaw ? newPhoneRaw.replace(/\D/g, "") : null;
      const { data: activeListings } = await admin.from("businesses").select("name, website, phone, owner_id, id").eq("status", "active").eq("is_flagged", false).limit(200);
      for (const row of (activeListings as any[]) || []) {
        if (row.id === id) continue;
        if (row.owner_id === user.id) continue;
        if (row.name && row.name.toLowerCase().trim() === newName) byName++;
        if (websiteDomain && row.website) {
          try {
            const d = new URL(row.website.startsWith("http") ? row.website : `https://${row.website}`).hostname.toLowerCase().replace(/^www\./, "");
            if (d === websiteDomain) byWebsite++;
          } catch {}
        }
        if (normalizedPhone && row.phone) {
          const p = row.phone.replace(/\D/g, "");
          if (p && p === normalizedPhone) byPhone++;
        }
      }

      // Resolve new industry/category/business_type for screening
      const newIndustry = (input.industry ?? existingBusiness?.industry ?? "") as string;
      const newCategory = (input.category ?? existingBusiness?.category ?? "") as string;
      const newBusinessType = (input.business_type ?? existingBusiness?.business_type ?? null) as string | null;
      const newDescription = (input.description ?? existingBusiness?.description ?? "") as string;
      const newAddress = (input.address ?? existingBusiness?.address ?? null) as string | null;

      const screened = screenBusiness(
        {
          name: (input.name ?? existingBusiness?.name ?? "") as string,
          description: newDescription,
          website: newWebsiteRaw,
          email: existingBusiness ? null : null,
          phone: newPhoneRaw,
          industry: newIndustry,
          category: newCategory,
          business_type: newBusinessType,
          address: newAddress,
          city: (input.city ?? (existingBusiness as any)?.city) ?? null,
          state: (input.state ?? (existingBusiness as any)?.state) ?? null,
          country: (input.country ?? (existingBusiness as any)?.country) ?? null,
        },
        {
          ownerAccountAgeDays,
          ownerEmailVerified,
          ownerPriorActiveListings: activeCount || 0,
          ownerPriorRejectedListings: rejectedCount || 0,
          listingsCreatedLast24h: last24hCount || 0,
          duplicateMatches: { byName, byWebsite, byPhone },
        }
      );

      if (wasActive) {
        if (screened.decision !== "approve") {
          // Re-queue: set back to pending_review via admin with conditional write
          await admin.from("businesses").update({ status: "pending_review", screening_risk_score: screened.riskScore, screened_at: new Date().toISOString() }).eq("id", id).eq("status", "active");
          await admin.from("business_moderation_events").insert({ business_id: id, decision: "re_screen_queued", risk_score: screened.riskScore, reasons: screened.reasons, actor: null });
          reScreenDecision = "re_screen_queued";
          reScreenMessage = "Your changes are under review — listing queued for manual review.";
        } else {
          await admin.from("business_moderation_events").insert({ business_id: id, decision: "re_screen_passed", risk_score: screened.riskScore, reasons: screened.reasons, actor: null });
          await admin.from("businesses").update({ screening_risk_score: screened.riskScore, screened_at: new Date().toISOString() }).eq("id", id).eq("status", "active");
          reScreenDecision = "re_screen_passed";
        }
      } else if (wasRejected) {
        // For rejected: approve -> active, otherwise -> pending_review (never leave rejected, never auto-reject repeatedly)
        if (screened.decision === "approve") {
          await admin.from("businesses").update({ status: "active", screening_risk_score: screened.riskScore, screened_at: new Date().toISOString(), rejection_reason: null }).eq("id", id).eq("status", "rejected");
          await admin.from("business_moderation_events").insert({ business_id: id, decision: "re_screen_passed", risk_score: screened.riskScore, reasons: screened.reasons, actor: null });
          reScreenDecision = "re_screen_passed";
          reScreenMessage = "Your listing has been approved and is now live.";
        } else {
          // queue or reject both become pending_review for human review, with re_screen_queued event (never expose rule names)
          await admin.from("businesses").update({ status: "pending_review", screening_risk_score: screened.riskScore, screened_at: new Date().toISOString() }).eq("id", id).eq("status", "rejected");
          await admin.from("business_moderation_events").insert({ business_id: id, decision: "re_screen_queued", risk_score: screened.riskScore, reasons: screened.reasons, actor: null });
          reScreenDecision = "re_screen_queued";
          reScreenMessage = "Your changes are under review — usually within minutes. A human will review your listing.";
        }
      }
    } catch (e) {
      console.error("Re-screen failed, leaving pending_review (fail-closed):", e);
      try {
        const admin = createSupabaseAdmin();
        // For both active and rejected, fail-closed to pending_review if we were re-screening
        const targetStatus = wasActive ? "active" : "rejected";
        await admin.from("businesses").update({ status: "pending_review", screening_risk_score: 50, screened_at: new Date().toISOString() }).eq("id", id).eq("status", targetStatus);
        await admin.from("business_moderation_events").insert({ business_id: id, decision: "re_screen_queued", risk_score: 50, reasons: ["Re-screen error, queued"], actor: null });
        reScreenDecision = "re_screen_queued";
        reScreenMessage = "Your changes are under review.";
      } catch {}
    }
  }

  revalidatePath("/businesses");
  revalidatePath(`/businesses/${data.slug}`);
  revalidatePath("/dashboard/businesses");
  if (reScreenDecision === "re_screen_queued") {
    return { success: true, data, decision: "re_screen_queued", message: reScreenMessage };
  }
  if (reScreenDecision === "re_screen_passed") {
    return { success: true, data, decision: "re_screen_passed" };
  }
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
    console.error("Error deleting business:", error);
    return { success: false, error: "Could not delete the business. Please try again." };
  }

  revalidatePath("/businesses");
  revalidatePath("/dashboard/businesses");
  return { success: true };
}
