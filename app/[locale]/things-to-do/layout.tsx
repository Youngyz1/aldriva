import type { ReactNode } from "react";
import { MarketingSection } from "@/components/footers";

// City discovery surface → full marketing footer.
export default function ThingsToDoLayout({ children }: { children: ReactNode }) {
  return <MarketingSection>{children}</MarketingSection>;
}
