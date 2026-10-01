import type { ReactNode } from "react";
import { MarketingSection } from "@/components/footers";

// Public marketing page → full marketing footer.
export default function AboutLayout({ children }: { children: ReactNode }) {
  return <MarketingSection>{children}</MarketingSection>;
}
