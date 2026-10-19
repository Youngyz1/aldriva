"use client";

/**
 * lib/store-cart.ts
 *
 * Multi-item cart state for published Store websites. A tiny external store
 * (no provider to mount) keyed by site slug and persisted to localStorage —
 * the same pattern as the menu-ordering cart in StorefrontBrowse, but scoped
 * to `aldriva_store_cart_<slug>` so the two flows never share items.
 *
 * Items carry identity only ({productId, quantity}); prices, stock, and
 * ownership are always re-validated server-side at checkout.
 */

import { useSyncExternalStore } from "react";

export interface StoreCartItem {
  productId: string;
  quantity: number;
}

export const STORE_CART_MAX_ITEMS = 12;
export const STORE_CART_MAX_QUANTITY = 100;

function storageKey(slug: string): string {
  return `aldriva_store_cart_${slug}`;
}

function readCart(slug: string): StoreCartItem[] {
  if (typeof window === "undefined" || !slug) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    if (!raw) return [];
    return normalizeCartItems(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Pure: coerce unknown input into a bounded, de-duplicated item list. */
export function normalizeCartItems(value: unknown): StoreCartItem[] {
  if (!Array.isArray(value)) return [];
  const merged = new Map<string, number>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { productId, quantity } = entry as {
      productId?: unknown;
      quantity?: unknown;
    };
    if (typeof productId !== "string" || productId.trim() === "") continue;
    const qty = typeof quantity === "number" ? Math.floor(quantity) : 1;
    if (!Number.isFinite(qty) || qty < 1) continue;
    const id = productId.trim();
    merged.set(id, Math.min(STORE_CART_MAX_QUANTITY, (merged.get(id) ?? 0) + qty));
    if (merged.size >= STORE_CART_MAX_ITEMS) break;
  }
  return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();
const cache = new Map<string, StoreCartItem[]>();

function snapshot(slug: string): StoreCartItem[] {
  const cached = cache.get(slug);
  if (cached) return cached;
  const fresh = readCart(slug);
  cache.set(slug, fresh);
  return fresh;
}

function emit(slug: string): void {
  cache.delete(slug);
  listeners.get(slug)?.forEach((fn) => fn());
}

function persist(slug: string, items: StoreCartItem[]): void {
  try {
    if (items.length === 0) {
      window.localStorage.removeItem(storageKey(slug));
    } else {
      window.localStorage.setItem(storageKey(slug), JSON.stringify(items));
    }
  } catch {
    // Private mode / quota: cart stays in memory for the session.
  }
  cache.set(slug, items);
  emit(slug);
}

function subscribe(slug: string, fn: Listener): () => void {
  let set = listeners.get(slug);
  if (!set) {
    set = new Set();
    listeners.set(slug, set);
  }
  set.add(fn);
  return () => {
    set?.delete(fn);
  };
}

export function addStoreCartItem(slug: string, productId: string, quantity = 1): StoreCartItem[] {
  const next = normalizeCartItems([...snapshot(slug), { productId, quantity }]);
  persist(slug, next);
  return next;
}

export function setStoreCartQuantity(slug: string, productId: string, quantity: number): StoreCartItem[] {
  const current = snapshot(slug).filter((item) => item.productId !== productId);
  const next =
    quantity < 1
      ? current
      : normalizeCartItems([...current, { productId, quantity }]);
  persist(slug, next);
  return next;
}

export function removeStoreCartItem(slug: string, productId: string): StoreCartItem[] {
  const next = snapshot(slug).filter((item) => item.productId !== productId);
  persist(slug, next);
  return next;
}

export function clearStoreCart(slug: string): void {
  persist(slug, []);
}

/** React binding for one site's cart. Stable across renders; SSR-safe. */
export function useStoreCart(slug: string): {
  items: StoreCartItem[];
  count: number;
  add: (productId: string, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
} {
  const items = useSyncExternalStore(
    (fn) => subscribe(slug, fn),
    () => snapshot(slug),
    () => []
  );
  return {
    items,
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    add: (productId, quantity = 1) => {
      addStoreCartItem(slug, productId, quantity);
    },
    setQuantity: (productId, quantity) => {
      setStoreCartQuantity(slug, productId, quantity);
    },
    remove: (productId) => {
      removeStoreCartItem(slug, productId);
    },
    clear: () => {
      clearStoreCart(slug);
    },
  };
}
