"use client";

import React, { useState } from "react";
import { sanitizeArticleHtml } from "@/lib/sanitize-html";
import {
  Sparkles,
  Bot,
  Wand2,
  Tag,
  Share2,
  Copy,
  Check,
  Loader2,
  X,
  AlertCircle,
} from "lucide-react";

interface ArticleAiAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTitle: string;
  currentExcerpt: string;
  currentBody: string;
  onApplyDraft?: (draft: {
    title: string;
    excerpt: string;
    bodyHtml: string;
    categories: string[];
    tags: string[];
    seoTitle?: string;
    seoDescription?: string;
  }) => void;
  onApplyMetadata?: (metadata: {
    suggestedTitle?: string;
    suggestedExcerpt?: string;
    suggestedCategories?: string[];
    suggestedTags?: string[];
    seoTitle?: string;
    seoDescription?: string;
  }) => void;
  onApplyTextImprovement?: (improvedText: string) => void;
}

export default function ArticleAiAssistantModal({
  isOpen,
  onClose,
  currentTitle,
  currentExcerpt,
  currentBody,
  onApplyDraft,
  onApplyMetadata,
  onApplyTextImprovement,
}: ArticleAiAssistantModalProps) {
  const [activeTab, setActiveTab] = useState<"draft" | "writing" | "metadata" | "social">("draft");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // Tab 1: Draft state
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [tone, setTone] = useState("Inspiring & Engaging");
  const [audience, setAudience] = useState("Supporters & Community Readers");
  const [keyPoints, setKeyPoints] = useState("");
  const [generatedDraft, setGeneratedDraft] = useState<any>(null);

  // Tab 2: Writing improvement state
  const [writingAction, setWritingAction] = useState("improve_clarity");
  const [writingText, setWritingText] = useState("");
  const [writingResult, setWritingResult] = useState("");

  // Tab 3: Metadata state
  const [generatedMetadata, setGeneratedMetadata] = useState<any>(null);

  // Tab 4: Social state
  const [socialPlatform, setSocialPlatform] = useState<"twitter" | "linkedin" | "general">("twitter");
  const [socialResult, setSocialResult] = useState("");

  if (!isOpen) return null;

  async function handleGenerateDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;

    setLoading(true);
    setError("");
    setGeneratedDraft(null);

    try {
      const res = await fetch("/api/articles/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "generate_draft",
          topic,
          goal,
          tone,
          audience,
          keyPoints,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate draft");
      setGeneratedDraft(data.draft);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "AI drafting failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleImproveWriting() {
    const textToProcess = writingText.trim() || currentBody.replace(/<[^>]*>/g, " ").trim();
    if (!textToProcess) {
      setError("Please provide text to improve.");
      return;
    }

    setLoading(true);
    setError("");
    setWritingResult("");

    try {
      const res = await fetch("/api/articles/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "improve_writing",
          text: textToProcess.slice(0, 3000),
          action: writingAction,
          tone,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to process text");
      setWritingResult(data.result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Writing improvement failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSuggestMetadata() {
    setLoading(true);
    setError("");
    setGeneratedMetadata(null);

    try {
      const res = await fetch("/api/articles/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "suggest_metadata",
          title: currentTitle,
          excerpt: currentExcerpt,
          bodyHtml: currentBody,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate metadata suggestions");
      setGeneratedMetadata(data.metadata);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Metadata generation failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateSocial() {
    setLoading(true);
    setError("");
    setSocialResult("");

    try {
      const res = await fetch("/api/articles/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "generate_social",
          title: currentTitle,
          excerpt: currentExcerpt,
          bodyHtml: currentBody,
          platform: socialPlatform,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate social copy");
      setSocialResult(data.socialText);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Social post generation failed");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-3xl bg-white shadow-2xl border border-zinc-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-150 bg-zinc-50/80 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-600 text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-zinc-900">Aldriva AI Writing Assistant</h2>
              <p className="text-xs font-semibold text-zinc-500">
                Editorial drafting, content enhancement, SEO suggestions, and social copy.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-150 bg-white px-6">
          <button
            type="button"
            onClick={() => {
              setActiveTab("draft");
              setError("");
            }}
            className={`flex items-center gap-2 border-b-2 py-3 px-3 text-xs font-black transition ${
              activeTab === "draft"
                ? "border-orange-600 text-orange-600"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            <Bot className="h-4 w-4" /> Generate Draft
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("writing");
              setError("");
            }}
            className={`flex items-center gap-2 border-b-2 py-3 px-3 text-xs font-black transition ${
              activeTab === "writing"
                ? "border-orange-600 text-orange-600"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            <Wand2 className="h-4 w-4" /> Refine &amp; Polish
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("metadata");
              setError("");
              if (!generatedMetadata && (currentTitle || currentBody)) {
                handleSuggestMetadata();
              }
            }}
            className={`flex items-center gap-2 border-b-2 py-3 px-3 text-xs font-black transition ${
              activeTab === "metadata"
                ? "border-orange-600 text-orange-600"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            <Tag className="h-4 w-4" /> SEO &amp; Tags
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("social");
              setError("");
            }}
            className={`flex items-center gap-2 border-b-2 py-3 px-3 text-xs font-black transition ${
              activeTab === "social"
                ? "border-orange-600 text-orange-600"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            <Share2 className="h-4 w-4" /> Social Snippet
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs font-bold text-red-800">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* TAB 1: GENERATE DRAFT */}
          {activeTab === "draft" && (
            <div className="space-y-4">
              <form onSubmit={handleGenerateDraft} className="space-y-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-zinc-600 mb-1">
                    Topic or Core Subject *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. How our community came together to build an accessible playground"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500 focus:bg-white"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-zinc-600 mb-1">
                      Editorial Tone
                    </label>
                    <select
                      value={tone}
                      onChange={(e) => setTone(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-bold outline-none focus:border-orange-500"
                    >
                      <option>Inspiring &amp; Engaging</option>
                      <option>Informative &amp; Educational</option>
                      <option>Urgent &amp; Compelling</option>
                      <option>Professional &amp; Structured</option>
                      <option>Heartfelt &amp; Personal</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-zinc-600 mb-1">
                      Target Audience
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Local supporters, donors"
                      value={audience}
                      onChange={(e) => setAudience(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-bold outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-zinc-600 mb-1">
                    Key Points &amp; Highlights (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="List key facts, milestones, or people to highlight (bulleted or comma-separated)"
                    value={keyPoints}
                    onChange={(e) => setKeyPoints(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium outline-none focus:border-orange-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !topic.trim()}
                  className="flex items-center justify-center gap-2 w-full rounded-xl bg-orange-600 py-3 text-sm font-black text-white hover:bg-orange-700 transition disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Generating Draft...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" /> Generate Starter Draft
                    </>
                  )}
                </button>
              </form>

              {generatedDraft && (
                <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50/40 p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-orange-200/60 pb-3">
                    <span className="text-xs font-black uppercase tracking-wider text-orange-700">
                      Generated Draft Preview
                    </span>
                    <button
                      type="button"
                      onClick={() => onApplyDraft && onApplyDraft(generatedDraft)}
                      className="rounded-xl bg-orange-600 px-4 py-1.5 text-xs font-black text-white hover:bg-orange-700 transition"
                    >
                      Insert into Editor
                    </button>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-500">Title</p>
                    <p className="text-sm font-black text-zinc-900">{generatedDraft.title}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-500">Excerpt</p>
                    <p className="text-xs font-semibold text-zinc-700">{generatedDraft.excerpt}</p>
                  </div>
                  <div className="rounded-xl bg-white p-4 border border-zinc-200 max-h-48 overflow-y-auto text-xs text-zinc-700 space-y-2">
                    {/* SECURITY (P0 F-02): AI output is untrusted markup (prompt-injection
                        can smuggle executable HTML into generated drafts) — sanitize
                        before rendering, same profile as stored article bodies. */}
                    <div dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(generatedDraft.bodyHtml) }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: WRITING TOOLS */}
          {activeTab === "writing" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-zinc-600 mb-1">
                  Choose Improvement Action
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { id: "improve_clarity", label: "Improve Clarity" },
                    { id: "fix_grammar", label: "Fix Grammar" },
                    { id: "shorten", label: "Make Concise" },
                    { id: "expand", label: "Expand & Elaborate" },
                    { id: "bullet_points", label: "Convert to Bullets" },
                    { id: "write_intro", label: "Engaging Intro" },
                    { id: "write_conclusion", label: "Strong Conclusion" },
                    { id: "change_tone", label: "Change Tone" },
                  ].map((act) => (
                    <button
                      key={act.id}
                      type="button"
                      onClick={() => setWritingAction(act.id)}
                      className={`rounded-xl border py-2 px-3 text-xs font-bold transition text-center ${
                        writingAction === act.id
                          ? "border-orange-500 bg-orange-50 text-orange-700 ring-1 ring-orange-500"
                          : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-white"
                      }`}
                    >
                      {act.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-zinc-600 mb-1">
                  Text to Enhance (Leave empty to use article body)
                </label>
                <textarea
                  rows={4}
                  placeholder="Paste specific paragraph or text selection to polish..."
                  value={writingText}
                  onChange={(e) => setWritingText(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs font-medium outline-none focus:border-orange-500"
                />
              </div>

              <button
                type="button"
                onClick={handleImproveWriting}
                disabled={loading}
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-orange-600 py-3 text-sm font-black text-white hover:bg-orange-700 transition disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Polishing Text...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" /> Run Enhancement
                  </>
                )}
              </button>

              {writingResult && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2.5">
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-800">
                      Enhanced Result
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopy(writingResult)}
                        className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
                      >
                        {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                        {copied ? "Copied" : "Copy"}
                      </button>
                      {onApplyTextImprovement && (
                        <button
                          type="button"
                          onClick={() => onApplyTextImprovement(writingResult)}
                          className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-black text-white hover:bg-emerald-700"
                        >
                          Apply
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white p-3.5 border border-zinc-200 text-xs text-zinc-800 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
                    {writingResult}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SEO & METADATA */}
          {activeTab === "metadata" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-zinc-500">
                  Analyze article content to automatically suggest catchy titles, excerpts, categories, and SEO tags.
                </p>
                <button
                  type="button"
                  onClick={handleSuggestMetadata}
                  disabled={loading}
                  className="rounded-xl bg-orange-600 px-4 py-2 text-xs font-black text-white hover:bg-orange-700 transition disabled:opacity-50 shrink-0"
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Re-Analyze Content"}
                </button>
              </div>

              {generatedMetadata && (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50/50 p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
                    <span className="text-xs font-black uppercase tracking-wider text-zinc-700">
                      Suggested Metadata
                    </span>
                    {onApplyMetadata && (
                      <button
                        type="button"
                        onClick={() => onApplyMetadata(generatedMetadata)}
                        className="rounded-xl bg-orange-600 px-3.5 py-1.5 text-xs font-black text-white hover:bg-orange-700 transition"
                      >
                        Apply to Article Form
                      </button>
                    )}
                  </div>

                  <div>
                    <span className="text-[11px] font-bold text-zinc-500 uppercase">Suggested Title</span>
                    <p className="text-sm font-black text-zinc-900">{generatedMetadata.suggestedTitle}</p>
                  </div>

                  <div>
                    <span className="text-[11px] font-bold text-zinc-500 uppercase">Suggested Excerpt</span>
                    <p className="text-xs font-semibold text-zinc-700">{generatedMetadata.suggestedExcerpt}</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <span className="text-[11px] font-bold text-zinc-500 uppercase">Categories</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(generatedMetadata.suggestedCategories || []).map((c: string) => (
                          <span key={c} className="rounded-md bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-800">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-zinc-500 uppercase">Tags</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(generatedMetadata.suggestedTags || []).map((t: string) => (
                          <span key={t} className="rounded-md bg-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                            #{t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 border-t border-zinc-200 pt-3">
                    <div>
                      <span className="text-[11px] font-bold text-zinc-500 uppercase">SEO Title</span>
                      <p className="text-xs font-bold text-zinc-800">{generatedMetadata.seoTitle}</p>
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-zinc-500 uppercase">SEO Description</span>
                      <p className="text-xs text-zinc-600">{generatedMetadata.seoDescription}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SOCIAL SNIPPET */}
          {activeTab === "social" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {(["twitter", "linkedin", "general"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSocialPlatform(p)}
                    className={`rounded-xl border px-3.5 py-1.5 text-xs font-bold capitalize transition ${
                      socialPlatform === p
                        ? "border-orange-500 bg-orange-50 text-orange-700 ring-1 ring-orange-500"
                        : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-white"
                    }`}
                  >
                    {p === "twitter" ? "X / Twitter" : p === "linkedin" ? "LinkedIn" : "General Share"}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleGenerateSocial}
                disabled={loading}
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-orange-600 py-3 text-sm font-black text-white hover:bg-orange-700 transition disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Generating Social Copy...
                  </>
                ) : (
                  <>
                    <Share2 className="h-4 w-4" /> Generate {socialPlatform === "twitter" ? "X / Twitter Post" : "Share Post"}
                  </>
                )}
              </button>

              {socialResult && (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-200 pb-2.5">
                    <span className="text-xs font-black uppercase tracking-wider text-zinc-700">
                      Ready-to-Post Copy
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(socialResult)}
                      className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Copied to clipboard!" : "Copy Post"}
                    </button>
                  </div>
                  <textarea
                    rows={5}
                    value={socialResult}
                    onChange={(e) => setSocialResult(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white p-3.5 text-xs text-zinc-800 outline-none focus:border-orange-500 font-sans"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
