import "server-only";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { Metadata } from "next";
import Stripe from "stripe";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import { compactJsonLd, jsonLdScriptValue } from "@/lib/structured-data";
import BuyProductButton from "./BuyProductButton";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import { getSiteUrl } from "@/lib/site-url";
import {
  DIGITAL_LICENSE_LABELS,
  PRODUCT_TYPE_LABELS,
  assetExtensionOf,
  formatFileSize,
  isDigitalProductType,
} from "@/lib/digital-products";

export const instant = false;

// The real HTTP 404 is enforced by proxy.ts (checkProductAccess) before
// streaming begins — connection() here is a secondary defense matching
// articles/[slug]'s fetchAndGate, in case this function is ever reached
// through a path the proxy matcher doesn't cover.
async function fetchAndGateProduct(slug: string) {
  await connection();

  const adminClient = createSupabaseAdmin();
  const supabaseServer = await createSupabaseServer();

  const { data: product } = await adminClient
    .from("products")
    .select("*, businesses(id, name, slug)")
    .eq("slug", slug)
    .maybeSingle();

  if (!product) {
    return null;
  }

  const { data: ownerProfile } = await adminClient
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", product.owner_id)
    .maybeSingle();

  // Digital assets: metadata only (never file_path — delivery is exclusively
  // via the signed-URL download route after a paid-order check).
  const { data: assets } = await adminClient
    .from("product_assets")
    .select("id, file_name, mime_type, file_size_bytes, is_preview, version")
    .eq("product_id", product.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  const {
    data: { user },
  } = await supabaseServer.auth.getUser();

  let isAuthorized = false;
  if (user) {
    if (user.id === product.owner_id) {
      isAuthorized = true;
    } else {
      const { data: profile } = await supabaseServer
        .from("profiles")
        .select("role, status")
        .eq("id", user.id)
        .single();
      if (profile?.role === "admin" && profile?.status === "active") {
        isAuthorized = true;
      }
    }
  }

  const isRestricted = product.status === "archived";

  // Live price lookup — same source of truth the checkout routes use, so
  // the displayed price and JSON-LD Offer never drift from what's charged.
  let unitPrice: number | null = null;
  let currency = "usd";
  if (product.stripe_price_id && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const price = await stripe.prices.retrieve(product.stripe_price_id);
      unitPrice = (price.unit_amount ?? 0) / 100;
      currency = price.currency || "usd";
    } catch (err) {
      console.error(`[products/${slug}] Failed to fetch Stripe price:`, err);
    }
  }

  return { product, ownerProfile, assets: assets ?? [], isAuthorized, isRestricted, unitPrice, currency };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  const adminClient = createSupabaseAdmin();
  const { data: product } = await adminClient
    .from("products")
    .select("name, slug, description, subtitle, seo_title, seo_description, images, cover_image_url")
    .eq("slug", slug)
    .maybeSingle();

  if (!product) {
    return { title: "Product — Aldriva" };
  }

  const siteUrl = getSiteUrl();
  const coverForMeta =
    (product as { cover_image_url?: string | null }).cover_image_url ||
    (product.images?.length ? product.images[0] : null);
  return {
    title: `${product.name} — Aldriva Shop`,
    description: product.seo_description || product.description.slice(0, 160),
    alternates: {
      canonical: `${siteUrl}/products/${product.slug}`,
    },
    openGraph: {
      title: product.seo_title || `${product.name} — Aldriva Shop`,
      description: product.seo_description || product.description.slice(0, 160),
      url: `${siteUrl}/products/${product.slug}`,
      images: coverForMeta ? [{ url: coverForMeta }] : [],
    },
  };
}

import { Suspense } from "react";

function ProductDetailSkeleton() {
  return (
    <div className="mx-auto max-w-[1000px] px-4 py-8 md:px-6 md:py-12 space-y-8 animate-pulse">
      <div className="h-4 w-32 bg-zinc-200 rounded" />
      <div className="grid gap-8 md:grid-cols-2">
        <div className="h-80 bg-zinc-200 rounded-2xl" />
        <div className="space-y-4">
          <div className="h-8 w-48 bg-zinc-200 rounded" />
          <div className="h-6 w-24 bg-zinc-200 rounded" />
          <div className="h-24 bg-zinc-200 rounded" />
        </div>
      </div>
    </div>
  );
}

async function ProductDetailContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await fetchAndGateProduct(slug);

  // No product found, or restricted for this user. Note: real HTTP 404 is
  // enforced by proxy.ts (checkProductAccess) before streaming begins. This
  // is a secondary defense for edge cases.
  if (!result || (result.isRestricted && !result.isAuthorized)) {
    notFound();
  }

  const { product, ownerProfile, assets, isAuthorized, isRestricted, unitPrice, currency } = result;
  const business = (product as any).businesses as { id: string; name: string; slug: string } | null;
  const authorName = ownerProfile?.display_name || "Aldriva Seller";
  const outOfStock = product.status === "out_of_stock";
  const digital = isDigitalProductType((product as { product_type?: string | null }).product_type);
  const coverImage =
    (product as { cover_image_url?: string | null }).cover_image_url || product.images?.[0] || null;
  const previewImages = ((product as { preview_images?: string[] | null }).preview_images || []).slice(0, 8);
  const licenseLabel =
    (DIGITAL_LICENSE_LABELS as Record<string, string>)[
      (product as { license?: string | null }).license || "personal"
    ] || "Personal use";
  const fileTypes = Array.from(
    new Set(
      (assets as { file_name: string }[])
        .map((a) => assetExtensionOf(a.file_name).replace(".", "").toUpperCase())
        .filter(Boolean)
    )
  );
  const totalBytes = (assets as { file_size_bytes: number }[]).reduce(
    (sum, a) => sum + (a.file_size_bytes || 0),
    0
  );
  const priceLabel = unitPrice !== null
    ? unitPrice.toLocaleString(undefined, { style: "currency", currency: currency.toUpperCase() })
    : "—";

  const siteUrl = getSiteUrl();
  const jsonLd = compactJsonLd({
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.images?.length ? product.images : undefined,
    url: `${siteUrl}/products/${product.slug}`,
    offers: {
      "@type": "Offer",
      price: unitPrice !== null ? unitPrice.toFixed(2) : undefined,
      priceCurrency: currency.toUpperCase(),
      availability: outOfStock
        ? "https://schema.org/OutOfStock"
        : "https://schema.org/InStock",
      url: `${siteUrl}/products/${product.slug}`,
    },
  });

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScriptValue(jsonLd) }}
        />
      )}

      <main className="mx-auto max-w-[1000px] px-4 py-8 md:px-6 md:py-12 space-y-8">
        {/* Back Link */}
        <Link
          href="/products"
          className="inline-flex items-center text-sm font-bold text-zinc-500 hover:text-orange-600 transition"
        >
          ← Back to shop
        </Link>

        {/* Warning Banner */}
        {isAuthorized && isRestricted && (
          <div className="rounded-xl bg-orange-50 border border-orange-200 p-4 text-sm font-semibold text-orange-800">
            <span className="font-bold">Preview Mode:</span> You are viewing this product as the owner/admin.
            <span> The status is currently <span className="underline font-bold">{product.status}</span>.</span>
          </div>
        )}

        {/* Product Hero */}
        <div className="grid gap-8 md:grid-cols-2">
          {/* Image */}
          <div className="aspect-square w-full overflow-hidden rounded-2xl border border-zinc-150 bg-slate-100 shadow-sm">
            {coverImage ? (
              <img
                src={coverImage}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <LocalBrandedPlaceholder
                variant="general"
                title={product.name}
                initials={product.name.slice(0, 2).toUpperCase()}
                className="from-transparent to-transparent text-5xl text-slate-400"
              />
            )}
          </div>

          {/* Details */}
          <div className="space-y-5">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="inline-flex rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-black text-orange-700">
                  {digital
                    ? (PRODUCT_TYPE_LABELS as Record<string, string>)[
                        (product as { product_type?: string }).product_type || "other"
                      ] || "Digital product"
                    : product.price_type === "subscription"
                      ? "Subscription"
                      : "One-time"}
                </span>
                {digital && (
                  <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-black text-zinc-600">
                    Digital download
                  </span>
                )}
                {outOfStock && (
                  <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-black text-amber-700">
                    Out of Stock
                  </span>
                )}
              </div>
              <h1 className="text-3xl font-black text-zinc-950">{product.name}</h1>
              {(product as { subtitle?: string | null }).subtitle && (
                <p className="mt-1 text-base font-semibold text-zinc-500">
                  {(product as { subtitle?: string }).subtitle}
                </p>
              )}
              {business && (
                <p className="text-sm font-bold text-zinc-400 mt-0.5">
                  Sold by{" "}
                  <Link href={`/businesses/${business.slug}`} className="text-orange-600 hover:underline">
                    {business.name}
                  </Link>
                </p>
              )}
            </div>

            <div className="text-3xl font-black text-zinc-950">
              {priceLabel}
              {product.price_type === "subscription" && (
                <span className="text-base font-bold text-zinc-400">/mo</span>
              )}
            </div>

            <p className="text-zinc-700 font-semibold leading-relaxed whitespace-pre-line">
              {product.description}
            </p>

            {digital ? (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-zinc-500">
                <span>Version {(product as { version?: string }).version || "1.0"}</span>
                <span>{licenseLabel}</span>
                {fileTypes.length > 0 && <span>{fileTypes.join(" · ")}</span>}
              </div>
            ) : (
              product.stock_quantity !== null && (
                <p className="text-sm font-bold text-zinc-500">
                  {product.stock_quantity > 0 ? `${product.stock_quantity} in stock` : "Currently out of stock"}
                </p>
              )
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              {!outOfStock && !isRestricted && (
                <BuyProductButton
                  productId={product.id}
                  priceLabel={priceLabel}
                  priceType={product.price_type}
                  stockQuantity={digital ? null : product.stock_quantity}
                  isDigital={digital}
                />
              )}
              {isAuthorized && (
                <Link
                  href={`/dashboard/products/${product.id}/edit`}
                  className="flex-1 md:flex-none inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-center text-sm font-bold text-zinc-700 hover:bg-zinc-50 transition"
                >
                  Edit Listing
                </Link>
              )}
            </div>

            <div className="border-t border-zinc-100 pt-4">
              <span className="block text-xs font-bold text-zinc-400 uppercase">Seller</span>
              <span className="text-sm font-bold text-zinc-700">{authorName}</span>
            </div>
          </div>
        </div>

        {digital && previewImages.length > 0 && (
          <section>
            <h2 className="text-xl font-black text-zinc-950 mb-4">Preview</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {previewImages.map((src, i) => (
                <div key={src + i} className="overflow-hidden rounded-2xl border border-zinc-150 bg-slate-100">
                  <img src={src} alt={`${product.name} preview ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
                </div>
              ))}
            </div>
          </section>
        )}

        {digital && assets.length > 0 && (
          <section className="rounded-2xl border border-zinc-150 bg-white p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xl font-black text-zinc-950">What&apos;s included</h2>
              <span className="text-xs font-bold text-zinc-400">
                {assets.length} file{assets.length === 1 ? "" : "s"}
                {totalBytes > 0 ? ` · ${formatFileSize(totalBytes)}` : ""}
              </span>
            </div>
            <p className="text-sm font-semibold text-zinc-500 mb-4">
              Instant download after payment. Files are always available in your library.
            </p>
            <ul className="divide-y divide-zinc-100">
              {(assets as { id: string; file_name: string; mime_type: string; file_size_bytes: number; version: string }[]).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-zinc-900">{a.file_name}</p>
                    <p className="text-xs font-semibold text-zinc-400">
                      {assetExtensionOf(a.file_name).replace(".", "").toUpperCase() || a.mime_type} · {formatFileSize(a.file_size_bytes)} · v{a.version}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">
                    Included
                  </span>
                </li>
              ))}
            </ul>
            {(product as { update_policy?: string | null }).update_policy && (
              <p className="mt-4 border-t border-zinc-100 pt-4 text-sm font-semibold text-zinc-500">
                Updates: {(product as { update_policy?: string }).update_policy}
              </p>
            )}
          </section>
        )}
      </main>
    </>
  );
}

// Signals to Next.js that this page intentionally defers to request time,
// matching the dynamic generateMetadata above.
// See: https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime
const Connection = async () => {
  await connection();
  return null;
};

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <>
      <Suspense>
        <Connection />
      </Suspense>
      <Suspense fallback={<ProductDetailSkeleton />}>
        <ProductDetailContent params={params} />
      </Suspense>
    </>
  );
}
