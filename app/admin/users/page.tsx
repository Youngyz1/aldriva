import { Suspense } from "react";
import UsersClient from "./UsersClient";

export default function AdminUsersPage() {
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
