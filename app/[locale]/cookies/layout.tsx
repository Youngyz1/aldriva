import type { ReactNode } from "react";
import { MarketingSection } from "@/components/footers";

// Public legal page → full marketing footer.
export default function CookiesLayout({ children }: { children: ReactNode }) {
  return <MarketingSection>{children}</MarketingSection>;
}
