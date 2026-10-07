"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateBusiness } from "@/lib/actions/businesses";
import { MediaUploadField } from "@/components/dashboard/website/builder/inspectors/common/MediaUploadField";
import { INDUSTRIES, getCategoriesForIndustry, getBusinessTypesForCategory } from "@/lib/business-taxonomy";

type Business = {
  id: string;
  name: string;
  description: string;
  industry: string;
  category: string;
  business_type: string | null;
  logo: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  listing_tier: string;
  seo_title: string | null;
  seo_description: string | null;
};

export default function EditBusinessFormClient({
  business,
  tenantId,
}: {
  business: Business;
  tenantId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({
    name: business.name,
    description: business.description,
    industry: business.industry,
    category: business.category,
    business_type: business.business_type || "",
    logo: business.logo || "",
    website: business.website || "",
    email: business.email || "",
    phone: business.phone || "",
    address: business.address || "",
    city: business.city || "",
    state: business.state || "",
    country: business.country || "",
    seo_title: business.seo_title || "",
    seo_description: business.seo_description || "",
  });


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await updateBusiness(business.id, {
      name: form.name,
      description: form.description,
      industry: form.industry,
      category: form.category,
      business_type: form.business_type || null,
      logo: form.logo || null,
      website: form.website || null,
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      city: form.city || null,
      state: form.state || null,
      country: form.country || null,
      seo_title: form.seo_title || null,
      seo_description: form.seo_description || null,
    });

    setLoading(false);

    if (res.success) {
      const decision = (res as any).decision as string | undefined;
      const message = (res as any).message as string | undefined;
      if (decision === "re_screen_queued") {
        setSuccess(message || "Your changes are under review — listing queued for manual review.");
        setError("");
        // Stay on edit page so owner can see queued state, but also allow navigation
        setTimeout(() => {
          router.push("/dashboard/businesses");
          router.refresh();
        }, 1200);
        return;
      }
      if (decision === "re_screen_passed") {
        setSuccess("Changes saved and re-screen passed.");
      }
      router.push("/dashboard/businesses");
      router.refresh();
    } else {
      setError(res.error || "Failed to update business details");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-150 pb-5">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-zinc-400 mb-1">
            <Link href="/dashboard/businesses" className="hover:text-orange-600">
              Businesses
            </Link>
            <span>/</span>
            <span className="text-zinc-600">Edit Business</span>
          </div>
          <h1 className="text-2xl font-black text-zinc-900">Edit "{business.name}"</h1>
        </div>
        <Link
          href="/dashboard/businesses"
          className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-bold text-zinc-700 hover:bg-zinc-50"
        >
          Cancel
        </Link>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm font-semibold text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm font-semibold text-amber-800">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Column 1: Basic Details */}
          <div className="space-y-4 border-t border-zinc-200 pt-6">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-50 pb-2">Basic Information</h2>

            <div>
              <label className="block text-sm font-black text-zinc-600 mb-1">Business Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
              />
            </div>

            <div>
              <label className="block text-sm font-black text-zinc-600 mb-1">Description *</label>
              <textarea
                required
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={4}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
              />
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-black text-zinc-600 mb-1">Industry *</label>
                <select
                  required
                  value={form.industry}
                  onChange={(e) => {
                    const ind = e.target.value;
                    const cats = ind ? getCategoriesForIndustry(ind) : [];
                    const newCat = cats.includes(form.category) ? form.category : cats[0] || "";
                    const types = newCat ? getBusinessTypesForCategory(newCat) : [];
                    const newType = types.includes(form.business_type) ? form.business_type : types[0] || "";
                    setForm({ ...form, industry: ind, category: newCat, business_type: newType });
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
                >
                  <option value="">Select Industry</option>
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                  {form.industry && !(INDUSTRIES as readonly string[]).includes(form.industry) && (
                    <option value={form.industry}>{form.industry} (legacy)</option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-sm font-black text-zinc-600 mb-1">Category *</label>
                <select
                  required
                  value={form.category}
                  onChange={(e) => {
                    const cat = e.target.value;
                    const types = cat ? getBusinessTypesForCategory(cat) : [];
                    const newType = types.includes(form.business_type) ? form.business_type : types[0] || "";
                    setForm({ ...form, category: cat, business_type: newType });
                  }}
                  disabled={!form.industry}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 disabled:opacity-50"
                >
                  <option value="">Select Category</option>
                  {form.industry && getCategoriesForIndustry(form.industry).map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  {form.category && form.industry && !getCategoriesForIndustry(form.industry).includes(form.category) && (
                    <option value={form.category}>{form.category} (legacy)</option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-sm font-black text-zinc-600 mb-1">Business Type *</label>
                <select
                  required
                  value={form.business_type}
                  onChange={(e) => setForm({ ...form, business_type: e.target.value })}
                  disabled={!form.category}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 disabled:opacity-50"
                >
                  <option value="">Select Business Type</option>
                  {form.category && getBusinessTypesForCategory(form.category).map((bt) => (
                    <option key={bt} value={bt}>{bt}</option>
                  ))}
                  {form.business_type && form.category && !(getBusinessTypesForCategory(form.category) as readonly string[]).includes(form.business_type) && (
                    <option value={form.business_type}>{form.business_type} (legacy)</option>
                  )}
                </select>
              </div>
            </div>

            <div>
              <MediaUploadField
                label="Logo"
                description="Upload or select from My Media"
                value={form.logo}
                tenantId={tenantId}
                folderSubpath="business-logos"
                cropShape="round"
                onChange={(url) => setForm((prev) => ({ ...prev, logo: url }))}
              />
            </div>
          </div>

          {/* Column 2: Contact & Location */}
          <div className="space-y-4 border-t border-zinc-200 pt-6">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-50 pb-2">Contact & Location</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-black text-zinc-600 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
                />
              </div>
              <div>
                <label className="block text-sm font-black text-zinc-600 mb-1">Phone</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-black text-zinc-600 mb-1">Website URL</label>
              <input
                type="url"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
              />
            </div>

            <div>
              <label className="block text-sm font-black text-zinc-600 mb-1">Street Address</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-sm font-black text-zinc-600 mb-1">City</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold outline-none transition focus:border-orange-500 focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-black text-zinc-600 mb-1">State</label>
                <input
                  type="text"
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold outline-none transition focus:border-orange-500 focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-black text-zinc-600 mb-1">Country</label>
                <input
                  type="text"
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold outline-none transition focus:border-orange-500 focus:bg-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* SEO */}
        <div className="space-y-4 border-t border-zinc-200 pt-6">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-50 pb-2">SEO Configurations</h2>

          <div>
            <label className="block text-sm font-black text-zinc-600 mb-1">SEO Title</label>
            <input
              type="text"
              value={form.seo_title}
              onChange={(e) => setForm({ ...form, seo_title: e.target.value })}
              maxLength={70}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="block text-sm font-black text-zinc-600 mb-1">SEO Meta Description</label>
            <textarea
              value={form.seo_description}
              onChange={(e) => setForm({ ...form, seo_description: e.target.value })}
              rows={2}
              maxLength={180}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white"
            />
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3 pb-8">
          <Link
            href="/dashboard/businesses"
            className="rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-bold text-zinc-700 hover:bg-zinc-50 transition"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-orange-600 px-6 py-2.5 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-50 transition"
          >
            {loading ? "Saving Changes..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
