import type { ReactNode } from "react";
import { CompactSection } from "@/components/footers";

// Beneficiary claim flow → compact footer.
export default function BeneficiaryClaimLayout({ children }: { children: ReactNode }) {
  return <CompactSection>{children}</CompactSection>;
}
