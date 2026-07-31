"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createProduct } from "@/lib/actions/products";
import { MAX_IMAGES } from "@/lib/products-constants";
import { useImageUpload, ALLOWED_IMAGE_TYPES } from "@/hooks/use-image-upload";

export default function NewProductFormClient({
  ownedBusinesses,
}: {
  ownedBusinesses: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    description: "",
    images: [] as string[],
    price_type: "one_time" as "one_time" | "subscription",
    stripe_price_id: "",
    stock_quantity: "", // empty string = unlimited
    business_id: "",
    seo_title: "",
    seo_description: "",
  });

  const { uploading, fileInputRef, triggerUpload, handleFileChange } = useImageUpload({
    folder: "product-images",
    onSuccess: (url) => setForm((prev) => ({ ...prev, images: [...prev.images, url] })),
    onError: (msg) => setError(msg),
  });

  function removeImage(index: number) {
    setForm((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
  }

  const atImageLimit = form.images.length >= MAX_IMAGES;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await createProduct({
      name: form.name,
      description: form.description,
      images: form.images,
      price_type: form.price_type,
      stripe_price_id: form.stripe_price_id || null,
      stock_quantity: form.stock_quantity === "" ? null : Number(form.stock_quantity),
      business_id: form.business_id || null,
      seo_title: form.seo_title || null,
      seo_description: form.seo_description || null,
    });

    if (res.success && res.data) {
      router.push("/dashboard/products");
      router.refresh();
    } else {
      setError(res.error || "Failed to create product");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-150 pb-5">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-zinc-400 mb-1">
            <Link href="/dashboard/products" className="hover:text-orange-600">
              Products
            </Link>
            <span>/</span>
            <span className="text-zinc-600">New Product</span>
          </div>
          <h1 className="text-2xl font-black text-zinc-900">Create Product</h1>
        </div>
        <Link
          href="/dashboard/products"
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
              <label className="block text-sm font-black text-zinc-600 mb-1">Product Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Aldriva T-Shirt"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
              />
            </div>

            <div>
              <label className="block text-sm font-black text-zinc-600 mb-1">Description *</label>
              <textarea
                required
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe the product (minimum 20 characters)..."
                rows={4}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-black text-zinc-600">Images</label>
                <span className="text-xs font-bold text-zinc-400">
                  {form.images.length}/{MAX_IMAGES}
                </span>
              </div>

              {/* Hidden file input wired to the shared upload hook */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept={ALLOWED_IMAGE_TYPES.join(",")}
                className="hidden"
              />

              {form.images.length > 0 && (
                <div className="mb-3 grid grid-cols-4 gap-2">
                  {form.images.map((url, i) => (
                    <div key={url + i} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200">
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-black text-white opacity-0 transition group-hover:opacity-100"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                disabled={uploading || atImageLimit}
                onClick={triggerUpload}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-zinc-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {uploading ? "Uploading..." : atImageLimit ? `Maximum ${MAX_IMAGES} images reached` : "+ Add Image"}
              </button>
            </div>
          </div>

          {/* Column 2: Pricing & Inventory */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm shadow-slate-100/5 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-50 pb-2">Pricing &amp; Inventory</h2>

            <div>
              <label className="block text-sm font-black text-zinc-600 mb-1">Price Type *</label>
              <div className="grid grid-cols-2 gap-3">
                <label
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 p-3 text-center transition ${
                    form.price_type === "one_time" ? "border-orange-500 bg-orange-50/20" : "border-slate-100 hover:border-slate-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="price_type"
                    value="one_time"
                    checked={form.price_type === "one_time"}
                    onChange={() => setForm({ ...form, price_type: "one_time" })}
                    className="sr-only"
                  />
                  <span className="text-sm font-bold text-slate-900">One-time</span>
                </label>
                <label
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 p-3 text-center transition ${
                    form.price_type === "subscription" ? "border-orange-500 bg-orange-50/20" : "border-slate-100 hover:border-slate-200"
                  }`}
                >
                  <input
                    type="radio"
                    name="price_type"
                    value="subscription"
                    checked={form.price_type === "subscription"}
                    onChange={() => setForm({ ...form, price_type: "subscription" })}
                    className="sr-only"
                  />
                  <span className="text-sm font-bold text-slate-900">Subscription</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-black text-zinc-600 mb-1">Stripe Price ID</label>
              <input
                type="text"
                value={form.stripe_price_id}
                onChange={(e) => setForm({ ...form, stripe_price_id: e.target.value })}
                placeholder="price_..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
              />
              <p className="text-xs text-slate-400 mt-1">Create the Price in Stripe first, then paste its ID here.</p>
            </div>

            <div>
              <label className="block text-sm font-black text-zinc-600 mb-1">Stock Quantity</label>
              <input
                type="number"
                min={0}
                value={form.stock_quantity}
                onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                placeholder="Leave blank for unlimited / digital good"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
              />
            </div>

            {ownedBusinesses.length > 0 && (
              <div>
                <label className="block text-sm font-black text-zinc-600 mb-1">Business (optional)</label>
                <select
                  value={form.business_id}
                  onChange={(e) => setForm({ ...form, business_id: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white"
                >
                  <option value="">No business affiliation</option>
                  {ownedBusinesses.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">Tag this product as sold by one of your businesses.</p>
              </div>
            )}
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
              placeholder="e.g. Aldriva T-Shirt | Support the Cause"
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
              placeholder="Provide a search snippet summarizing this product..."
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
            href="/dashboard/products"
            className="rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-bold text-zinc-700 hover:bg-zinc-50 transition"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-orange-600 px-6 py-2.5 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-50 transition"
          >
            {loading ? "Saving..." : "Create Product"}
          </button>
        </div>
      </form>
    </div>
  );
}
