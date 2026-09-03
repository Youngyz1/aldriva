import type { ReactNode } from "react";
import { CompactSection } from "@/components/footers";

// Individual beneficiary page → compact footer.
export default function BeneficiaryDetailLayout({ children }: { children: ReactNode }) {
  return <CompactSection>{children}</CompactSection>;
}
