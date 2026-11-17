"use client";

import { useEffect, useState, useRef, useId } from "react";
import { usePathname } from "next/navigation";
import {
  IconHome,
  IconBuildingStore,
  IconToolsKitchen2,
  IconShoppingCart,
  IconDots,
  IconPhone,
  IconCalendar,
  IconX,
} from "@tabler/icons-react";
import type { ResolvedNavigationItem } from "@/lib/website-template-resolver";
import type { StorefrontFeatureState } from "@/lib/storefront-features";
import { getSitePageHref, resolveSiteHref } from "@/lib/site-paths";
import { sanitizeUrl } from "@/lib/sanitize-url";

export type MobileTabBarFeatures = Partial<StorefrontFeatureState> & { store?: boolean };

const isCommerceFeature = (f: string): f is keyof StorefrontFeatureState =>
  f === "ordering" || f === "delivery" || f === "pickup" || f === "reservations" || f === "onlinePayment";

export interface MobileTabBarProps {
  siteSlug: string;
  navigation: ResolvedNavigationItem[];
  storefrontFeatures?: MobileTabBarFeatures;
  activePageSlug?: string;
  labels?: {
    more?: string;
    cart?: string;
    close?: string;
  };
  cartSummary?: {
    count: number;
    subtotal?: number;
    currency?: string;
  };
}

export interface TabItem {
  key: string;
  label: string;
  href: string;
  pageSlug?: string | null;
  icon: "home" | "catalog" | "order" | "cart" | "more" | "contact" | "calendar";
  isCart?: boolean;
  isMore?: boolean;
}

export function buildMobileTabs(
  siteSlug: string,
  navigation: ResolvedNavigationItem[],
  storefrontFeatures?: MobileTabBarFeatures,
  labels?: { more?: string; cart?: string }
): { tabs: TabItem[]; overflow: ResolvedNavigationItem[] } {
  const visibleNav = navigation.filter((item) => {
    if (!item.feature || item.feature === "catalog") return true;
    if (isCommerceFeature(item.feature)) {
      return Boolean(storefrontFeatures?.[item.feature]);
    }
    return true;
  });

  const homeItem = visibleNav.find((i) => i.pageSlug === "home");
  const catalogItem = visibleNav.find((i) => i.feature === "catalog" || i.pageSlug === "menu" || i.pageSlug === "shop");
  const orderLive = Boolean(storefrontFeatures?.ordering);
  const orderItem = orderLive ? visibleNav.find((i) => i.feature === "ordering" || i.pageSlug === "order") : undefined;
  const hasCart = Boolean(storefrontFeatures?.ordering || storefrontFeatures?.store || storefrontFeatures?.onlinePayment);

  const mainTabs: TabItem[] = [];

  // 1. Home
  mainTabs.push({
    key: "home",
    label: homeItem?.label || "Home",
    href: sanitizeUrl(getSitePageHref(siteSlug, "home")),
    pageSlug: "home",
    icon: "home",
  });

  // 2. Catalog
  if (catalogItem) {
    const isStore = !storefrontFeatures?.ordering;
    mainTabs.push({
      key: "catalog",
      label: catalogItem.label || "Catalog",
      href: sanitizeUrl(catalogItem.pageSlug ? getSitePageHref(siteSlug, catalogItem.pageSlug, catalogItem.anchor) : resolveSiteHref(siteSlug, catalogItem.href)),
      pageSlug: catalogItem.pageSlug,
      icon: "catalog",
    });
  }

  // 3. Order (if ordering is live and separate from catalog)
  if (orderItem && orderItem !== catalogItem) {
    mainTabs.push({
      key: "order",
      label: orderItem.label || "Order",
      href: sanitizeUrl(orderItem.pageSlug ? getSitePageHref(siteSlug, orderItem.pageSlug, orderItem.anchor) : resolveSiteHref(siteSlug, orderItem.href)),
      pageSlug: orderItem.pageSlug,
      icon: "order",
    });
  }

  // 4. Cart tab (only if site has an active cart: ordering or store checkout)
  if (hasCart) {
    const cartTargetSlug = orderLive ? "order" : (catalogItem?.pageSlug || "menu");
    const cartHref = `${sanitizeUrl(getSitePageHref(siteSlug, cartTargetSlug))}?cart=1`;
    mainTabs.push({
      key: "cart",
      label: labels?.cart || "Cart",
      href: cartHref,
      pageSlug: cartTargetSlug,
      icon: "cart",
      isCart: true,
    });
  }

  // Remaining navigation items
  const coveredSlugs = new Set(mainTabs.map((t) => t.pageSlug).filter((s): s is string => Boolean(s)));
  const remaining = visibleNav.filter((i) => !i.pageSlug || !coveredSlugs.has(i.pageSlug));

  // If tabs + remaining <= 5, fill directly
  if (mainTabs.length + remaining.length <= 5) {
    for (const rem of remaining) {
      const isContact = rem.pageSlug === "contact";
      const isReservation = rem.pageSlug === "reservations" || rem.feature === "reservations";
      mainTabs.push({
        key: rem.id || rem.pageSlug || rem.label,
        label: rem.label,
        href: sanitizeUrl(rem.pageSlug ? getSitePageHref(siteSlug, rem.pageSlug, rem.anchor) : resolveSiteHref(siteSlug, rem.href)),
        pageSlug: rem.pageSlug,
        icon: isContact ? "contact" : isReservation ? "calendar" : "catalog",
      });
    }
    return { tabs: mainTabs, overflow: [] };
  }

  // Otherwise, cap at 4 tabs and put "More" as 5th
  const slotsBeforeMore = 4;
  while (mainTabs.length < slotsBeforeMore && remaining.length > 0) {
    const rem = remaining.shift()!;
    if (rem.pageSlug) {
      coveredSlugs.add(rem.pageSlug);
    }
    const isContact = rem.pageSlug === "contact";
    const isReservation = rem.pageSlug === "reservations" || rem.feature === "reservations";
    mainTabs.push({
      key: rem.id || rem.pageSlug || rem.label,
      label: rem.label,
      href: sanitizeUrl(rem.pageSlug ? getSitePageHref(siteSlug, rem.pageSlug, rem.anchor) : resolveSiteHref(siteSlug, rem.href)),
      pageSlug: rem.pageSlug,
      icon: isContact ? "contact" : isReservation ? "calendar" : "catalog",
    });
  }

  mainTabs.push({
    key: "more",
    label: labels?.more || "More",
    href: "#more",
    icon: "more",
    isMore: true,
  });

  return { tabs: mainTabs, overflow: remaining };
}

export function MobileTabBar({
  siteSlug,
  navigation,
  storefrontFeatures,
  activePageSlug = "home",
  labels,
  cartSummary: initialCartSummary,
}: MobileTabBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [cartSummary, setCartSummary] = useState(initialCartSummary || { count: 0 });
  const sheetId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const readSummary = () => {
      try {
        const raw = localStorage.getItem(`aldriva_cart_summary_${siteSlug}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.count === "number") {
            setCartSummary(parsed);
          }
        }
      } catch {
        // Storage access unavailable
      }
    };

    readSummary();

    const handleUpdate = () => readSummary();
    window.addEventListener("aldriva:cart-summary-updated", handleUpdate);
    return () => {
      window.removeEventListener("aldriva:cart-summary-updated", handleUpdate);
    };
  }, [siteSlug]);

  const { tabs, overflow } = buildMobileTabs(siteSlug, navigation, storefrontFeatures, labels);

  const handleTabClick = (tab: TabItem, event: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    if (tab.isMore) {
      event.preventDefault();
      setMoreOpen(true);
      return;
    }

    if (tab.isCart) {
      // Check if already on the cart destination page
      const currentIsTarget = tab.pageSlug === activePageSlug || (activePageSlug === "home" && tab.pageSlug === "home");
      if (currentIsTarget) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("aldriva:open-cart-drawer"));
      }
    }
  };

  const renderIcon = (icon: TabItem["icon"]) => {
    const props = { size: 20, strokeWidth: 1.75, "aria-hidden": "true" as const };
    switch (icon) {
      case "home":
        return <IconHome {...props} />;
      case "catalog":
        return <IconBuildingStore {...props} />;
      case "order":
        return <IconToolsKitchen2 {...props} />;
      case "cart":
        return <IconShoppingCart {...props} />;
      case "contact":
        return <IconPhone {...props} />;
      case "calendar":
        return <IconCalendar {...props} />;
      case "more":
      default:
        return <IconDots {...props} />;
    }
  };

  return (
    <>
      <style>{`
        @media (max-width: 767px) {
          :root {
            --mobile-cart-bar-offset: calc(3.5rem + env(safe-area-inset-bottom) + 0.75rem);
          }
        }
      `}</style>
      <nav
        aria-label="Mobile navigation bar"
        className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-center justify-around rounded-t-2xl border-t border-[var(--tf-border)] bg-[var(--tf-base)] px-2 pb-[env(safe-area-inset-bottom)] text-[var(--tf-on-base)] md:hidden shadow-lg"
      >
        {tabs.map((tab) => {
          const isActive = tab.pageSlug ? tab.pageSlug === activePageSlug : false;
          const isCurrentCart = tab.isCart;
          const badgeCount = isCurrentCart ? cartSummary.count : 0;

          const content = (
            <span className="relative flex flex-col items-center justify-center gap-0.5">
              <span className={isActive ? "text-[var(--tf-accent)]" : "text-[var(--tf-muted)]"}>
                {renderIcon(tab.icon)}
              </span>
              <span
                className={`text-[10px] leading-none ${
                  isActive ? "text-[var(--tf-accent)] font-bold" : "text-[var(--tf-muted)] font-medium"
                }`}
              >
                {tab.label}
              </span>
              {badgeCount > 0 ? (
                <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--tf-accent)] px-1 text-[9px] font-bold text-[var(--tf-on-accent)]">
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              ) : null}
            </span>
          );

          if (tab.isMore) {
            return (
              <button
                key={tab.key}
                ref={triggerRef}
                type="button"
                onClick={(e) => handleTabClick(tab, e)}
                className="flex flex-1 flex-col items-center justify-center py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-accent)]"
                aria-label={tab.label}
                aria-expanded={moreOpen}
                aria-controls={sheetId}
              >
                {content}
              </button>
            );
          }

          return (
            <a
              key={tab.key}
              href={tab.href}
              onClick={(e) => handleTabClick(tab, e)}
              className="flex flex-1 flex-col items-center justify-center py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-accent)]"
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
            >
              {content}
            </a>
          );
        })}
      </nav>

      {/* Overflow Bottom Sheet */}
      {moreOpen ? (
        <div
          id={sheetId}
          role="dialog"
          aria-modal="true"
          aria-label={labels?.more || "More"}
          className="fixed inset-0 z-50 flex flex-col justify-end bg-[var(--tf-scrim)]/60 md:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="w-full rounded-t-2xl border-t border-[var(--tf-border)] bg-[var(--tf-base)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-[var(--tf-on-base)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between border-b border-[var(--tf-border)] pb-2">
              <span className="text-sm font-bold text-[var(--tf-ink)]">
                {labels?.more || "More"}
              </span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="rounded-full p-1 text-[var(--tf-muted)] hover:bg-[var(--tf-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-accent)]"
                aria-label={labels?.close || "Close"}
              >
                <IconX size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="flex flex-col divide-y divide-[var(--tf-border)]">
              {overflow.map((item) => {
                const scopedHref = item.pageSlug
                  ? getSitePageHref(siteSlug, item.pageSlug, item.anchor)
                  : resolveSiteHref(siteSlug, item.href);
                const href = sanitizeUrl(scopedHref);
                return (
                  <a
                    key={item.id}
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    className="flex items-center justify-between py-3 text-sm font-medium text-[var(--tf-ink)] hover:text-[var(--tf-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-accent)]"
                  >
                    <span>{item.label}</span>
                    <span className="text-[var(--tf-muted)]">→</span>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
