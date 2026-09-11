import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import UsersClient from "./UsersClient";

export default async function AdminUsersPage() {
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
      <UsersClient />
    </Suspense>
  );
}
