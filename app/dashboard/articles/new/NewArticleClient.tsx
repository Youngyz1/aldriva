"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import RichTextEditor from "@/components/editor/RichTextEditor";
import { createArticle } from "@/lib/actions/articles";
import { useImageUpload, ALLOWED_IMAGE_TYPES } from "@/hooks/use-image-upload";

type OrganizerSelect = {
  id: string;
  name: string;
};

export default function NewArticleClient({
  organizers,
}: {
  organizers: OrganizerSelect[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    title: "",
    excerpt: "",
    cover_image_url: "",
    categoriesStr: "",
    tagsStr: "",
    visibility: "public" as "public" | "private",
    status: "draft" as "draft" | "published" | "scheduled" | "archived" | "expired" | "rejected",
    scheduled_for: "",
    organizer_id: "",
    seo_title: "",
    seo_description: "",
    canonical_url: "",
  });

  const [body, setBody] = useState("");

  const { uploading: uploadingCover, fileInputRef: coverInputRef, triggerUpload: triggerCoverUpload, handleFileChange: handleCoverFileChange } = useImageUpload({
    folder: "article-covers",
    onSuccess: (url) => setForm((prev) => ({ ...prev, cover_image_url: url })),
    onError: (msg) => setError(msg),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Parse categories and tags
    const categories = form.categoriesStr
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    const tags = form.tagsStr
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    // Call server action
    const res = await createArticle({
      title: form.title,
      body,
      excerpt: form.excerpt || null,
      cover_image_url: form.cover_image_url || null,
      categories,
      tags,
      visibility: form.visibility,
      status: form.status,
      scheduled_for: form.status === "scheduled" && form.scheduled_for ? new Date(form.scheduled_for).toISOString() : null,
      organizer_id: form.organizer_id || null,
      seo_title: form.seo_title || null,
      seo_description: form.seo_description || null,
      canonical_url: form.canonical_url || null,
    });

    setLoading(false);

    if (res.success) {
      router.push("/dashboard/articles");
      router.refresh();
    } else {
      setError(res.error || "Failed to create article");
    }
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumbs / Header */}
      <div className="flex items-center justify-between border-b border-zinc-150 pb-5">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-zinc-400 mb-1">
            <Link href="/dashboard/articles" className="hover:text-orange-600">
              Articles
            </Link>
            <span>/</span>
            <span className="text-zinc-600">New Article</span>
          </div>
          <h1 className="text-2xl font-black text-zinc-900">Create New Article</h1>
        </div>
        <Link
          href="/dashboard/articles"
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

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-3">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Title */}
          <div className="rounded-2xl border border-zinc-150 bg-white p-6 space-y-4 shadow-sm">
            <div>
              <label htmlFor="title" className="block text-sm font-black text-zinc-700 mb-1.5">
                Article Title *
              </label>
              <input
                type="text"
                id="title"
                required
                placeholder="e.g. 5 Ways to Optimize Your Fundraising Page"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 transition"
              />
            </div>

            {/* Excerpt */}
            <div>
              <label htmlFor="excerpt" className="block text-sm font-black text-zinc-700 mb-1.5">
                Excerpt
              </label>
              <textarea
                id="excerpt"
                rows={3}
                placeholder="Provide a short summary of this article (maximum 320 characters)"
                value={form.excerpt}
                onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 transition"
              />
            </div>
          </div>

          {/* Body Content / Editor */}
          <div className="rounded-2xl border border-zinc-150 bg-white p-6 space-y-4 shadow-sm">
            <label className="block text-sm font-black text-zinc-700">
              Article Content *
            </label>
            <RichTextEditor
              value={body}
              onChange={setBody}
              accent="orange"
              placeholder="Write your article story here..."
            />
          </div>

          {/* SEO Metadata Card */}
          <div className="rounded-2xl border border-zinc-150 bg-white p-6 space-y-4 shadow-sm">
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-400 border-b border-zinc-100 pb-3">
              SEO settings (Optional)
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="seo_title" className="block text-sm font-bold text-zinc-700 mb-1">
                  SEO Title
                </label>
                <input
                  type="text"
                  id="seo_title"
                  placeholder="Custom SEO Title (defaults to title)"
                  value={form.seo_title}
                  onChange={(e) => setForm({ ...form, seo_title: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 transition"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="seo_description" className="block text-sm font-bold text-zinc-700 mb-1">
                  SEO Description
                </label>
                <textarea
                  id="seo_description"
                  rows={2}
                  placeholder="Custom search snippet description"
                  value={form.seo_description}
                  onChange={(e) => setForm({ ...form, seo_description: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 transition"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="canonical_url" className="block text-sm font-bold text-zinc-700 mb-1">
                  Canonical URL
                </label>
                <input
                  type="url"
                  id="canonical_url"
                  placeholder="https://example.com/original-article"
                  value={form.canonical_url}
                  onChange={(e) => setForm({ ...form, canonical_url: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 transition"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Settings Area */}
        <div className="lg:col-span-1 space-y-6">
          {/* Publishing settings */}
          <div className="rounded-2xl border border-zinc-150 bg-white p-6 space-y-4 shadow-sm">
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-400 border-b border-zinc-100 pb-3">
              Publishing
            </h3>

            {/* Status */}
            <div>
              <label htmlFor="status" className="block text-sm font-bold text-zinc-700 mb-1">
                Status
              </label>
              <select
                id="status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold outline-none focus:border-orange-500 focus:bg-white transition"
              >
                <option value="draft">Draft</option>
                <option value="published">Publish Immediately</option>
                <option value="scheduled">Schedule</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            {/* Scheduled Date */}
            {form.status === "scheduled" && (
              <div>
                <label htmlFor="scheduled_for" className="block text-sm font-bold text-zinc-700 mb-1">
                  Schedule Date &amp; Time
                </label>
                <input
                  type="datetime-local"
                  id="scheduled_for"
                  required
                  value={form.scheduled_for}
                  onChange={(e) => setForm({ ...form, scheduled_for: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold outline-none focus:border-orange-500 focus:bg-white transition"
                />
              </div>
            )}

            {/* Visibility */}
            <div>
              <label htmlFor="visibility" className="block text-sm font-bold text-zinc-700 mb-1">
                Visibility
              </label>
              <select
                id="visibility"
                value={form.visibility}
                onChange={(e) => setForm({ ...form, visibility: e.target.value as any })}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold outline-none focus:border-orange-500 focus:bg-white transition"
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>

            {/* Publisher Profile (Organizer) */}
            {organizers.length > 0 && (
              <div>
                <label htmlFor="organizer_id" className="block text-sm font-bold text-zinc-700 mb-1">
                  Publisher Profile
                </label>
                <select
                  id="organizer_id"
                  value={form.organizer_id}
                  onChange={(e) => setForm({ ...form, organizer_id: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold outline-none focus:border-orange-500 focus:bg-white transition"
                >
                  <option value="">Personal Profile</option>
                  {organizers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Categorisation settings */}
          <div className="rounded-2xl border border-zinc-150 bg-white p-6 space-y-4 shadow-sm">
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-400 border-b border-zinc-100 pb-3">
              Categorisation
            </h3>

            {/* Categories */}
            <div>
              <label htmlFor="categories" className="block text-sm font-bold text-zinc-700 mb-1">
                Categories
              </label>
              <input
                type="text"
                id="categories"
                placeholder="e.g. Fundraising, Events (comma separated)"
                value={form.categoriesStr}
                onChange={(e) => setForm({ ...form, categoriesStr: e.target.value })}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold outline-none focus:border-orange-500 focus:bg-white transition"
              />
            </div>

            {/* Tags */}
            <div>
              <label htmlFor="tags" className="block text-sm font-bold text-zinc-700 mb-1">
                Tags
              </label>
              <input
                type="text"
                id="tags"
                placeholder="e.g. charity, tutorial, tips (comma separated)"
                value={form.tagsStr}
                onChange={(e) => setForm({ ...form, tagsStr: e.target.value })}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold outline-none focus:border-orange-500 focus:bg-white transition"
              />
            </div>
          </div>

          {/* Cover image setting */}
          <div className="rounded-2xl border border-zinc-150 bg-white p-6 space-y-4 shadow-sm">
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-400 border-b border-zinc-100 pb-3">
              Cover Image
            </h3>

            <div>
              <label htmlFor="cover_image_url" className="block text-sm font-bold text-zinc-700 mb-1">
                Image URL
              </label>
              {/* Hidden file input wired to the shared upload hook */}
              <input
                type="file"
                ref={coverInputRef}
                onChange={handleCoverFileChange}
                accept={ALLOWED_IMAGE_TYPES.join(",")}
                className="hidden"
              />
              <div className="flex gap-2">
                <input
                  type="url"
                  id="cover_image_url"
                  placeholder="https://unsplash.com/photos/..."
                  value={form.cover_image_url}
                  onChange={(e) => setForm({ ...form, cover_image_url: e.target.value })}
                  className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold outline-none focus:border-orange-500 focus:bg-white transition"
                />
                <button
                  type="button"
                  disabled={uploadingCover}
                  onClick={triggerCoverUpload}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition"
                >
                  {uploadingCover ? "Uploading..." : "Upload"}
                </button>
              </div>
            </div>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-orange-600 py-3 text-center text-sm font-black text-white hover:bg-orange-700 transition disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Article"}
          </button>
        </div>
      </form>
    </div>
  );
}
