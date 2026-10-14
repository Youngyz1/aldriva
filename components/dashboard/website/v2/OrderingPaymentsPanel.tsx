"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { updateBusiness } from "@/lib/actions/businesses";
import {
  getBuiltStorefrontFeatures,
  resolveStorefrontFeatures,
  storefrontFeatureForOffering,
} from "@/lib/storefront-features";
import { getBusinessOfferings } from "@/lib/business-offerings";
import { getCapabilitiesForBusinessType, type Capability } from "@/lib/business-taxonomy";
import { OfferingsFulfilmentWarning } from "@/components/dashboard/businesses/OfferingsFulfilmentWarning";
import type { WebsiteTemplateV2 } from "@/lib/website-template-v2";

export interface OrderingPaymentsPanelProps {
  business: {
    id: string;
    name: string;
    businessType: string | null;
    category: string;
    offerings: string[];
    currency: string;
  } | null;
  template: Pick<WebsiteTemplateV2, "sections" | "id">;
  capabilities?: readonly Capability[] | readonly string[];
  canManage: boolean;
  hasActiveDish?: boolean;
  onOfferingsChange: (newOfferings: string[]) => void;
  open: boolean;
  onToggleOpen: () => void;
  index?: number;
}

export function OrderingPaymentsPanel({
  business,
  template,
  capabilities,
  canManage,
  hasActiveDish,
  onOfferingsChange,
  open,
  onToggleOpen,
  index,
}: OrderingPaymentsPanelProps) {
  const t = useTranslations("BusinessOfferings");
  const getLabel = t as unknown as (key: string) => string;
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!business || !business.id) {
    return null;
  }

  const builtFeatures = getBuiltStorefrontFeatures(template);
  const catalog = getBusinessOfferings(business.businessType, business.category);

  // Filter catalog to feature offerings built in this template
  const featureOfferings = catalog.filter((offering) => {
    if (offering.kind !== "feature") return false;
    const feature = storefrontFeatureForOffering(offering.key);
    return feature ? Boolean(builtFeatures[feature]) : false;
  });

  // A6: Never render panel if no catalog features are built in this template
  if (featureOfferings.length === 0) {
    return null;
  }

  const effectiveCapabilities = capabilities ?? (business.businessType ? getCapabilitiesForBusinessType(business.businessType) : []);

  const featureResolution = resolveStorefrontFeatures({
    capabilities: effectiveCapabilities,
    offerings: business.offerings,
    built: builtFeatures,
    currency: business.currency,
    hasActiveDish,
  });

  async function handleToggle(key: string, checked: boolean) {
    if (!canManage || updatingKey !== null || !business) return;
    setUpdatingKey(key);
    setError(null);

    const nextOfferings = checked
      ? [...business.offerings, key]
      : business.offerings.filter((k) => k !== key);

    try {
      const res = await updateBusiness(business.id, { offerings: nextOfferings });
      if (res.success) {
        onOfferingsChange(nextOfferings);
      } else {
        setError(res.error || "Failed to update offerings.");
      }
    } catch {
      setError("An unexpected error occurred while updating.");
    } finally {
      setUpdatingKey(null);
    }
  }

  const getReasonLabel = (reasonKey?: string) => {
    if (!reasonKey) return "";
    try {
      const translated = (t as unknown as (k: string) => string)(`reasons.${reasonKey}`);
      return typeof translated === "string" && !translated.startsWith("reasons.")
        ? translated
        : reasonKey.replace(/_/g, " ");
    } catch {
      return reasonKey.replace(/_/g, " ");
    }
  };

  return (
    <section className="px-3 py-1 border-t border-zinc-100 dark:border-zinc-800" data-testid="ordering-payments-panel">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggleOpen}
        className="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          {index ?? "⚡"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {t("orderingPaymentsTitle")}
          </span>
          <span className="block truncate text-xs text-zinc-500">
            {t("orderingPaymentsBusinessLabel")} <strong className="font-semibold text-zinc-700 dark:text-zinc-300">{business.name}</strong>
          </span>
        </span>
        <span aria-hidden="true" className="text-zinc-400 font-bold">{open ? "−" : "+"}</span>
      </button>

      {open ? (
        <div className="space-y-4 px-2 pb-4 pt-2">
          {/* Live immediate notice */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-semibold">{t("orderingPaymentsLiveNotice")}</p>
          </div>

          {/* Read-only notice for non-managers */}
          {!canManage ? (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-400">
              {t("orderingPaymentsReadOnly")}
            </div>
          ) : null}

          {/* Fulfilment warning */}
          <OfferingsFulfilmentWarning offerings={business.offerings} />

          {/* Error notice */}
          {error ? (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
              {error}
            </div>
          ) : null}

          {/* Toggles */}
          <div className="space-y-3 divide-y divide-zinc-100 dark:divide-zinc-800/80">
            {featureOfferings.map((offering) => {
              const feature = storefrontFeatureForOffering(offering.key);
              const statusDetail = feature ? featureResolution.status[feature] : null;
              const isChecked = business.offerings.includes(offering.key);
              const isSaving = updatingKey === offering.key;

              return (
                <div
                  key={offering.key}
                  className="flex items-center justify-between gap-3 pt-3 first:pt-0"
                >
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <label
                      htmlFor={`toggle-offering-${offering.key}`}
                      className="cursor-pointer text-xs font-semibold text-zinc-900 dark:text-zinc-100 block"
                    >
                      {getLabel(`labels.${offering.labelKey}`)}
                    </label>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      {isChecked ? (
                        statusDetail?.live ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            {t("statusLive")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            {t("statusNeedsSetup")}{statusDetail?.reason ? ` — ${getReasonLabel(statusDetail.reason)}` : ""}
                          </span>
                        )
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-medium text-zinc-400 dark:text-zinc-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                          {t("statusOff")}
                        </span>
                      )}
                    </div>
                  </div>
                  <Switch
                    id={`toggle-offering-${offering.key}`}
                    checked={isChecked}
                    disabled={!canManage || isSaving}
                    onCheckedChange={(checked) => handleToggle(offering.key, checked)}
                    aria-label={getLabel(`labels.${offering.labelKey}`)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
