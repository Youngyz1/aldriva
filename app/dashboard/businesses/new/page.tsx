"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBusiness } from "@/lib/actions/businesses";
import { useImageUpload, ALLOWED_IMAGE_TYPES } from "@/hooks/use-image-upload";

export default function NewBusinessPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    description: "",
    industry: "",
    category: "",
    logo: "",
    website: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    country: "",
    listing_tier: "free" as "free" | "one_time" | "subscription",
    seo_title: "",
    seo_description: "",
  });

  const { uploading: uploadingLogo, fileInputRef: logoInputRef, triggerUpload: triggerLogoUpload, handleFileChange: handleLogoFileChange } = useImageUpload({
    folder: "business-logos",
    onSuccess: (url) => setForm((prev) => ({ ...prev, logo: url })),
    onError: (msg) => setError(msg),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await createBusiness({
      name: form.name,
      description: form.description,
      industry: form.industry,
      category: form.category,
      logo: form.logo || null,
      website: form.website || null,
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      city: form.city || null,
      state: form.state || null,
      country: form.country || null,
      listing_tier: form.listing_tier,
      seo_title: form.seo_title || null,
      seo_description: form.seo_description || null,
    });

    if (res.success && res.data) {
      const { id, slug } = res.data;
      if (form.listing_tier === "free") {
        // Free tier is active immediately, send to dashboard
        router.push("/dashboard/businesses");
        router.refresh();
      } else {
        // Paid tiers go to checkout
        try {
          const checkoutRes = await fetch("/api/checkout/business", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ businessId: id }),
          });
          const checkoutData = await checkoutRes.json();
          if (checkoutData.url) {
            window.location.href = checkoutData.url;
          } else {
            setError(checkoutData.error || "Failed to create checkout session.");
            setLoading(false);
          }
        } catch (err) {
          setError("Failed to redirect to Stripe checkout. Please try again from the dashboard.");
          setLoading(false);
        }
      }
    } else {
      setError(res.error || "Failed to create business listing");
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-150 pb-5">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-zinc-400 mb-1">
            <Link href="/dashboard/businesses" className="hover:text-orange-600">
              Businesses
            </Link>
            <span>/</span>
            <span className="text-zinc-600">New Business</span>
          </div>
          <h1 className="text-2xl font-black text-zinc-900">Create Business Listing</h1>
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

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Column 1: Basic Details */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm shadow-slate-100/5 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-50 pb-2">Basic Information</h2>
            
            <div>
              <label className="block text-sm font-black text-zinc-600 mb-1">Business Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Acme Corporation"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
              />
            </div>

            <div>
              <label className="block text-sm font-black text-zinc-600 mb-1">Description *</label>
              <textarea
                required
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe your business and services (minimum 20 characters)..."
                rows={4}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-black text-zinc-600 mb-1">Industry *</label>
                <input
                  type="text"
                  required
                  value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                  placeholder="e.g. Technology"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
                />
              </div>
              <div>
                <label className="block text-sm font-black text-zinc-600 mb-1">Category *</label>
                <input
                  type="text"
                  required
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="e.g. Software Development"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-black text-zinc-600 mb-1">Logo Image URL</label>
              {/* Hidden file input wired to the shared upload hook */}
              <input
                type="file"
                ref={logoInputRef}
                onChange={handleLogoFileChange}
                accept={ALLOWED_IMAGE_TYPES.join(",")}
                className="hidden"
              />
              <div className="flex gap-2">
                <input
                  type="url"
                  value={form.logo}
                  onChange={(e) => setForm({ ...form, logo: e.target.value })}
                  placeholder="https://example.com/logo.png"
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
                />
                <button
                  type="button"
                  disabled={uploadingLogo}
                  onClick={triggerLogoUpload}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-zinc-700 hover:bg-slate-50 disabled:opacity-50 transition"
                >
                  {uploadingLogo ? "Uploading..." : "Upload"}
                </button>
              </div>
            </div>
          </div>

          {/* Column 2: Contact & Location */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm shadow-slate-100/5 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-50 pb-2">Contact & Location</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-black text-zinc-600 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="info@acme.com"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
                />
              </div>
              <div>
                <label className="block text-sm font-black text-zinc-600 mb-1">Phone</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+1 (555) 123-4567"
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
                placeholder="https://acme.com"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
              />
            </div>

            <div>
              <label className="block text-sm font-black text-zinc-600 mb-1">Street Address</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="123 Main St"
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
                  placeholder="New York"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold outline-none transition focus:border-orange-500 focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-black text-zinc-600 mb-1">State</label>
                <input
                  type="text"
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                  placeholder="NY"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold outline-none transition focus:border-orange-500 focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-black text-zinc-600 mb-1">Country</label>
                <input
                  type="text"
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  placeholder="USA"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold outline-none transition focus:border-orange-500 focus:bg-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Pricing Tiers Selection */}
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm shadow-slate-100/5 space-y-4">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-50 pb-2">Select Listing Tier</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Free Tier */}
            <label
              className={`relative flex flex-col justify-between rounded-xl border-2 p-5 cursor-pointer transition ${
                form.listing_tier === "free" ? "border-orange-500 bg-orange-50/20" : "border-slate-100 bg-white hover:border-slate-200"
              }`}
            >
              <input
                type="radio"
                name="listing_tier"
                value="free"
                checked={form.listing_tier === "free"}
                onChange={() => setForm({ ...form, listing_tier: "free" })}
                className="sr-only"
              />
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-base font-black text-slate-900">Free Tier</span>
                  {form.listing_tier === "free" && <span className="text-orange-500">✓</span>}
                </div>
                <p className="text-xs text-slate-500 font-semibold mb-4">
                  Standard directory listing. Basic promotion.
                </p>
              </div>
              <div className="text-2xl font-black text-slate-900">$0</div>
            </label>

            {/* One-time Payment Tier */}
            <label
              className={`relative flex flex-col justify-between rounded-xl border-2 p-5 cursor-pointer transition ${
                form.listing_tier === "one_time" ? "border-orange-500 bg-orange-50/20" : "border-slate-100 bg-white hover:border-slate-200"
              }`}
            >
              <input
                type="radio"
                name="listing_tier"
                value="one_time"
                checked={form.listing_tier === "one_time"}
                onChange={() => setForm({ ...form, listing_tier: "one_time" })}
                className="sr-only"
              />
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-base font-black text-slate-900">Featured (Lifetime)</span>
                  {form.listing_tier === "one_time" && <span className="text-orange-500">✓</span>}
                </div>
                <p className="text-xs text-slate-500 font-semibold mb-4">
                  One-time payment for permanent active status. Priority directory visibility.
                </p>
              </div>
              <div className="text-2xl font-black text-slate-900">$49</div>
            </label>

            {/* Subscription Tier */}
            <label
              className={`relative flex flex-col justify-between rounded-xl border-2 p-5 cursor-pointer transition ${
                form.listing_tier === "subscription" ? "border-orange-500 bg-orange-50/20" : "border-slate-100 bg-white hover:border-slate-200"
              }`}
            >
              <input
                type="radio"
                name="listing_tier"
                value="subscription"
                checked={form.listing_tier === "subscription"}
                onChange={() => setForm({ ...form, listing_tier: "subscription" })}
                className="sr-only"
              />
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-base font-black text-slate-900">Premium Partner</span>
                  {form.listing_tier === "subscription" && <span className="text-orange-500">✓</span>}
                </div>
                <p className="text-xs text-slate-500 font-semibold mb-4">
                  Monthly premium subscription. Top badge, advanced promotion, and analytics.
                </p>
              </div>
              <div className="text-2xl font-black text-slate-900">
                $19<span className="text-xs text-slate-400 font-bold">/month</span>
              </div>
            </label>
          </div>
        </div>

        {/* SEO (Optional) */}
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm shadow-slate-100/5 space-y-4">
          <h2 className="text-lg font-bold text-slate-900 border-b border-slate-50 pb-2">SEO Configurations (Optional)</h2>
          
          <div>
            <label className="block text-sm font-black text-zinc-600 mb-1">SEO Title</label>
            <input
              type="text"
              value={form.seo_title}
              onChange={(e) => setForm({ ...form, seo_title: e.target.value })}
              placeholder="e.g. Acme Corp | Premium Tech Solutions"
              maxLength={70}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white"
            />
            <p className="text-xs text-slate-400 mt-1">Recommended maximum 70 characters.</p>
          </div>

          <div>
            <label className="block text-sm font-black text-zinc-600 mb-1">SEO Meta Description</label>
            <textarea
              value={form.seo_description}
              onChange={(e) => setForm({ ...form, seo_description: e.target.value })}
              placeholder="Provide a search snippet summarizing your business..."
              rows={2}
              maxLength={180}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white"
            />
            <p className="text-xs text-slate-400 mt-1">Recommended maximum 180 characters.</p>
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
            {loading ? "Saving..." : form.listing_tier === "free" ? "Create Listing" : "Proceed to Checkout"}
          </button>
        </div>
      </form>
    </div>
  );
}
