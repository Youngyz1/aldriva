"use client";

import { useState } from "react";
import Link from "next/link";
import { SettingsCard } from "@/components/ui/settings-card";
import { Link2, Unlink, Calendar, Video, RefreshCw, AlertCircle } from "lucide-react";

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ size: number; className?: string }>;
  status: "connected" | "disconnected" | "beta" | "soon";
  link?: string;
  connectedEmail?: string;
}

export default function ConnectedClient({
  userId,
}: {
  userId: string;
}) {
  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: "eventbrite",
      name: "Eventbrite Sync",
      description: "Synchronize events, draft ticket lists, and manage check-ins directly from Eventbrite.",
      icon: RefreshCw,
      status: "connected",
      link: "/eventbrite-sync",
      connectedEmail: "partner-eventbrite@example.com",
    },
    {
      id: "gofundme",
      name: "GoFundMe Sync",
      description: "Import fundraising logs, donation history, and host campaigns from GoFundMe pages.",
      icon: Link2,
      status: "connected",
      link: "/gofundme-sync",
      connectedEmail: "gofundme-sync-user@example.com",
    },
    {
      id: "google_cal",
      name: "Google Calendar",
      description: "Add scheduled event reminders and deadlines directly to your personal calendar agenda.",
      icon: Calendar,
      status: "beta",
    },
    {
      id: "zoom",
      name: "Zoom Webinars",
      description: "Automatically generate secure Zoom link invitations when publishing online virtual events.",
      icon: Video,
      status: "soon",
    },
  ]);

  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  function handleSync(id: string) {
    setSyncingId(id);
    // Mimic API sync round-trip
    setTimeout(() => {
      setSyncingId(null);
      showToast(`${integrations.find(i => i.id === id)?.name} data synced successfully.`);
    }, 1200);
  }

  function handleToggleConnection(id: string) {
    setIntegrations(prev =>
      prev.map(item => {
        if (item.id === id) {
          const isConnected = item.status === "connected";
          return {
            ...item,
            status: isConnected ? "disconnected" : "connected",
            connectedEmail: isConnected ? undefined : "user@example.com",
          };
        }
        return item;
      })
    );
    const item = integrations.find(i => i.id === id);
    showToast(
      item?.status === "connected"
        ? `Disconnected from ${item.name}.`
        : `Connected to ${item?.name} successfully.`
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {toast}
        </div>
      )}

      {/* Integration details */}
      <header className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight text-zinc-950 font-sans">
          Sync Integrations
        </h2>
        <p className="text-xs text-zinc-500 sm:text-sm">
          Connect your dashboard with third-party networks to automatically import profiles, campaigns, and events.
        </p>
      </header>

      {/* Integrations Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {integrations.map((app) => {
          const Icon = app.icon;
          return (
            <div
              key={app.id}
              className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-5 shadow-xs transition hover:shadow-sm sm:rounded-2xl"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600 shrink-0">
                    <Icon size={20} className={syncingId === app.id ? "animate-spin" : ""} />
                  </div>
                  <div>
                    {app.status === "connected" && (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-black uppercase text-emerald-700">
                        Connected
                      </span>
                    )}
                    {app.status === "disconnected" && (
                      <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-black uppercase text-zinc-500">
                        Disconnected
                      </span>
                    )}
                    {app.status === "beta" && (
                      <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-black uppercase text-blue-700">
                        Beta Mode
                      </span>
                    )}
                    {app.status === "soon" && (
                      <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-black uppercase text-purple-700">
                        Coming Soon
                      </span>
                    )}
                  </div>
                </div>

                {/* Details */}
                <h3 className="mt-4 text-base font-bold text-zinc-900">{app.name}</h3>
                <p className="mt-1 text-xs text-zinc-500 sm:text-sm leading-normal">
                  {app.description}
                </p>

                {app.connectedEmail && (
                  <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-500">
                    <AlertCircle size={14} className="text-zinc-400" />
                    <span>Linked: {app.connectedEmail}</span>
                  </div>
                )}
              </div>

              {/* Actions Footer */}
              <div className="mt-6 border-t border-zinc-100 pt-4 flex flex-wrap gap-2 justify-end">
                {app.status === "connected" && (
                  <>
                    {app.link && (
                      <Link
                        href={app.link}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-black text-zinc-700 hover:bg-zinc-50 transition"
                      >
                        Configure
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSync(app.id)}
                      disabled={syncingId === app.id}
                      className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-black text-white hover:bg-orange-700 transition"
                    >
                      {syncingId === app.id ? "Syncing..." : "Sync Now"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleConnection(app.id)}
                      className="rounded-lg border border-red-200 bg-white p-1.5 text-red-600 hover:bg-red-50 transition"
                      title="Disconnect Account"
                    >
                      <Unlink size={14} />
                    </button>
                  </>
                )}

                {app.status === "disconnected" && (
                  <button
                    type="button"
                    onClick={() => handleToggleConnection(app.id)}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-black text-white hover:bg-indigo-700 transition"
                  >
                    Connect Account
                  </button>
                )}

                {app.status === "beta" && (
                  <button
                    type="button"
                    onClick={() => handleToggleConnection(app.id)}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-black text-white hover:bg-blue-700 transition"
                  >
                    Enable Beta
                  </button>
                )}

                {app.status === "soon" && (
                  <button
                    type="button"
                    disabled
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-black text-zinc-400 cursor-not-allowed"
                  >
                    Join Waitlist
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
