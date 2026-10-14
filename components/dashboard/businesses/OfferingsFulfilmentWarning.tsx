"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { isFulfilmentMissing } from "@/lib/storefront-features";

export function OfferingsFulfilmentWarning({
  offerings,
  className = "",
}: {
  offerings: readonly string[] | null | undefined;
  className?: string;
}) {
  const t = useTranslations("BusinessOfferings");

  if (!isFulfilmentMissing(offerings)) {
    return null;
  }

  return (
    <div
      role="alert"
      className={`flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200 ${className}`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <div className="space-y-0.5">
        <p className="font-semibold text-amber-900 dark:text-amber-100">{t("fulfilmentWarningTitle")}</p>
        <p className="text-amber-800 dark:text-amber-300">{t("fulfilmentWarning")}</p>
      </div>
    </div>
  );
}
