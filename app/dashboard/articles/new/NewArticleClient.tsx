"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, Layers, Wand2 } from "lucide-react";
import RichTextEditor from "@/components/editor/RichTextEditor";
import ImageUploadWithCrop from "@/components/ImageUploadWithCrop";
import ArticleTemplateSelector from "@/components/articles/ArticleTemplateSelector";
import ArticleAiAssistantModal from "@/components/articles/ArticleAiAssistantModal";
import ArticleEntityPickerModal, { type AldrivaEntityResult } from "@/components/articles/ArticleEntityPickerModal";
import { type ArticleTemplate } from "@/lib/article-templates";
import { createArticle } from "@/lib/actions/articles";

const ARTICLE_COVER_ASPECT = 16 / 9;

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

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isEntityPickerOpen, setIsEntityPickerOpen] = useState(false);

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

  const handleSelectBlank = () => {
    setSelectedTemplateId(null);
  };

  const handleSelectTemplate = (template: ArticleTemplate) => {
    setSelectedTemplateId(template.id);
    setForm((prev) => ({
      ...prev,
      title: prev.title || template.defaultTitle,
      excerpt: prev.excerpt || template.defaultExcerpt,
      categoriesStr: prev.categoriesStr || template.defaultCategories.join(", "),
      tagsStr: prev.tagsStr || template.defaultTags.join(", "),
    }));
    setBody(template.defaultBodyHtml);
  };

  const handleApplyAiDraft = (draft: {
    title: string;
    excerpt: string;
    bodyHtml: string;
    categories: string[];
    tags: string[];
    seoTitle?: string;
    seoDescription?: string;
  }) => {
    setForm((prev) => ({
      ...prev,
      title: draft.title,
      excerpt: draft.excerpt,
      categoriesStr: draft.categories.join(", "),
      tagsStr: draft.tags.join(", "),
      seo_title: draft.seoTitle || prev.seo_title,
      seo_description: draft.seoDescription || prev.seo_description,
    }));
    setBody(draft.bodyHtml);
    setIsAiModalOpen(false);
  };

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

  async function submitWithStatus(
    targetStatus: "draft" | "published" | "scheduled" | "archived" | "expired" | "rejected"
  ) {
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

    const res = await createArticle({
      title: form.title,
      body,
      excerpt: form.excerpt || null,
      cover_image_url: form.cover_image_url || null,
      categories,
      tags,
      visibility: form.visibility,
      status: targetStatus,
      scheduled_for: targetStatus === "scheduled" && form.scheduled_for ? new Date(form.scheduled_for).toISOString() : null,
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-150 pb-5">
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

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsAiModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-purple-50 px-4 py-2.5 text-xs font-black text-violet-800 hover:border-violet-300 transition shadow-sm"
          >
            <Sparkles className="h-4 w-4 text-violet-600" />
            <span>AI Assistant</span>
          </button>
          <Link
            href="/dashboard/articles"
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
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

      {/* Creation Mode & Templates */}
      <div className="rounded-3xl border border-zinc-150 bg-white p-6 shadow-sm">
        <ArticleTemplateSelector
          onSelectBlank={handleSelectBlank}
          onSelectAiAssist={() => setIsAiModalOpen(true)}
          onSelectTemplate={handleSelectTemplate}
          selectedTemplateId={selectedTemplateId}
        />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); submitWithStatus(form.status); }} className="grid gap-6 lg:grid-cols-3">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Title & Excerpt */}
          <div className="rounded-2xl border border-zinc-150 bg-white p-6 space-y-4 shadow-sm">
            <div>
              <label htmlFor="title" className="block text-sm font-black text-zinc-700 mb-1.5">
                Article Title *
              </label>
              <input
                type="text"
                id="title"
                required
                placeholder="e.g. 5 Ways Our Community Exceeded Its Fundraising Goal"
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
                Article Body Content *
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
                SEO &amp; Search Optimization (Optional)
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
              Actions
            </h3>
            <button
              type="button"
              disabled={loading}
              onClick={() => submitWithStatus("published")}
              className="w-full rounded-xl bg-orange-600 py-3 text-center text-sm font-black text-white hover:bg-orange-700 transition disabled:opacity-50 shadow-md"
            >
              {loading ? "Submitting..." : "Submit for Publication"}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => submitWithStatus("draft")}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 text-center text-sm font-bold text-zinc-700 hover:bg-zinc-100 transition disabled:opacity-50"
            >
              Save as Draft
            </button>
          </div>

          {/* Publishing settings */}
          <div className="rounded-2xl border border-zinc-150 bg-white p-6 space-y-4 shadow-sm">
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-400 border-b border-zinc-100 pb-3">
              Publishing Settings
            </h3>

            {/* Status */}
            <div>
              <label htmlFor="status" className="block text-sm font-bold text-zinc-700 mb-1">
                Lifecycle Status
              </label>
              <select
                id="status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as any })}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold outline-none focus:border-orange-500 focus:bg-white transition"
              >
                <option value="draft">Draft</option>
                <option value="published">Publish (Pending Approval)</option>
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
              Categories &amp; Tags
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
        onApplyDraft={handleApplyAiDraft}
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
