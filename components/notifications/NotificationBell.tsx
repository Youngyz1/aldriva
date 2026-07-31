"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useNotifications, type NotificationRow } from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";

function timeAgo(value: string) {
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function NotificationItem({
  notification,
  onOpen,
}: {
  notification: NotificationRow;
  onOpen: (notification: NotificationRow) => void;
}) {
  const isUnread = !notification.read_at;
  const content = (
    <div
      className={cn(
        "flex flex-col gap-0.5 border-b border-zinc-100 px-4 py-3 text-left transition last:border-0 hover:bg-zinc-50",
        isUnread && "bg-orange-50/60 hover:bg-orange-50"
      )}
    >
      <div className="flex items-center gap-2">
        {isUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />}
        <p className="truncate text-sm font-bold text-zinc-900">{notification.title}</p>
      </div>
      {notification.body && (
        <p className="line-clamp-2 text-xs text-zinc-600">{notification.body}</p>
      )}
      <p className="text-[11px] font-semibold text-zinc-400">{timeAgo(notification.created_at)}</p>
    </div>
  );

  if (notification.link) {
    return (
      <Link href={notification.link} onClick={() => onOpen(notification)}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className="block w-full" onClick={() => onOpen(notification)}>
      {content}
    </button>
  );
}

export default function NotificationBell({ userId }: { userId: string }) {
  const { notifications, unreadCount, loading, markRead } = useNotifications(userId);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleOpenNotification(notification: NotificationRow) {
    if (!notification.read_at) markRead(notification.id);
    setOpen(false);
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        aria-expanded={open}
        className="relative hidden h-10 w-10 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 transition hover:border-orange-200 hover:text-orange-600 sm:flex"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-black text-white ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-zinc-200 bg-white shadow-xl">
          <div className="border-b border-zinc-100 px-4 py-3">
            <p className="text-sm font-black text-zinc-900">Notifications</p>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-zinc-500">Loading…</p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-zinc-500">You&apos;re all caught up.</p>
            ) : (
              notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onOpen={handleOpenNotification}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
