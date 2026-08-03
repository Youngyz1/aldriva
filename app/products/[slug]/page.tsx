import { notFound } from "next/navigation";
import Link from "next/link";
import { Metadata } from "next";
import Stripe from "stripe";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import { compactJsonLd, jsonLdScriptValue } from "@/lib/structured-data";
import BuyProductButton from "./BuyProductButton";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import { getSiteUrl } from "@/lib/site-url";

async function fetchAndGateProduct(slug: string) {
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

  return { product, ownerProfile, isAuthorized, isRestricted, unitPrice, currency };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const adminClient = createSupabaseAdmin();
  const { data: product } = await adminClient
    .from("products")
    .select("name, slug, description, seo_title, seo_description, images")
    .eq("slug", slug)
    .maybeSingle();

  if (!product) {
    return { title: "Product — Aldriva" };
  }

  const siteUrl = getSiteUrl();
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
      images: product.images?.length ? [{ url: product.images[0] }] : [],
    },
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await fetchAndGateProduct(slug);

  if (!result || (result.isRestricted && !result.isAuthorized)) {
    notFound();
  }

  const { product, ownerProfile, isAuthorized, isRestricted, unitPrice, currency } = result;
  const business = (product as any).businesses as { id: string; name: string; slug: string } | null;
  const authorName = ownerProfile?.display_name || "Aldriva Seller";
  const outOfStock = product.status === "out_of_stock";
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
            {product.images?.[0] ? (
              <img
                src={product.images[0]}
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
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-black text-orange-700">
                  {product.price_type === "subscription" ? "Subscription" : "One-time"}
                </span>
                {outOfStock && (
                  <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-black text-amber-700">
                    Out of Stock
                  </span>
                )}
              </div>
              <h1 className="text-3xl font-black text-zinc-950">{product.name}</h1>
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

            {product.stock_quantity !== null && (
              <p className="text-sm font-bold text-zinc-500">
                {product.stock_quantity > 0 ? `${product.stock_quantity} in stock` : "Currently out of stock"}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              {!outOfStock && !isRestricted && (
                <BuyProductButton
                  productId={product.id}
                  priceLabel={priceLabel}
                  priceType={product.price_type}
                  stockQuantity={product.stock_quantity}
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
      </main>
    </>
  );
}
