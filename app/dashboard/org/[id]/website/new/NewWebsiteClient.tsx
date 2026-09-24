"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Globe, ArrowRight, Loader2 } from "lucide-react";
import { createTenantWebsite, createPage } from "@/lib/actions/website";
import { instantiateWebsiteFromTemplate } from "@/lib/actions/website-instantiation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TemplateGallery } from "@/components/dashboard/website/TemplateGallery";
import { supabase } from "@/lib/supabase";
import { normalizeWebsiteCategory, type WebsiteCategory } from "@/lib/website-category";

export default function NewWebsiteClient({ orgId, orgName }: { orgId: string; orgName: string }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [siteTitle, setSiteTitle] = useState(orgName);
  const [slug, setSlug] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [businesses, setBusinesses] = useState<Array<{ id: string; name: string; industry: string; category: string; business_type: string | null; logo: string | null }>>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [loadingBusinesses, setLoadingBusinesses] = useState(true);

  useEffect(() => {
    async function loadBusinesses() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoadingBusinesses(false); return; }
        const { data } = await supabase.from("businesses").select("id,name,industry,category,business_type,logo").eq("owner_id", user.id).order("created_at", { ascending: false }).limit(50);
        if (data) {
          setBusinesses(data as never);
          if (data.length === 1) setSelectedBusinessId((data[0] as { id: string }).id);
        }
      } finally {
        setLoadingBusinesses(false);
      }
    }
    loadBusinesses();
  }, []);

  const selectedBusiness = businesses.find((b) => b.id === selectedBusinessId) || null;
  const derivedWebsiteCategory: WebsiteCategory = selectedBusiness ? normalizeWebsiteCategory(selectedBusiness.category, "business") : "business";

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
    if (!selectedBusinessId) {
      setError("Please select a business to create a website for");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const finalSlug = slug ? slugify(slug) : undefined;

      if (withTemplate && selectedTemplate) {
        const creationRequestId = crypto.randomUUID();
        const res = await instantiateWebsiteFromTemplate({
          organizerId: orgId,
          templateId: selectedTemplate,
          siteTitle: siteTitle.trim(),
          slug: finalSlug,
          websiteCategory: derivedWebsiteCategory,
          creationRequestId,
          businessId: selectedBusinessId,
        });
        if (!res.success || !res.data) {
          setError(res.error || "Failed to create website from template");
          return;
        }
        router.push(`/dashboard/org/${orgId}/website`);
        router.refresh();
        return;
      }

      const res = await createTenantWebsite(orgId, {
        site_title: siteTitle.trim(),
        slug: finalSlug,
        status: "draft",
        websiteCategory: derivedWebsiteCategory,
        metadata: { websiteCategory: derivedWebsiteCategory, business_id: selectedBusinessId },
      });
      if (!res.success || !res.data) {
        setError(res.error || "Failed to create website");
        return;
      }
      const websiteId = (res.data as { id: string }).id;
      const pageRes = await createPage(websiteId, { title: "Home", slug: "home", is_home: true, status: "draft" });
      if (!pageRes.success || !pageRes.data) {
        router.push(`/dashboard/org/${orgId}/website`);
        return;
      }
      const pageId = (pageRes.data as { id: string }).id;

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
        description={step === 1 ? "Select the business for your website — classification and recommendations are inherited." : "Pick a starting point. Every section is editable in the builder."}
      />

      {error && <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      {step === 1 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-xs space-y-5">
          <div>
            <span className="mb-1.5 block text-xs font-semibold text-zinc-700">Website / Business Name *</span>
            <Input value={siteTitle} onChange={(e) => setSiteTitle(e.target.value)} placeholder="e.g. Acme Studio" />
            <span className="mt-1 block text-xs text-muted-foreground">Prefilled from your organization — editable.</span>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold text-zinc-700">Which business would you like to create a website for? *</span>
            {loadingBusinesses ? (
              <div className="rounded-xl border border-zinc-200 p-4 text-sm text-zinc-500">Loading businesses...</div>
            ) : businesses.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-center">
                <p className="text-sm font-semibold text-zinc-700">No businesses found</p>
                <p className="text-xs text-zinc-500 mt-1">Create a Business List first, then return to create its website.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => router.push("/dashboard/businesses/new")}>Create Business</Button>
              </div>
            ) : (
              <div className="grid gap-2">
                {businesses.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBusinessId(b.id)}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${selectedBusinessId === b.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-zinc-200 bg-white hover:border-zinc-300"}`}
                  >
                    <div className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center overflow-hidden shrink-0">
                      {b.logo ? <img src={b.logo} alt={b.name} className="h-full w-full object-cover" /> : <span className="text-xs font-bold text-zinc-500">{b.name.slice(0,2).toUpperCase()}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-zinc-900 truncate">{b.name}</p>
                      <p className="text-xs text-zinc-500 truncate">{b.industry} · {b.category}{b.business_type ? ` · ${b.business_type}` : ""}</p>
                    </div>
                    {selectedBusinessId === b.id && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </button>
                ))}
              </div>
            )}
            {selectedBusiness && (
              <p className="mt-2 text-xs text-zinc-500">Website type derived: <span className="font-semibold text-zinc-700 capitalize">{derivedWebsiteCategory}</span> · Template recommendations will match this business.</p>
            )}
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold text-zinc-700">Website URL Slug</span>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={slugify(siteTitle) || "acme-studio"} />
            <span className="mt-1 block text-xs text-muted-foreground">Letters, numbers and dashes. Leave blank to auto-generate.</span>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between pt-2">
            <Button
              variant="outline"
              onClick={() => handleCreate(false)}
              disabled={creating || !selectedBusinessId}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
              Skip templates — start blank
            </Button>
            <Button onClick={() => setStep(2)} disabled={!siteTitle.trim() || !selectedBusinessId}>
              Continue to templates <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-900 truncate">{siteTitle}</p>
              <p className="text-xs text-muted-foreground truncate">/{slug ? slugify(slug) : slugify(siteTitle)} · {selectedBusiness ? `${selectedBusiness.name} · ${derivedWebsiteCategory}` : derivedWebsiteCategory}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setStep(1)}>
              Back
            </Button>
          </div>
          <TemplateGallery selectedId={selectedTemplate} onSelect={setSelectedTemplate} onUse={() => handleCreate(true)} using={creating} initialCategory={derivedWebsiteCategory} />
          <div className="flex justify-center">
            <Button variant="ghost" onClick={() => handleCreate(false)} disabled={creating || !selectedBusinessId}>
              Or start blank
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
