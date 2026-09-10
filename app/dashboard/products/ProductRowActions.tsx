"use client";

import Link from "next/link";
import { useRef } from "react";
import RowActionsMenu from "@/components/dashboard/RowActionsMenu";

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
  const deleteFormRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex items-center justify-end gap-2">
      <Link
        href={`/dashboard/products/${product.id}/edit`}
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
      >
        Edit
      </Link>

      <RowActionsMenu
        ariaLabel={`Actions for product ${product.slug}`}
        items={[
          ...(canViewPublic
            ? [{ key: "view", label: "View Public", href: `/products/${product.slug}`, external: true }]
            : []),
          {
            key: "delete",
            label: "Delete",
            destructive: true,
            disabled: !canDelete,
            disabledReason: canDelete ? undefined : "Archive this product before deleting it.",
            onSelect: () => deleteFormRef.current?.requestSubmit(),
          },
        ]}
      />

      {/* Hidden delete form: preserves the existing server action + confirm. */}
      <form
        ref={deleteFormRef}
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
        className="hidden"
        aria-hidden="true"
      >
        <input type="hidden" name="id" value={product.id} />
      </form>
    </div>
  );
}
