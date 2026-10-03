"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Globe,
  Palette,
  FileText,
  Menu,
  ExternalLink,
  Loader2,
  Save,
  Eye,
  Settings,
  Sparkles,
  LayoutTemplate,
} from "lucide-react";
import {
  createTenantWebsite,
  updateTenantWebsite,
  createPage,
  updatePage,
  deletePage,
  updateNavigation,
} from "@/lib/actions/website";
import type {
  ThemeConfig,
  HeaderConfig,
  FooterConfig,
  NavigationItem,
  WebsiteStatus,
} from "@/lib/website-nav";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/state";
import { GeneralPanel } from "@/components/dashboard/website/settings/GeneralPanel";
import { PagesPanel } from "@/components/dashboard/website/settings/PagesPanel";
import { NavigationPanel } from "@/components/dashboard/website/settings/NavigationPanel";
import { HeaderFooterPanel } from "@/components/dashboard/website/settings/HeaderFooterPanel";
import { SEOPanel } from "@/components/dashboard/website/settings/SEOPanel";
import type { WebsiteData } from "@/components/dashboard/website/settings/types";

type Props = {
  orgId: string;
  orgName: string;
  orgSlug: string;
  initialData: WebsiteData | null;
};

export default function WebsiteSettingsClient({ orgId, orgName, initialData }: Props) {
  const router = useRouter();
  const [data] = useState<WebsiteData | null>(initialData);
  const [activeTab, setActiveTab] = useState<"general" | "pages" | "navigation" | "headerFooter" | "seo">("general");

  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [siteTitle, setSiteTitle] = useState(data?.website?.site_title || orgName);
  const [siteTagline, setSiteTagline] = useState(data?.website?.site_tagline || "");
  const [status, setStatus] = useState<WebsiteStatus>(data?.website?.status || "draft");
  const [themeConfig, setThemeConfig] = useState<ThemeConfig>(
    data?.website?.theme_config || {
      theme: "default",
      primaryColor: "#ea580c",
      fontFamily: "sans",
      borderRadius: "xl",
      darkMode: false,
    }
  );
  const [headerConfig, setHeaderConfig] = useState<HeaderConfig>(
    data?.website?.header_config || {
      showLogo: true,
      showNav: true,
      showCta: true,
      ctaLabel: "Get in Touch",
      ctaHref: "/contact",
      sticky: true,
    }
  );
  const [footerConfig, setFooterConfig] = useState<FooterConfig>(
    data?.website?.footer_config || {
      showSocials: true,
      copyrightText: "",
      showPoweredBy: true,
      customLinks: [],
    }
  );
  const [seoTitle, setSeoTitle] = useState(data?.website?.seo_title || "");
  const [seoDescription, setSeoDescription] = useState(data?.website?.seo_description || "");
  const [seoOgImage, setSeoOgImage] = useState(data?.website?.seo_og_image || "");

  const [pages, setPages] = useState(data?.pages || []);
  const [isPageModalOpen, setIsPageModalOpen] = useState(false);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [pageFormTitle, setPageFormTitle] = useState("");
  const [pageFormSlug, setPageFormSlug] = useState("");
  const [pageFormIsHome, setPageFormIsHome] = useState(false);
  const [pageFormStatus, setPageFormStatus] = useState<WebsiteStatus>("draft");
  const [pageFormSeoTitle, setPageFormSeoTitle] = useState("");
  const [pageFormSeoDescription, setPageFormSeoDescription] = useState("");

  const [navItems, setNavItems] = useState<NavigationItem[]>(data?.navigation || []);
  const [isNavModalOpen, setIsNavModalOpen] = useState(false);
  const [navFormId, setNavFormId] = useState<string | null>(null);
  const [navFormLabel, setNavFormLabel] = useState("");
  const [navFormHref, setNavFormHref] = useState("");
  const [navFormPageId, setNavFormPageId] = useState<string>("");
  const [navFormTarget, setNavFormTarget] = useState<"_self" | "_blank">("_self");

  const handleCreateWebsite = async () => {
    setCreating(true);
    setMessage(null);
    try {
      const res = await createTenantWebsite(orgId, { site_title: orgName, status: "draft" });
      if (!res.success) setMessage({ type: "error", text: res.error || "Failed to create website" });
      else {
        setMessage({ type: "success", text: "Business website created successfully!" });
        router.refresh();
      }
    } catch {
      setMessage({ type: "error", text: "An unexpected error occurred" });
    } finally {
      setCreating(false);
    }
  };

  const handleSaveGeneral = async () => {
    if (!data?.website?.id) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await updateTenantWebsite(data.website.id, {
        site_title: siteTitle,
        site_tagline: siteTagline || null,
        status,
        theme_config: themeConfig,
        header_config: headerConfig,
        footer_config: footerConfig,
        seo_title: seoTitle || null,
        seo_description: seoDescription || null,
        seo_og_image: seoOgImage || null,
      });
      if (!res.success) setMessage({ type: "error", text: res.error || "Failed to save settings" });
      else {
        setMessage({ type: "success", text: "Settings saved successfully!" });
        router.refresh();
      }
    } catch {
      setMessage({ type: "error", text: "Failed to update website settings" });
    } finally {
      setSaving(false);
    }
  };

  const openNewPageModal = () => {
    setEditingPageId(null);
    setPageFormTitle("");
    setPageFormSlug("");
    setPageFormIsHome(false);
    setPageFormStatus("draft");
    setPageFormSeoTitle("");
    setPageFormSeoDescription("");
    setIsPageModalOpen(true);
  };
  const openEditPageModal = (page: WebsiteData["pages"][0]) => {
    setEditingPageId(page.id);
    setPageFormTitle(page.title);
    setPageFormSlug(page.slug);
    setPageFormIsHome(page.is_home);
    setPageFormStatus(page.status);
    setPageFormSeoTitle(page.seo_title || "");
    setPageFormSeoDescription(page.seo_description || "");
    setIsPageModalOpen(true);
  };
  const handleSavePage = async () => {
    if (!data?.website?.id) return;
    if (!pageFormTitle.trim()) {
      setMessage({ type: "error", text: "Page title is required" });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      if (editingPageId) {
        const res = await updatePage(editingPageId, {
          title: pageFormTitle,
          slug: pageFormSlug,
          is_home: pageFormIsHome,
          status: pageFormStatus,
          seo_title: pageFormSeoTitle || null,
          seo_description: pageFormSeoDescription || null,
        });
        if (!res.success) setMessage({ type: "error", text: res.error || "Failed to update page" });
        else {
          setMessage({ type: "success", text: "Page updated successfully!" });
          setIsPageModalOpen(false);
          router.refresh();
        }
      } else {
        const res = await createPage(data.website.id, {
          title: pageFormTitle,
          slug: pageFormSlug || undefined,
          is_home: pageFormIsHome,
          status: pageFormStatus,
          seo_title: pageFormSeoTitle || null,
          seo_description: pageFormSeoDescription || null,
        });
        if (!res.success) setMessage({ type: "error", text: res.error || "Failed to create page" });
        else {
          setMessage({ type: "success", text: "Page created successfully!" });
          setIsPageModalOpen(false);
          router.refresh();
        }
      }
    } catch {
      setMessage({ type: "error", text: "Failed to save page" });
    } finally {
      setSaving(false);
    }
  };
  const handleDeletePage = async (pageId: string) => {
    if (!confirm("Are you sure you want to delete this page? Any navigation links to this page will be removed.")) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await deletePage(pageId);
      if (!res.success) setMessage({ type: "error", text: res.error || "Failed to delete page" });
      else {
        setPages((prev) => prev.filter((p) => p.id !== pageId));
        setNavItems((prev) => prev.filter((n) => n.page_id !== pageId));
        setMessage({ type: "success", text: "Page deleted successfully!" });
        router.refresh();
      }
    } catch {
      setMessage({ type: "error", text: "Failed to delete page" });
    } finally {
      setSaving(false);
    }
  };

  const openNewNavModal = () => {
    setNavFormId(null);
    setNavFormLabel("");
    setNavFormHref("");
    setNavFormPageId("");
    setNavFormTarget("_self");
    setIsNavModalOpen(true);
  };
  const openEditNavModal = (item: NavigationItem) => {
    setNavFormId(item.id);
    setNavFormLabel(item.label);
    setNavFormHref(item.href);
    setNavFormPageId(item.page_id || "");
    setNavFormTarget(item.target || "_self");
    setIsNavModalOpen(true);
  };
  const handleSaveNavItem = async () => {
    if (!data?.website?.id) return;
    if (!navFormLabel.trim()) {
      setMessage({ type: "error", text: "Menu label is required" });
      return;
    }
    let href = navFormHref.trim();
    if (navFormPageId) {
      const selectedPage = pages.find((p) => p.id === navFormPageId);
      if (selectedPage) href = selectedPage.is_home ? "/" : `/${selectedPage.slug}`;
    }
    if (!href) href = "/";
    let updatedNav: NavigationItem[];
    if (navFormId) {
      updatedNav = navItems.map((item) => (item.id === navFormId ? { ...item, label: navFormLabel.trim(), href, page_id: navFormPageId || null, target: navFormTarget } : item));
    } else {
      const newItem: NavigationItem = { id: crypto.randomUUID(), label: navFormLabel.trim(), href, page_id: navFormPageId || null, target: navFormTarget, order: navItems.length };
      updatedNav = [...navItems, newItem];
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await updateNavigation(data.website.id, updatedNav);
      if (!res.success) setMessage({ type: "error", text: res.error || "Failed to update navigation" });
      else {
        setNavItems(updatedNav);
        setIsNavModalOpen(false);
        setMessage({ type: "success", text: "Navigation updated!" });
        router.refresh();
      }
    } catch {
      setMessage({ type: "error", text: "Failed to update navigation menu" });
    } finally {
      setSaving(false);
    }
  };
  const handleDeleteNavItem = async (id: string) => {
    if (!data?.website?.id) return;
    const updatedNav = navItems.filter((item) => item.id !== id);
    setSaving(true);
    try {
      const res = await updateNavigation(data.website.id, updatedNav);
      if (res.success) {
        setNavItems(updatedNav);
        setMessage({ type: "success", text: "Item removed from navigation" });
      }
    } finally {
      setSaving(false);
    }
  };
  const handleMoveNav = async (index: number, direction: "up" | "down") => {
    if (!data?.website?.id) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= navItems.length) return;
    const updated = [...navItems];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    const indexed = updated.map((item, idx) => ({ ...item, order: idx }));
    setSaving(true);
    try {
      const res = await updateNavigation(data.website.id, indexed);
      if (res.success) setNavItems(indexed);
    } finally {
      setSaving(false);
    }
  };

  if (!data?.website) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Organization Workspace" title="Business Website" description="Build and launch a customizable branded website for your organization." />
        {message && (
          <div className={`rounded-xl border p-4 text-sm font-medium ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-destructive/20 bg-destructive/5 text-destructive"}`}>{message.text}</div>
        )}
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-xs sm:p-12">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Globe className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-zinc-900">No Business Website Configured</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Create a custom business website with branded themes, multiple pages, dynamic navigation, and integrated services.</p>
          <div className="mt-6 flex justify-center">
            <Link href={`/dashboard/org/${orgId}/website/new`} className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 shadow-xs">
              <Sparkles className="h-4 w-4" /> Create Business Website
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const website = data.website;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Organization Workspace"
        title={siteTitle || "Business Website"}
        description="Manage your website themes, navigation, pages, and SEO metadata."
        badge={{ label: website.status, variant: website.status === "published" ? "emerald" : website.status === "archived" ? "neutral" : "amber" }}
        actions={
          <>
            <Link href={`/dashboard/org/${orgId}/website/builder`} className="inline-flex items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10 transition">
              <LayoutTemplate className="h-4 w-4" /> Visual Builder
            </Link>
            <a href={`/site/${website.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 shadow-xs">
              <Eye className="h-4 w-4 text-zinc-400" /> Preview <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
            </a>
            <Button onClick={handleSaveGeneral} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </>
        }
      />

      {message && (
        <div className={`rounded-xl border p-4 text-sm font-medium ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-destructive/20 bg-destructive/5 text-destructive"}`}>{message.text}</div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
        <div className="rounded-xl border border-zinc-200 bg-white shadow-xs overflow-hidden">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0 px-2">
            <TabsTrigger value="general" className="gap-1.5">
              <Palette className="h-4 w-4" /> Branding & Theme
            </TabsTrigger>
            <TabsTrigger value="pages" className="gap-1.5">
              <FileText className="h-4 w-4" /> Pages ({pages.length})
            </TabsTrigger>
            <TabsTrigger value="navigation" className="gap-1.5">
              <Menu className="h-4 w-4" /> Navigation ({navItems.length})
            </TabsTrigger>
            <TabsTrigger value="headerFooter" className="gap-1.5">
              <Settings className="h-4 w-4" /> Header & Footer
            </TabsTrigger>
            <TabsTrigger value="seo" className="gap-1.5">
              <Globe className="h-4 w-4" /> SEO & Meta
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="pt-6">
          <TabsContent value="general">
            <GeneralPanel siteTitle={siteTitle} setSiteTitle={setSiteTitle} siteTagline={siteTagline} setSiteTagline={setSiteTagline} status={status} setStatus={setStatus} themeConfig={themeConfig} setThemeConfig={setThemeConfig as never} />
          </TabsContent>
          <TabsContent value="pages">
            <PagesPanel orgId={orgId} pages={pages} onNew={openNewPageModal} onEdit={openEditPageModal} onDelete={handleDeletePage} />
          </TabsContent>
          <TabsContent value="navigation">
            <NavigationPanel navItems={navItems} onNew={openNewNavModal} onEdit={openEditNavModal} onDelete={handleDeleteNavItem} onMove={handleMoveNav} />
          </TabsContent>
          <TabsContent value="headerFooter">
            <HeaderFooterPanel siteTitle={siteTitle} headerConfig={headerConfig} setHeaderConfig={setHeaderConfig as never} footerConfig={footerConfig} setFooterConfig={setFooterConfig as never} />
          </TabsContent>
          <TabsContent value="seo">
            <SEOPanel siteTitle={siteTitle} seoTitle={seoTitle} setSeoTitle={setSeoTitle} seoDescription={seoDescription} setSeoDescription={setSeoDescription} seoOgImage={seoOgImage} setSeoOgImage={setSeoOgImage} />
          </TabsContent>
        </div>
      </Tabs>

      {/* Page modal — now using Dialog primitive */}
      <Dialog open={isPageModalOpen} onOpenChange={setIsPageModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPageId ? "Edit Page" : "Create New Page"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-zinc-700">Page Title *</span>
              <Input value={pageFormTitle} onChange={(e) => setPageFormTitle(e.target.value)} placeholder="e.g. About Us, Services" />
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-zinc-700">Page Slug (URL)</span>
              <Input value={pageFormSlug} onChange={(e) => setPageFormSlug(e.target.value)} placeholder="e.g. about-us" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="mb-1.5 block text-xs font-semibold text-zinc-700">Status</span>
                <Select value={pageFormStatus} onChange={(e) => setPageFormStatus(e.target.value as WebsiteStatus)}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </Select>
              </div>
              <label className="flex items-center gap-2 pt-6 text-sm font-semibold text-zinc-700">
                <input type="checkbox" checked={pageFormIsHome} onChange={(e) => setPageFormIsHome(e.target.checked)} className="rounded border-zinc-300 text-primary focus:ring-ring" /> Set as Home Page
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPageModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePage} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save Page
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Navigation modal — Dialog */}
      <Dialog open={isNavModalOpen} onOpenChange={setIsNavModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{navFormId ? "Edit Menu Link" : "Add Menu Link"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-zinc-700">Link Label *</span>
              <Input value={navFormLabel} onChange={(e) => setNavFormLabel(e.target.value)} placeholder="e.g. Services" />
            </div>
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-zinc-700">Link to Existing Page</span>
              <Select
                value={navFormPageId}
                onChange={(e) => {
                  setNavFormPageId(e.target.value);
                  const p = pages.find((pg) => pg.id === e.target.value);
                  if (p) {
                    setNavFormHref(p.is_home ? "/" : `/${p.slug}`);
                    if (!navFormLabel) setNavFormLabel(p.title);
                  }
                }}
              >
                <option value="">Custom URL</option>
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    Page: {p.title} (/{p.slug}) {p.is_home ? "[Home]" : ""}
                  </option>
                ))}
              </Select>
            </div>
            {!navFormPageId && (
              <div>
                <span className="mb-1.5 block text-xs font-semibold text-zinc-700">Custom URL / Href *</span>
                <Input value={navFormHref} onChange={(e) => setNavFormHref(e.target.value)} placeholder="/contact or https://external.com" />
              </div>
            )}
            <label className="flex items-center gap-2 pt-2 text-sm font-semibold text-zinc-700">
              <input type="checkbox" checked={navFormTarget === "_blank"} onChange={(e) => setNavFormTarget(e.target.checked ? "_blank" : "_self")} className="rounded border-zinc-300 text-primary focus:ring-ring" /> Open in new tab
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNavModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveNavItem} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
