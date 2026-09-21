"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, ArrowRight, Loader2 } from "lucide-react";
import { createTenantWebsite, createPage } from "@/lib/actions/website";
import { savePageDraft } from "@/lib/actions/website-builder";
import { getTemplateById } from "@/lib/website-templates";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TemplateGallery } from "@/components/dashboard/website/TemplateGallery";
import type { WebsiteTemplateCategory } from "@/lib/website-templates";

export default function NewWebsiteClient({ orgId, orgName }: { orgId: string; orgName: string }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [siteTitle, setSiteTitle] = useState(orgName);
  const [slug, setSlug] = useState("");
  const [websiteType, setWebsiteType] = useState<WebsiteTemplateCategory>("business");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slugify = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);

  const handleCreate = async (withTemplate: boolean) => {
    if (!siteTitle.trim()) {
      setError("Site title is required");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const finalSlug = slug ? slugify(slug) : undefined;
      const res = await createTenantWebsite(orgId, { site_title: siteTitle.trim(), slug: finalSlug, status: "draft" });
      if (!res.success || !res.data) {
        setError(res.error || "Failed to create website");
        return;
      }
      const websiteId = (res.data as { id: string }).id;
      // create home page
      const pageRes = await createPage(websiteId, { title: "Home", slug: "home", is_home: true, status: "draft" });
      if (!pageRes.success || !pageRes.data) {
        // website created but page failed — proceed to overview
        router.push(`/dashboard/org/${orgId}/website`);
        return;
      }
      const pageId = (pageRes.data as { id: string }).id;

      if (withTemplate && selectedTemplate) {
        const tpl = getTemplateById(selectedTemplate);
        if (tpl) {
          await savePageDraft(pageId, tpl.defaultBlocks as unknown as never);
        }
      }

      router.push(`/dashboard/org/${orgId}/website/builder?pageId=${pageId}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message || "Unexpected error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Step indicator — Setup → Template → Customize */}
      <div className="flex items-center gap-2 text-xs font-semibold">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${step === 1 ? "bg-primary text-primary-foreground" : "bg-primary text-primary-foreground"}`}>1</span>
        <span className={step === 1 ? "text-zinc-900" : "text-muted-foreground"}>Setup</span>
        <span className="text-zinc-300">→</span>
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${step === 2 ? "bg-primary text-primary-foreground" : "bg-zinc-200 text-zinc-600"}`}>2</span>
        <span className={step === 2 ? "text-zinc-900" : "text-muted-foreground"}>Template</span>
        <span className="text-zinc-300">→</span>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-200 text-zinc-500 text-xs">3</span>
        <span className="text-muted-foreground">Customize</span>
      </div>

      <PageHeader
        eyebrow="Create Website"
        title={step === 1 ? "Website Setup" : "Choose a Template"}
        description={step === 1 ? "Tell us about your website — only the essentials. You can change everything later." : "Pick a starting point. Every section is editable in the builder."}
      />

      {error && <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      {step === 1 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-xs space-y-5">
          <div>
            <span className="mb-1.5 block text-xs font-semibold text-zinc-700">Website / Business Name *</span>
            <Input value={siteTitle} onChange={(e) => setSiteTitle(e.target.value)} placeholder="e.g. Acme Studio" />
            <span className="mt-1 block text-xs text-muted-foreground">Prefilled from your organization — editable.</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-zinc-700">Website URL Slug</span>
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={slugify(siteTitle) || "acme-studio"} />
              <span className="mt-1 block text-xs text-muted-foreground">Letters, numbers and dashes. Leave blank to auto-generate.</span>
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-zinc-700">Website Type</span>
              <Select value={websiteType} onChange={(e) => setWebsiteType(e.target.value as WebsiteTemplateCategory)}>
                <option value="business">General Business</option>
                <option value="restaurant">Restaurant</option>
                <option value="retail">Retail / Store</option>
                <option value="service">Service</option>
                <option value="professional">Professional</option>
                <option value="creative">Creative / Portfolio</option>
                <option value="organization">Organization / Nonprofit</option>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between pt-2">
            <Button
              variant="outline"
              onClick={() => handleCreate(false)}
              disabled={creating}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
              Skip templates — start blank
            </Button>
            <Button onClick={() => setStep(2)} disabled={!siteTitle.trim()}>
              Continue to templates <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-900 truncate">{siteTitle}</p>
              <p className="text-xs text-muted-foreground truncate">/{slug ? slugify(slug) : slugify(siteTitle)} · {websiteType}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setStep(1)}>
              Back
            </Button>
          </div>
          <TemplateGallery selectedId={selectedTemplate} onSelect={setSelectedTemplate} onUse={() => handleCreate(true)} using={creating} />
          <div className="flex justify-center">
            <Button variant="ghost" onClick={() => handleCreate(false)} disabled={creating}>
              Or start blank
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
