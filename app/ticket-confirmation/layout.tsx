import type { ReactNode } from "react";
import { CompactSection } from "@/components/footers";

// Transactional confirmation page → compact footer.
export default function TicketConfirmationLayout({ children }: { children: ReactNode }) {
  return <CompactSection>{children}</CompactSection>;
}
