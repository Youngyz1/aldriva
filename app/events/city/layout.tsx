import type { ReactNode } from "react";
import { MarketingSection } from "@/components/footers";

// City event discovery → full marketing footer.
export default function EventsCityLayout({ children }: { children: ReactNode }) {
  return <MarketingSection>{children}</MarketingSection>;
}
