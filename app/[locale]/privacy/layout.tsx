import type { ReactNode } from "react";
import { MarketingSection } from "@/components/footers";

// Public legal page → full marketing footer.
export default function PrivacyLayout({ children }: { children: ReactNode }) {
  return <MarketingSection>{children}</MarketingSection>;
}
