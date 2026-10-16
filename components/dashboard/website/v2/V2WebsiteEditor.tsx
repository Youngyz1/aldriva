"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ContentDoc } from "@/lib/website-content";
import { createDraftSaveQueue } from "@/lib/draft-save-queue";
import { checkPublishReadiness, resolveTemplateContent } from "@/lib/website-template-resolver";
import { buildWebsiteEditorSections, getWebsiteEditorControlForSlot, toWebsiteContentDraft } from "@/lib/website-v2-editor-schema";
import type { V2BuilderState, V2MenuItemChoice } from "@/lib/actions/website-v2";
import { getV2MenuItemChoices } from "@/lib/actions/website-v2";
import { discardContentDraft, publishContentDraft, saveContentDraft } from "@/lib/actions/website-content";
import { V2SlotField } from "./V2SlotField";
import { WebsitePreviewPanel } from "./WebsitePreviewPanel";
import { V2WebsiteLiveLink } from "./V2WebsiteLiveLink";
import { V2MenuDrawer } from "./V2MenuDrawer";
import { getBusinessOfferings } from "@/lib/business-offerings";
import { getBuilderCommerceCapability } from "@/lib/website-commerce-registry";
import { Switch } from "@/components/ui/switch";
import { OrderingPaymentsPanel } from "./OrderingPaymentsPanel";
import { createNeutralGallerySampleContent, getFoodOrderLocalizedCopy } from "@/lib/website-v2-template-preview";

interface V2WebsiteEditorProps {
  initialState: V2BuilderState;
  menuItems: V2MenuItemChoice[];
}

export function V2WebsiteEditor({ initialState, menuItems }: V2WebsiteEditorProps) {
  const storeT = useTranslations("Storefront");
  const publicT = useTranslations("PublicSite") as unknown as (key: string, values?: Record<string, string>) => string;
  const offeringT = useTranslations("BusinessOfferings");
  const websiteId = initialState.websiteId;
  const template = initialState.templateManifest;
  const initialDraftVersion = initialState.draftVersion;
  const versionState = useMemo(() => ({ value: initialDraftVersion }), [initialDraftVersion]);
  const latestContentRef = useRef<ContentDoc>(initialState.contentDraftOrLive);
  const timerRef = useRef<number | null>(null);
  const previewFocusTimer = useRef<number | null>(null);
  const queue = useMemo(() => createDraftSaveQueue<ContentDoc>(async (draft) => {
    const result = await saveContentDraft(websiteId, toWebsiteContentDraft(draft), versionState.value);
    if (result.success && result.data) {
      versionState.value = result.data.version;
      return { ok: true };
    }
    return { ok: false, code: result.code, error: result.error ?? "Draft save failed." };
  }, { pauseOnStaleDraft: true }), [websiteId, versionState]);

  const [content, setContent] = useState<ContentDoc>(initialState.contentDraftOrLive);
  const [storefrontOfferings, setStorefrontOfferings] = useState<string[]>(initialState.storefront.offerings ?? []);
  const [currentMenuItems, setCurrentMenuItems] = useState<V2MenuItemChoice[]>(menuItems);
  const [menuDrawerOpen, setMenuDrawerOpen] = useState(false);
  const [queueState, setQueueState] = useState(queue.getState());
  const [openSectionId, setOpenSectionId] = useState("business");
  const [selectedPageSlug, setSelectedPageSlug] = useState(initialState.previewPages.find((page) => page.isHome)?.slug ?? initialState.previewPages[0]?.slug ?? "home");
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  // Below the xl breakpoint the form and preview stack; the toggle picks which
  // one is visible. At xl and above both show side by side.
  const [mobileView, setMobileView] = useState<"form" | "preview">("form");

  const foodOrderCopy = useMemo(
    () => template.id === "food-order" ? getFoodOrderLocalizedCopy(publicT) : undefined,
    [publicT, template.id]
  );
  const foodOrderSampleContent = useMemo(() => {
    if (!foodOrderCopy) return undefined;
    const businessName = typeof content.business_name === "string" && content.business_name.trim()
      ? content.business_name
      : publicT("foodOrderPreviewFallbackBusiness");
    const businessLogo = typeof content.logo_url === "string" ? content.logo_url : null;
    return createNeutralGallerySampleContent(template.id, businessName, businessLogo, {
      tagline: publicT("previewTagline"),
      headline: publicT("previewHeadline", { business: "{business}" }),
      subtext: publicT("previewSubtext"),
      about: publicT("previewAbout"),
      featureTitle: publicT("previewFeatureTitle"),
      featureDescription: publicT("previewFeatureDescription"),
      callToAction: publicT("previewExplore"),
      home: publicT("home"),
      catalog: publicT("catalog"),
      aboutNav: publicT("about"),
      contact: publicT("contact"),
      process: publicT("process"),
      faq: publicT("faq"),
      pricing: publicT("pricing"),
      foodOrder: foodOrderCopy.sample,
    });
  }, [content.business_name, content.logo_url, foodOrderCopy, publicT, template.id]);

  const business = useMemo(() => ({
    ...initialState.storefront,
    offerings: storefrontOfferings,
  }), [initialState.storefront, storefrontOfferings]);
  const catalog = getBusinessOfferings(business.businessType, business.category);
  const getOfferingLabel = offeringT as unknown as (key: string) => string;
  const offeringLabels = useMemo(
    () => Object.fromEntries(catalog.map((offering) => [offering.key, getOfferingLabel(`labels.${offering.labelKey}`)])),
    [catalog, getOfferingLabel]
  );
  const resolved = useMemo(
    () => resolveTemplateContent(template.id, template.version, content, {
      includeSamples: true,
      includeSourceMap: true,
      siteSlug: initialState.websiteSlug,
      business: { ...business, offeringLabels },
      viewMenuLabel: storeT("viewMenu"),
      rentalContactCta: storeT("rentalContactCta"),
      primaryActionLabels: {
        orderNow: storeT("orderNow"),
        reserveTable: storeT("reserveTable"),
        bookNow: storeT("bookNow"),
        viewMenu: storeT("viewMenu"),
        viewProducts: storeT("viewProducts"),
        contact: storeT("contact"),
        rentalContactCta: storeT("rentalContactCta"),
      },
      offeringsHeading: storeT("whatWeOffer"),
      restaurantCtaBandHeading: storeT("restaurantBrandMessage"),
      rentalCtaBandHeading: storeT("rentalBrandMessage"),
      foodOrderCopy: foodOrderCopy?.resolver,
      sampleContentOverride: foodOrderSampleContent,
      timeZone: business.timeZone,
    }),
    [business, content, foodOrderCopy, foodOrderSampleContent, initialState.websiteSlug, offeringLabels, storeT, template.id, template.version]
  );
  const readiness = useMemo(() => checkPublishReadiness(template.id, template.version, content), [content, template.id, template.version]);
  const sections = useMemo(
    () => buildWebsiteEditorSections(template, content, resolved, readiness.missingRequired.map((slot) => slot.slotId)),
    [content, readiness.missingRequired, resolved, template]
  );
  const checklistMissing = useMemo(() => {
    const missingControlIds = new Set(sections.flatMap((section) => section.missingSlotIds));
    return readiness.missingRequired.filter((slot) => missingControlIds.has(slot.slotId));
  }, [readiness.missingRequired, sections]);
  const sampleSlots = resolved.sampleFields;
  const editable = initialState.userRole === null || ["owner", "admin", "manager", "editor"].includes(initialState.userRole);
  const canManageOfferings = initialState.userRole === null || ["owner", "admin", "manager"].includes(initialState.userRole);

  const panelBusiness = useMemo(() => {
    if (!business.businessId) return null;
    return {
      id: business.businessId,
      name: business.businessName ?? "Business",
      businessType: business.businessType,
      category: business.category,
      offerings: storefrontOfferings,
      currency: business.currency,
    };
  }, [business, storefrontOfferings]);

  const commerceCapability = getBuilderCommerceCapability(template.category ?? business.category);
  const canManageCommerce = commerceCapability?.kind === "menu" && (initialState.userRole === null || ["owner", "admin", "manager", "editor"].includes(initialState.userRole));
  const canDeleteCommerce = commerceCapability?.kind === "menu" && (initialState.userRole === null || ["owner", "admin", "manager"].includes(initialState.userRole));

  const refreshMenuItems = useCallback(async () => {
    const res = await getV2MenuItemChoices(websiteId);
    if (res.success) {
      setCurrentMenuItems(res.data);
    }
  }, [websiteId]);

  useEffect(() => queue.subscribe(() => setQueueState(queue.getState())), [queue]);

  useEffect(() => {
    if (queueState.status === "failed") {
      console.error(`[website-draft-save] Save failed: ${queueState.code || "unknown"}`);
    }
  }, [queueState.status, queueState.code]);

  const sendSave = useCallback((draft: ContentDoc) => {
    queue.request(draft);
  }, [queue]);

  const updateContent = useCallback((field: keyof ContentDoc, value: unknown) => {
    setContent((current) => {
      const next = { ...current, [field]: value } as ContentDoc;
      latestContentRef.current = next;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        sendSave(next);
      }, 500);
      return next;
    });
  }, [sendSave]);

  const isSectionToggledOn = useCallback((sectionId: string, defaultOff?: boolean) => {
    const enabledMap = content.enabled_sections as Record<string, boolean> | undefined;
    const explicit = enabledMap?.[sectionId];
    if (typeof explicit === "boolean") return explicit;
    if (defaultOff) {
      if (sectionId === "gallery") {
        return Array.isArray(content.gallery_images) && content.gallery_images.length > 0;
      }
      return false;
    }
    return true;
  }, [content.enabled_sections, content.gallery_images]);

  const handleToggleSection = useCallback((sectionId: string, enabled: boolean) => {
    const currentSections = (content.enabled_sections as Record<string, boolean> | undefined) ?? {};
    const nextSections = { ...currentSections, [sectionId]: enabled };
    updateContent("enabled_sections", nextSections);
  }, [content.enabled_sections, updateContent]);

  const getSaveFailedReason = useCallback((code?: string | null): string => {
    if (!code) return storeT("saveFailedReasons.unknown");
    try {
      const translator = storeT as unknown as (key: string) => string;
      const translated = translator(`saveFailedReasons.${code}`);
      return typeof translated === "string" && !translated.startsWith("saveFailedReasons.")
        ? translated
        : storeT("saveFailedReasons.unknown");
    } catch {
      return storeT("saveFailedReasons.unknown");
    }
  }, [storeT]);

  const flushSave = useCallback(async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
      sendSave(latestContentRef.current);
    }
    await queue.flush();
  }, [queue, sendSave]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!queue.getState().pending && timerRef.current === null) return;
      event.preventDefault();
      event.returnValue = "";
      void flushSave();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        sendSave(latestContentRef.current);
      }
      void queue.flush();
    };
  }, [flushSave, queue, sendSave]);

  const focusSlot = useCallback((slotId: string) => {
    const target = resolved.checklistTargets[slotId];
    if (target && initialState.previewPages.some((page) => page.slug === target.pageSlug)) {
      setSelectedPageSlug(target.pageSlug);
    }
    const entry = getWebsiteEditorControlForSlot(sections, slotId);
    if (!entry) return;
    setOpenSectionId(entry.sectionId);
    if (previewFocusTimer.current !== null) window.clearTimeout(previewFocusTimer.current);
    previewFocusTimer.current = window.setTimeout(() => {
      const root = document.querySelector<HTMLElement>(`[data-slot-control-id="${CSS.escape(entry.control.id)}"]`);
      const focusTarget = root?.querySelector<HTMLElement>("input, textarea, button, select");
      focusTarget?.focus();
      root?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }, [initialState.previewPages, resolved.checklistTargets, sections]);

  async function handlePublish() {
    setPublishMessage(null);
    setChecklistOpen(false);
    setPublishing(true);
    try {
      await flushSave();
      if (queue.getState().paused) {
        setPublishMessage("Reload the latest draft before publishing.");
        return;
      }
      if (queue.getState().status === "failed") {
        setPublishMessage(queue.getState().error ?? "Save your latest changes before publishing.");
        return;
      }
      const result = await publishContentDraft(websiteId, versionState.value);
      if (!result.success) {
        setPublishMessage(result.error ?? "Could not publish this website.");
        return;
      }
      window.location.reload();
    } finally {
      setPublishing(false);
    }
  }

  async function handleDiscard() {
    if (queue.getState().paused) {
      if (window.confirm("Discard your local edits and reload the latest saved draft?")) window.location.reload();
      return;
    }
    if (!window.confirm("Discard all website draft changes and reload the latest published content?")) return;
    await flushSave();
    const result = await discardContentDraft(websiteId);
    if (!result.success) {
      setPublishMessage(result.error ?? "Could not discard the draft.");
      return;
    }
    window.location.reload();
  }

  function renderControl(control: (typeof sections)[number]["controls"][number]) {
    return <div key={control.id} data-slot-control-id={control.id} className="pt-4 first:pt-0">
      <V2SlotField
        control={control}
        value={content[control.field]}
        onChange={(value) => updateContent(control.field, value)}
        tenantId={initialState.tenantId}
        template={template}
        menuItems={currentMenuItems}
        sampled={control.slotIds.some((slotId) => sampleSlots.includes(slotId))}
        onOpenMenuEditor={canManageCommerce ? () => setMenuDrawerOpen(true) : undefined}
        canManageMenu={canManageCommerce}
      />
    </div>;
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/95 sm:px-6">
        <div className="min-w-0"><p className="truncate text-sm font-semibold">{initialState.siteTitle}</p><p className="text-xs text-zinc-500">{initialState.websiteSlug}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <V2WebsiteLiveLink isPublished={initialState.isPublished} url={initialState.publicUrl} />
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${queueState.paused ? "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200" : queueState.status === "saved" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" : queueState.status === "failed" ? "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"}`} aria-live="polite">{queueState.paused ? "Conflict" : queueState.status === "saving" || queueState.pending ? "Draft · Saving" : queueState.status === "saved" ? "Saved" : queueState.status === "failed" ? `${storeT("saveFailed")} · ${getSaveFailedReason(queueState.code)}` : "Draft"}</span>
          {queueState.status === "failed" && !queueState.paused ? <button type="button" onClick={() => queue.retry()} className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:text-amber-100">Retry save</button> : null}
          <button type="button" onClick={() => void handleDiscard()} disabled={!editable} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:border-zinc-700">Discard</button>
          <button type="button" onClick={() => setChecklistOpen(true)} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold dark:border-zinc-700">Publish checklist{checklistMissing.length ? ` · ${checklistMissing.length}` : ""}</button>
          <button
            type="button"
            onClick={() => void handlePublish()}
            disabled={!initialState.canPublish || !readiness.ready || publishing || queueState.paused}
            title={
              !initialState.canPublish
                ? "Only an owner, admin, or manager can publish this website."
                : queueState.paused
                  ? "Draft conflict — reload the latest version before publishing."
                  : !readiness.ready && checklistMissing.length > 0
                    ? `${checklistMissing.length} required field${checklistMissing.length === 1 ? "" : "s"} missing: ${checklistMissing.map((item) => item.label).join(", ")}. Open \"Publish checklist\" for details.`
                    : undefined
            }
            className="rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {publishing ? "Publishing…" : "Publish"}
          </button>
        </div>
      </header>

      {queueState.paused ? <div role="alert" className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100 sm:mx-6"><div><p className="font-semibold">This draft changed in another session.</p><p className="mt-1 text-xs">Your local edits are still here. Reload the latest version to continue.</p></div><button type="button" className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-semibold text-white" onClick={() => window.location.reload()}>Reload latest</button></div> : null}
      {publishMessage ? <div role="status" className="mx-4 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100 sm:mx-6">{publishMessage}</div> : null}

      <div className="grid min-h-[calc(100vh-64px)] grid-cols-1 items-start gap-4 p-4 sm:p-6 xl:h-[calc(100dvh-10rem)] xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
        <div className="flex rounded-xl border border-zinc-200 bg-zinc-100 p-1 xl:hidden" role="group" aria-label="Edit or preview">
          {(["form", "preview"] as const).map((view) => (
            <button
              key={view}
              type="button"
              aria-pressed={mobileView === view}
              onClick={() => setMobileView(view)}
              className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold capitalize ${mobileView === view ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-700 dark:text-white" : "text-zinc-500 dark:text-zinc-400"}`}
            >
              {view === "form" ? "Edit" : "Preview"}
            </button>
          ))}
        </div>
        <section className={`${mobileView === "preview" ? "hidden xl:block" : ""} min-w-0 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 xl:h-full xl:min-h-0 xl:max-h-full xl:overflow-x-hidden xl:overflow-y-auto xl:overscroll-contain xl:pr-2`} aria-label="Website content sections">
          <div className="border-b border-zinc-200 p-4 dark:border-zinc-800"><h1 className="text-base font-bold">Edit your website</h1><p className="mt-1 text-xs text-zinc-500">Your template controls the layout and colors.</p></div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {sections.map((section, index) => {
              const open = openSectionId === section.id;
              return <section key={section.id} className="px-3 py-1">
                <button type="button" aria-expanded={open} onClick={() => setOpenSectionId(open ? "" : section.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">{index + 1}</span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{section.titleKey ? publicT(section.titleKey) : section.title}</span><span className="block truncate text-xs text-zinc-500">{section.id === "template" && template.id === "food-order" ? publicT("foodOrderTemplateName") : section.summary}</span></span>
                  {section.missingSlotIds.length > 0 ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950/50 dark:text-rose-200">{section.missingSlotIds.length} missing</span> : null}
                  <span aria-hidden="true" className="text-zinc-400">{open ? "−" : "+"}</span>
                </button>
                {open ? <div className="space-y-4 px-2 pb-4 pt-2">
                  {section.optional ? (
                    <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-800/50">
                      <div className="space-y-0.5">
                        <label htmlFor={`toggle-${section.id}`} className="cursor-pointer text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          {storeT("showOnSite")}
                        </label>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          {storeT("optionalSection")}
                        </p>
                      </div>
                      <Switch
                        id={`toggle-${section.id}`}
                        checked={isSectionToggledOn(section.sectionId ?? section.id, section.defaultOff)}
                        onCheckedChange={(checked) => handleToggleSection(section.sectionId ?? section.id, checked)}
                        aria-label={storeT("showOnSite")}
                      />
                    </div>
                  ) : null}
                  {section.readOnly ? <div className="flex items-center justify-between rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-800"><span>{template.id === "food-order" ? publicT("foodOrderTemplateName") : template.name}</span><button type="button" disabled className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-semibold opacity-50 dark:border-zinc-700">Change template</button></div> : section.controls.map(renderControl)}
                </div> : null}
              </section>;
            })}
            <OrderingPaymentsPanel
              business={panelBusiness}
              template={template}
              canManage={canManageOfferings}
              hasActiveDish={currentMenuItems.length > 0}
              onOfferingsChange={setStorefrontOfferings}
              open={openSectionId === "ordering_payments"}
              onToggleOpen={() => setOpenSectionId((current) => current === "ordering_payments" ? "" : "ordering_payments")}
              index={sections.length + 1}
            />
          </div>
        </section>
        <div className={`${mobileView === "form" ? "hidden xl:block" : ""} w-full min-w-0 max-w-full xl:sticky xl:top-[4.5rem] xl:h-full xl:min-h-0 xl:max-h-[calc(100dvh-10rem)] xl:self-start`}>
        <WebsitePreviewPanel
          websiteId={websiteId}
          tenantId={initialState.tenantId}
          siteTitle={initialState.siteTitle}
          initialState={initialState}
          content={content}
          selectedPageSlug={selectedPageSlug}
          onSelectPage={setSelectedPageSlug}
          menuItems={currentMenuItems}
          onOpenMenuEditor={canManageCommerce ? () => setMenuDrawerOpen(true) : undefined}
          offerings={storefrontOfferings}
          isOrderingLive={resolved.storefrontFeatures.ordering}
        />
        </div>
      </div>

      {checklistOpen ? <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setChecklistOpen(false); }}>
        <aside role="dialog" aria-modal="true" aria-labelledby="publish-checklist-title" className="h-full w-full max-w-md overflow-y-auto border-l border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between"><h2 id="publish-checklist-title" className="text-lg font-bold">Publish checklist</h2><button type="button" aria-label="Close checklist" onClick={() => setChecklistOpen(false)} className="rounded-md px-2 py-1 text-xl text-zinc-500">×</button></div>
          {readiness.ready ? <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">Required content is ready to publish.</p> : <ul className="mt-4 space-y-2">{checklistMissing.map((item) => <li key={item.slotId}><button type="button" onClick={() => { setChecklistOpen(false); focusSlot(item.slotId); }} className="w-full rounded-lg border border-rose-200 p-3 text-left hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/30"><span className="block text-sm font-semibold">{item.label}</span><span className="mt-1 block text-xs text-zinc-500">Click to open the field.</span></button></li>)}</ul>}
          {!initialState.canPublish ? <p className="mt-4 text-xs text-zinc-500">Only an owner, admin, or manager can publish this website.</p> : null}
          <button type="button" disabled={!initialState.canPublish || !readiness.ready || publishing || queueState.paused} onClick={() => void handlePublish()} className="mt-6 w-full rounded-lg bg-orange-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-45">Publish website</button>
        </aside>
      </div> : null}

      {canManageCommerce ? (
        <V2MenuDrawer
          open={menuDrawerOpen}
          onClose={() => setMenuDrawerOpen(false)}
          organizerId={initialState.tenantId}
          canEdit={canManageCommerce}
          canDelete={canDeleteCommerce}
          onMenuChanged={refreshMenuItems}
        />
      ) : null}
    </main>
  );
}
