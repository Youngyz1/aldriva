import type { ReactNode } from "react";
import { CompactSection } from "@/components/footers";

// Individual organization page → compact footer.
export default function OrganizationDetailLayout({ children }: { children: ReactNode }) {
  return <CompactSection>{children}</CompactSection>;
}
