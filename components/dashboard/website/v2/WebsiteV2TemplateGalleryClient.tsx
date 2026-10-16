"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createWebsiteFromV2Template } from "@/lib/actions/website-v2";
import {
  getOrCreateV2CreationAttempt,
  getV2CreateActionArgs,
  getV2CreateAttemptKey,
  getV2GalleryCategoryModel,
  getV2WebsiteBuilderPath,
  mapV2TemplateCreateError,
  type V2CreationAttempt,
} from "@/lib/website-v2-create-flow";
import type { WebsiteCategory } from "@/lib/website-category";
import { WEBSITE_CATEGORY_LABELS } from "@/lib/website-category";
import { V2TemplateGalleryPreviewFrame } from "./V2TemplateGalleryPreviewFrame";

interface GalleryCard {
  id: string;
  name: string;
  description: string;
  category: WebsiteCategory;
  supportedCategories: WebsiteCategory[];
  preview: ReactNode;
}

interface WebsiteV2TemplateGalleryClientProps {
  organizerId: string;
  initialCategory: WebsiteCategory;
  cards: GalleryCard[];
  canCreate: boolean;
}

export function WebsiteV2TemplateGalleryClient({
  organizerId,
  initialCategory,
  cards,
  canCreate,
}: WebsiteV2TemplateGalleryClientProps) {
  const router = useRouter();
  const publicT = useTranslations("PublicSite");
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const pendingRef = useRef(false);
  const attemptRef = useRef<V2CreationAttempt | null>(null);
  const categoryModel = getV2GalleryCategoryModel(initialCategory);
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const visibleCards = categoryModel.templates.flatMap((template) => {
    const card = cardsById.get(template.id);
    return card ? [card] : [];
  });

  async function handleCreateTemplate(templateId: string) {
    if (!canCreate || pendingRef.current) return;
    pendingRef.current = true;
    setPendingTemplateId(templateId);
    setErrors((current) => ({ ...current, [templateId]: "" }));

    const attemptKey = getV2CreateAttemptKey(templateId);
    const attempt = getOrCreateV2CreationAttempt(
      attemptRef.current,
      attemptKey,
      () => globalThis.crypto.randomUUID()
    );
    attemptRef.current = attempt;

    try {
      const [verifiedOrganizerId, selectedTemplateId, options] = getV2CreateActionArgs(
        organizerId,
        templateId,
        initialCategory,
        attempt.requestId
      );
      const result = await createWebsiteFromV2Template(
        verifiedOrganizerId,
        selectedTemplateId,
        options
      );
      if (!result.success || !result.data) {
        setErrors((current) => ({
          ...current,
          [templateId]: mapV2TemplateCreateError(result.error),
        }));
        return;
      }
      router.push(getV2WebsiteBuilderPath(organizerId));
      router.refresh();
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [templateId]: mapV2TemplateCreateError(
          error instanceof Error ? error.message : undefined
        ),
      }));
    } finally {
      pendingRef.current = false;
      setPendingTemplateId(null);
    }
  }

  return (
    <section className="space-y-5" aria-label="Choose a website template">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">{publicT("chooseWebsiteTemplate")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{publicT("categoryRecommendationOnly")}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {visibleCards.map((card) => {
          const busy = pendingTemplateId === card.id;
          const cardName = card.id === "food-order" ? publicT("foodOrderTemplateName") : card.id === "store" ? publicT("storeTemplateName") : card.name;
          const cardDescription = card.id === "food-order"
            ? publicT("foodOrderTemplateDescription")
            : card.id === "store" ? publicT("storeTemplateDescription") : card.description;
          return (
            <article key={card.id} className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs">
              <V2TemplateGalleryPreviewFrame>{card.preview}</V2TemplateGalleryPreviewFrame>
              <div className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-zinc-900">{cardName}</h3>
                    <p className="mt-1 text-sm leading-5 text-zinc-600">{cardDescription}</p>
                  </div>
                  <Badge variant="outline" size="sm" className="shrink-0 capitalize">
                    {categoryModel.recommendedTemplateIds.includes(card.id)
                      ? publicT("recommendedFor", { category: WEBSITE_CATEGORY_LABELS[initialCategory] })
                      : publicT("anyCategory")}
                  </Badge>
                </div>
                {errors[card.id] ? (
                  <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                    {errors[card.id]}
                  </p>
                ) : null}
                <Button
                  type="button"
                  className="w-full"
                  disabled={!canCreate || pendingTemplateId !== null}
                  onClick={() => void handleCreateTemplate(card.id)}
                >
                  {busy ? "Creating website…" : "Use this template"}
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      {!canCreate ? (
        <p className="text-center text-xs text-zinc-500">Only organization owners, admins, or managers can create a website.</p>
      ) : null}
    </section>
  );
}
