"use client";

import Link from "next/link";

type Product = {
  id: string;
  slug: string;
  status: string;
};

export default function ProductRowActions({
  product,
  onDelete,
}: {
  product: Product;
  onDelete: (formData: FormData) => Promise<void>;
}) {
  const canDelete = product.status === "archived";
  const canViewPublic = product.status === "active" || product.status === "out_of_stock";

  return (
    <div className="flex items-center justify-end gap-2">
      {canViewPublic && (
        <Link
          href={`/products/${product.slug}`}
          target="_blank"
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
        >
          View Public
        </Link>
      )}

      <Link
        href={`/dashboard/products/${product.id}/edit`}
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
      >
        Edit
      </Link>

      <form
        action={onDelete}
        onSubmit={(e) => {
          if (!canDelete) {
            e.preventDefault();
            return;
          }
          if (!confirm("Are you sure you want to delete this product?")) {
            e.preventDefault();
          }
        }}
        className="inline-block"
      >
        <input type="hidden" name="id" value={product.id} />
        <button
          type="submit"
          disabled={!canDelete}
          title={canDelete ? undefined : "Archive this product before deleting it."}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition"
        >
          Delete
        </button>
      </form>
    </div>
  );
}
