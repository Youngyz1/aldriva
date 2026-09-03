import type { ReactNode } from "react";
import { CompactSection } from "@/components/footers";

// Individual event page → compact footer. (Placed at the [slug] level —
// NOT in app/events/layout.tsx — so the events list, edit, my-tickets and
// team flows keep their own tiers.)
export default function EventDetailLayout({ children }: { children: ReactNode }) {
  return <CompactSection>{children}</CompactSection>;
}
