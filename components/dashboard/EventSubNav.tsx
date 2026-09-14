"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { QrCode, Users, CheckCircle2, Edit3, ExternalLink, LayoutDashboard, Mail, Activity, Palette, Sparkles } from "lucide-react";
import {
  canShowEventPublicPage,
  getEventSubNavTabs,
  type EventSubNavTabId,
  type EventUserRole,
} from "@/lib/event-dashboard-navigation";

export type { EventUserRole };

interface EventSubNavProps {
  eventId: string;
  eventTitle?: string;
  eventSlug?: string | null;
  userRole?: EventUserRole;
}

export default function EventSubNav({
  eventId,
  eventTitle,
  eventSlug,
  userRole = null,
}: EventSubNavProps) {
  const pathname = usePathname();
  const tabs = getEventSubNavTabs(eventId, userRole);

  const tabIcons: Record<EventSubNavTabId, typeof QrCode> = {
    operations: Activity,
    checkins: CheckCircle2,
    scan: QrCode,
    guests: Mail,
    "ticket-design": Palette,
    "invitation-design": Sparkles,
    seating: LayoutDashboard,
    team: Users,
    edit: Edit3,
  };

  return (
    // Open tab nav: tabs carry their own active states, no outer card.
    <div className="mb-6 border-b border-zinc-200 pb-3">
      {eventTitle && (
        <div className="mb-2 flex items-center justify-between border-b border-zinc-100 px-3 pb-2.5">
          <h2 className="truncate text-sm font-black text-zinc-900">{eventTitle}</h2>
          {canShowEventPublicPage(userRole, eventSlug) && (
            <Link
              href={`/events/${eventSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1 text-xs font-black text-violet-700 hover:underline"
            >
              Public Page <ExternalLink size={12} />
            </Link>
          )}
        </div>
      )}
      <nav className="flex flex-wrap gap-1.5" aria-label="Event management navigation">
        {tabs.map((tab) => {
          const Icon = tabIcons[tab.id];
          const isActive = pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black transition-all ${
                isActive
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "bg-zinc-50 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
            >
              <Icon size={14} className={isActive ? "text-orange-400" : "text-zinc-400"} />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
