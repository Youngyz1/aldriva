import type { ReactNode } from "react";
import { CompactFooter } from "@/components/footers";
import ChromeGate from "@/components/ChromeGate";

// Individual event page → compact footer. (Placed at the [slug] level —
// NOT in app/events/layout.tsx — so the events list, edit, my-tickets and
// team flows keep their own tiers.)
//
// Inlines CompactSection's own layout (rather than using it directly) so
// the footer alone can be gated behind ChromeGate: the guest scanner page
// at /events/<id>/staff-scanner renders no site chrome at all, but every
// other page under this segment keeps the compact footer unchanged.
export default function EventDetailLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1">{children}</div>
      <ChromeGate>
        <CompactFooter />
      </ChromeGate>
    </div>
  );
}
