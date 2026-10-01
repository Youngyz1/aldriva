import type { ReactNode } from "react";
import { CompactSection } from "@/components/footers";

// Ticket verification result → compact footer.
export default function VerifyLayout({ children }: { children: ReactNode }) {
  return <CompactSection>{children}</CompactSection>;
}
