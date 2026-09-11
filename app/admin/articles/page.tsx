import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import ArticlesClient from "./ArticlesClient";

export default async function AdminArticlesPage() {
  // Explicit gate (F-10): do not rely solely on the layout header shortcut.
  await requireAdmin();
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
        </div>
      }
    >
      <ArticlesClient />
    </Suspense>
  );
}
