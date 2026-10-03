import { ReactNode, Suspense } from "react";
import DashboardSidebar from "./DashboardSidebar";
import DashboardLayoutClient from "./DashboardLayoutClient";

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <DashboardLayoutClient
      sidebar={
        <Suspense fallback={null}>
          <DashboardSidebar />
        </Suspense>
      }
    >
      {children}
    </DashboardLayoutClient>
  );
}