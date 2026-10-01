import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ShoppingBag } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import { MarketingSection } from "@/components/footers";
import {
  PRODUCT_TYPE_LABELS,
  assetExtensionOf,
  formatFileSize,
  isDigitalProductType,
} from "@/lib/digital-products";
import LibraryAssetButton from "./LibraryAssetButton";

export const metadata: Metadata = {
  title: "My Library — Aldriva Shop",
  description: "Your purchased digital products, ready to download anytime.",
};

type LibraryAsset = {
  id: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  version: string;
};

type LibraryItem = {
  orderId: string;
  purchasedAt: string;
  product: {
    id: string;
    name: string;
    slug: string;
    product_type: string | null;
    cover_image_url: string | null;
    images: string[] | null;
    version: string | null;
    license: string | null;
  };
  assets: LibraryAsset[];
};

/**
 * /products/library — the buyer's "My Library". Auth-gated (redirects to
 * login, like the dashboard). Shows every product with a PAID order for the
 * viewer: account orders plus guest orders placed with the account email
 * (same proof the download route accepts). file_path values never leave the
 * server — downloads go through the signed-URL route per asset.
 */
export default async function LibraryPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?redirect=/products/library");
  }

  const admin = createSupabaseAdmin();

  // Account orders + guest orders on the same email (bought pre-signup).
  // The email clause is only added when the account has an email — an empty
  // ilike pattern must never widen the match.
  const buyerFilter = user.email
    ? `buyer_id.eq.${user.id},and(buyer_id.is.null,buyer_email.ilike.${user.email})`
    : `buyer_id.eq.${user.id}`;
  const { data: orders } = await admin
    .from("product_orders")
    .select(
      "id, product_id, buyer_id, buyer_email, created_at, product:products(id, name, slug, product_type, cover_image_url, images, version, license)"
    )
    .eq("status", "paid")
    .or(buyerFilter)
    .order("created_at", { ascending: false });

  const items: LibraryItem[] = [];
  const seenProducts = new Set<string>();

  // ilike is case-insensitive LIKE: '_'/'%' in an email act as wildcards, so
  // email-matched guest rows are re-checked with an exact comparison here
  // before display (the download route enforces the same exact match).
  const viewerEmail = (user.email ?? "").trim().toLowerCase();

  for (const row of ((orders ?? []) as unknown) as Array<{
    id: string;
    product_id: string;
    buyer_id: string | null;
    buyer_email: string | null;
    created_at: string;
    product: LibraryItem["product"] | null;
  }>) {
    if (!row.product || seenProducts.has(row.product_id)) continue;
    if (row.buyer_id !== user.id) {
      const orderEmail = (row.buyer_email ?? "").trim().toLowerCase();
      if (!viewerEmail || !orderEmail || viewerEmail !== orderEmail) continue;
    }
    seenProducts.add(row.product_id);

    const { data: assets } = await admin
      .from("product_assets")
      .select("id, file_name, mime_type, file_size_bytes, version")
      .eq("product_id", row.product_id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    items.push({
      orderId: row.id,
      purchasedAt: row.created_at,
      product: row.product,
      assets: (assets ?? []) as LibraryAsset[],
    });
  }

  return (
    <MarketingSection>
      <main className="mx-auto max-w-[1000px] px-4 py-8 md:px-6 md:py-12">
        <div className="mb-8">
          <p className="text-xs font-black uppercase tracking-wider text-orange-600 mb-1">
            <Link href="/products" className="hover:underline">Shop</Link> / Library
          </p>
          <h1 className="text-3xl font-black tracking-tight text-zinc-950">My Library</h1>
          <p className="mt-2 text-sm font-semibold text-zinc-500">
            Every digital product you&apos;ve purchased — download anytime.
          </p>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-zinc-200 bg-white p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 mb-4">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Nothing here yet</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500 max-w-sm">
              Products you buy will appear here with instant downloads.
            </p>
            <Link
              href="/products"
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-700 transition"
            >
              Browse the Shop
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              const cover = item.product.cover_image_url || item.product.images?.[0];
              const typeLabel =
                (PRODUCT_TYPE_LABELS as Record<string, string>)[item.product.product_type || "other"] ||
                "Product";
              return (
                <article
                  key={item.product.id}
                  className="rounded-2xl border border-zinc-200 bg-white p-5"
                >
                  <div className="flex items-start gap-4">
                    {cover ? (
                      <img
                        src={cover}
                        alt={item.product.name}
                        className="h-16 w-16 shrink-0 rounded-xl border border-zinc-100 object-cover"
                      />
                    ) : (
                      <LocalBrandedPlaceholder
                        variant="general"
                        title={item.product.name}
                        initials={item.product.name.slice(0, 2).toUpperCase()}
                        className="h-16 w-16 shrink-0 rounded-xl text-xl text-slate-400"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-orange-700">
                          {isDigitalProductType(item.product.product_type) ? typeLabel : "Product"}
                        </span>
                        {(item.product.version || item.product.license) && (
                          <span className="text-[11px] font-bold text-zinc-400">
                            {[item.product.version ? `v${item.product.version}` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                      </div>
                      <h2 className="mt-1 truncate text-base font-black text-zinc-900">
                        <Link href={`/products/${item.product.slug}`} className="hover:text-orange-600 transition">
                          {item.product.name}
                        </Link>
                      </h2>
                      <p className="text-xs font-semibold text-zinc-400">
                        Purchased{" "}
                        {new Date(item.purchasedAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                  </div>

                  {item.assets.length > 0 ? (
                    <ul className="mt-4 divide-y divide-zinc-100 border-t border-zinc-100">
                      {item.assets.map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-zinc-800">{a.file_name}</p>
                            <p className="text-xs font-semibold text-zinc-400">
                              {assetExtensionOf(a.file_name).replace(".", "").toUpperCase() || a.mime_type} ·{" "}
                              {formatFileSize(a.file_size_bytes)} · v{a.version}
                            </p>
                          </div>
                          <LibraryAssetButton
                            productId={item.product.id}
                            assetId={a.id}
                            fileName={a.file_name}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-4 border-t border-zinc-100 pt-3 text-xs font-semibold text-zinc-400">
                      No downloadable files attached to this product.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </main>
    </MarketingSection>
  );
}
