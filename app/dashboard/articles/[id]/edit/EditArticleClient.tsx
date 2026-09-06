"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, Layers, Wand2, ExternalLink } from "lucide-react";
import RichTextEditor from "@/components/editor/RichTextEditor";
import ImageUploadWithCrop from "@/components/ImageUploadWithCrop";
import ArticleAiAssistantModal from "@/components/articles/ArticleAiAssistantModal";
import ArticleEntityPickerModal, { type AldrivaEntityResult } from "@/components/articles/ArticleEntityPickerModal";
import { updateArticle } from "@/lib/actions/articles";

const ARTICLE_COVER_ASPECT = 16 / 9;

type OrganizerSelect = {
  id: string;
  name: string;
};

type MappedArticle = {
  id: string;
  title: string;
  slug: string;
  body: string;
  excerpt: string | null;
  cover_image_url: string | null;
  categoriesStr: string;
  tagsStr: string;
  visibility: string;
  status: string;
  scheduled_for: string;
  organizer_id: string | null;
  business_id: string | null;
  seo_title: string | null;
  seo_description: string | null;
  canonical_url: string | null;
};

export default function EditArticleClient({
  organizers,
  article,
}: {
  organizers: OrganizerSelect[];
  article: MappedArticle;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isEntityPickerOpen, setIsEntityPickerOpen] = useState(false);

  const [form, setForm] = useState({
    title: article.title,
    excerpt: article.excerpt || "",
    cover_image_url: article.cover_image_url || "",
    categoriesStr: article.categoriesStr,
    tagsStr: article.tagsStr,
    visibility: article.visibility as "public" | "private",
    status: article.status as any,
    scheduled_for: article.scheduled_for,
    organizer_id: article.organizer_id || "",
    seo_title: article.seo_title || "",
    seo_description: article.seo_description || "",
    canonical_url: article.canonical_url || "",
  });

  const [body, setBody] = useState(article.body);

  const handleApplyMetadata = (metadata: {
    suggestedTitle?: string;
    suggestedExcerpt?: string;
    suggestedCategories?: string[];
    suggestedTags?: string[];
    seoTitle?: string;
    seoDescription?: string;
  }) => {
    setForm((prev) => ({
      ...prev,
      title: metadata.suggestedTitle || prev.title,
      excerpt: metadata.suggestedExcerpt || prev.excerpt,
      categoriesStr: metadata.suggestedCategories ? metadata.suggestedCategories.join(", ") : prev.categoriesStr,
      tagsStr: metadata.suggestedTags ? metadata.suggestedTags.join(", ") : prev.tagsStr,
      seo_title: metadata.seoTitle || prev.seo_title,
      seo_description: metadata.seoDescription || prev.seo_description,
    }));
    setIsAiModalOpen(false);
  };

  const handleApplyTextImprovement = (improvedText: string) => {
    setBody((prev) => `${prev}<p>${improvedText.replace(/\n+/g, "</p><p>")}</p>`);
    setIsAiModalOpen(false);
  };

  const handleInsertEntity = (entity: AldrivaEntityResult) => {
    const routePrefix = entity.type === "fundraiser" ? "fundraisers" : entity.type === "event" ? "events" : "org";
    const typeLabel = entity.type === "fundraiser" ? "Campaign" : entity.type === "event" ? "Event" : "Organization";

    const entityHtml = `<div data-entity-type="${entity.type}" data-entity-id="${entity.id}" data-entity-slug="${entity.slug}" data-entity-title="${entity.title.replace(/"/g, '&quot;')}" class="aldriva-entity-card-embed my-6 p-4 rounded-2xl border border-zinc-200 bg-zinc-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
  <div class="flex items-center gap-3">
    <div class="p-2 rounded-xl bg-orange-100 text-orange-600 font-bold text-xs uppercase">${typeLabel}</div>
    <div>
      <h4 class="font-black text-zinc-900 text-sm">${entity.title}</h4>
      <p class="text-xs text-zinc-500 font-semibold">${entity.subtitle || ""}</p>
    </div>
  </div>
  <a href="/${routePrefix}/${entity.slug}" target="_blank" rel="noopener noreferrer" class="text-xs font-black bg-orange-600 text-white px-3.5 py-2 rounded-xl hover:bg-orange-700 transition">View ${typeLabel} →</a>
</div>`;

    setBody((prev) => `${prev}${entityHtml}`);
    setIsEntityPickerOpen(false);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const categories = form.categoriesStr
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    const tags = form.tagsStr
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const res = await updateArticle(article.id, {
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
      business_id: article.business_id || null,
      seo_title: form.seo_title || null,
      seo_description: form.seo_description || null,
      canonical_url: form.canonical_url || null,
    });

    setLoading(false);

    if (res.success) {
      router.push("/dashboard/articles");
      router.refresh();
    } else {
      setError(res.error || "Failed to update article");
    }
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumbs / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-150 pb-5">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-zinc-400 mb-1">
            <Link href="/dashboard/articles" className="hover:text-orange-600">
              Articles
            </Link>
            <span>/</span>
            <span className="text-zinc-600">Edit Article</span>
          </div>
          <h1 className="text-2xl font-black text-zinc-900">Edit Article</h1>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/articles/${article.slug}`}
            target="_blank"
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 shadow-sm"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Preview Page</span>
          </Link>
          <button
            type="button"
            onClick={() => setIsAiModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-purple-50 px-3.5 py-2 text-xs font-black text-violet-800 hover:border-violet-300 transition shadow-sm"
          >
            <Sparkles className="h-3.5 w-3.5 text-violet-600" />
            <span>AI Assistant</span>
          </button>
          <Link
            href="/dashboard/articles"
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
          >
            Cancel
          </Link>
        </div>
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
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="excerpt" className="block text-sm font-black text-zinc-700">
                  Excerpt / Lead Summary
                </label>
                <button
                  type="button"
                  onClick={() => setIsAiModalOpen(true)}
                  className="text-xs font-bold text-violet-700 hover:underline flex items-center gap-1"
                >
                  <Wand2 className="h-3 w-3" /> Auto-summarize
                </button>
              </div>
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
            <div className="flex items-center justify-between">
              <label className="block text-sm font-black text-zinc-700">
                Article Content *
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEntityPickerOpen(true)}
                  className="flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-black text-orange-700 hover:bg-orange-100 transition"
                >
                  <Layers className="h-3.5 w-3.5" /> Reference Entity
                </button>
                <button
                  type="button"
                  onClick={() => setIsAiModalOpen(true)}
                  className="flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-black text-violet-700 hover:bg-violet-100 transition"
                >
                  <Sparkles className="h-3.5 w-3.5" /> AI Assist
                </button>
              </div>
            </div>

            <RichTextEditor
              value={body}
              onChange={setBody}
              accent="orange"
              placeholder="Write your article story here..."
              onTriggerAi={() => setIsAiModalOpen(true)}
              onTriggerEntityPicker={() => setIsEntityPickerOpen(true)}
            />
          </div>

          {/* SEO Metadata Card */}
          <div className="rounded-2xl border border-zinc-150 bg-white p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="text-sm font-black uppercase tracking-wider text-zinc-400">
                SEO settings (Optional)
              </h3>
              <button
                type="button"
                onClick={() => setIsAiModalOpen(true)}
                className="text-xs font-bold text-violet-700 hover:underline flex items-center gap-1"
              >
                <Sparkles className="h-3 w-3" /> Suggest SEO
              </button>
            </div>
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
          {/* Action Buttons Box */}
          <div className="rounded-2xl border border-zinc-150 bg-white p-6 space-y-3 shadow-sm">
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-400 border-b border-zinc-100 pb-3">
              Save Changes
            </h3>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-orange-600 py-3 text-center text-sm font-black text-white hover:bg-orange-700 transition disabled:opacity-50 shadow-md"
            >
              {loading ? "Updating..." : "Save & Update Article"}
            </button>
          </div>

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
                <option value="published">Published</option>
                <option value="scheduled">Scheduled</option>
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

            <ImageUploadWithCrop
              value={form.cover_image_url}
              aspectRatio={ARTICLE_COVER_ASPECT}
              previewClassName="h-32 w-full rounded-xl"
              label="Upload cover image"
              bucket="fundraiser-media"
              folder="article-covers"
              onUploaded={(url) => setForm((prev) => ({ ...prev, cover_image_url: url }))}
              onRemove={() => setForm((prev) => ({ ...prev, cover_image_url: "" }))}
              onError={(msg) => setError(msg)}
            />
          </div>
        </div>
      </form>

      {/* AI Assistant Modal */}
      <ArticleAiAssistantModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        currentTitle={form.title}
        currentExcerpt={form.excerpt}
        currentBody={body}
        onApplyMetadata={handleApplyMetadata}
        onApplyTextImprovement={handleApplyTextImprovement}
      />

      {/* Entity Picker Modal */}
      <ArticleEntityPickerModal
        isOpen={isEntityPickerOpen}
        onClose={() => setIsEntityPickerOpen(false)}
        onSelectEntity={handleInsertEntity}
      />
    </div>
  );
}
