import type { ReactNode } from "react";
import { MarketingSection } from "@/components/footers";

// Public business discovery (details live under the gated group with the
// compact tier) → full marketing footer.
export default function BusinessesLayout({ children }: { children: ReactNode }) {
  return <MarketingSection>{children}</MarketingSection>;
}
