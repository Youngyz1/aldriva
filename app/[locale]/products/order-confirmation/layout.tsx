import type { ReactNode } from "react";
import { CompactSection } from "@/components/footers";

// Transactional confirmation page → compact footer. (Nested layout — the
// products list keeps the marketing tier via its own page wrapper.)
export default function OrderConfirmationLayout({ children }: { children: ReactNode }) {
  return <CompactSection>{children}</CompactSection>;
}
