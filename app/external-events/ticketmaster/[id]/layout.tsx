import type { ReactNode } from "react";
import { CompactSection } from "@/components/footers";

// Individual external event page → compact footer.
export default function ExternalEventDetailLayout({ children }: { children: ReactNode }) {
  return <CompactSection>{children}</CompactSection>;
}
