import Link from "next/link";
import { IconShoppingBag as ShoppingBag, IconArrowRight as ArrowRight } from "@tabler/icons-react";
import { AccountBlockRow } from "./AccountBlockRow";
import type { ProductItem } from "@/lib/dashboard/account-blocks-registry";

interface ProductsBlockProps {
  products: ProductItem[];
}

export function ProductsBlock({ products }: ProductsBlockProps) {
  if (products.length === 0) return null;

  const showViewAll = products.length > 3;
  const displayedProducts = products.slice(0, 3);

  return (
    <section className="rounded-xl border border-zinc-200/80 bg-white p-4 sm:p-5">
      <header className="flex items-center justify-between gap-3 pb-3 border-b border-zinc-100">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200/80 bg-zinc-50 text-zinc-700">
            <ShoppingBag className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-black text-zinc-950">Products</h2>
            <p className="text-xs text-zinc-500">Items and catalog products you sell</p>
          </div>
        </div>

        {showViewAll && (
          <Link
            href="/dashboard/products"
            className="flex min-h-[44px] items-center gap-1 text-xs font-bold text-orange-700 hover:text-orange-800 hover:underline transition"
          >
            <span>View all ({products.length})</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </header>

      <div className="divide-y divide-zinc-100 pt-1">
        {displayedProducts.map((p) => (
          <AccountBlockRow
            key={p.id}
            id={p.id}
            title={p.name || "Untitled Product"}
            status={p.status}
            createdAt={p.created_at}
            href={p.href}
            actionLabel="Edit"
          />
        ))}
      </div>
    </section>
  );
}
