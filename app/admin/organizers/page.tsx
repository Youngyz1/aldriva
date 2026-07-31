import { Suspense } from "react";
import OrganizersClient from "./OrganizersClient";

export default function AdminOrganizersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
        </div>
      }
    >
      <OrganizersClient />
    </Suspense>
  );
}
