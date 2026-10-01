import { ReactNode, Suspense } from "react";
import DashboardSidebar from "./DashboardSidebar";
import DashboardLayoutClient from "./DashboardLayoutClient";
import type { Locale } from "@/i18n/routing";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <DashboardLayoutClient
      sidebar={
        <Suspense fallback={null}>
          <DashboardSidebar locale={locale as Locale} />
        </Suspense>
      }
    >
      {children}
    </DashboardLayoutClient>
  );
}