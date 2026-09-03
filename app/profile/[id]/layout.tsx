import type { ReactNode } from "react";
import { CompactSection } from "@/components/footers";

// Public profile page → compact footer.
export default function ProfileDetailLayout({ children }: { children: ReactNode }) {
  return <CompactSection>{children}</CompactSection>;
}
