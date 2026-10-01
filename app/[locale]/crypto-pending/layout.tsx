import type { ReactNode } from "react";
import { CompactSection } from "@/components/footers";

// Transactional payment-status page → compact footer.
export default function CryptoPendingLayout({ children }: { children: ReactNode }) {
  return <CompactSection>{children}</CompactSection>;
}
