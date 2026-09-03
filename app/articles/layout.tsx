import type { ReactNode } from "react";
import { MarketingSection } from "@/components/footers";

// Public article discovery (list, category, tag — details live under the
// gated group with the compact tier) → full marketing footer.
export default function ArticlesLayout({ children }: { children: ReactNode }) {
  return <MarketingSection>{children}</MarketingSection>;
}
