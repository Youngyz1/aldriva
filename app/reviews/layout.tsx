import type { ReactNode } from "react";
import { MarketingSection } from "@/components/footers";

// Public discovery surface → full marketing footer.
export default function ReviewsLayout({ children }: { children: ReactNode }) {
  return <MarketingSection>{children}</MarketingSection>;
}
