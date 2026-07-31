import { Suspense } from "react";
import ArticlesClient from "./ArticlesClient";

export default function AdminArticlesPage() {
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
