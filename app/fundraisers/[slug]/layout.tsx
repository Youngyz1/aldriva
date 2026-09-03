import type { ReactNode } from "react";
import { CompactSection } from "@/components/footers";

// Individual fundraiser page (+ donate sub-page) → compact footer. (Placed
// at the [slug] level — NOT in app/fundraisers/layout.tsx — so the
// fundraisers list and edit flows keep their own tiers.)
export default function FundraiserDetailLayout({ children }: { children: ReactNode }) {
  return <CompactSection>{children}</CompactSection>;
}
