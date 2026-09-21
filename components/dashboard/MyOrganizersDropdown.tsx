"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Org = { id: string; name: string };

export function MyOrganizersDropdown({ variant = "sidebar" }: { variant?: "sidebar" | "mobile" }) {
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id;
      if (!uid) { setOrgs([]); return; }
      const { data: owned } = await supabase.from("organizers").select("id, name").eq("user_id", uid).order("created_at");
      // also include delegated via entity_members
      const { data: mem } = await supabase.from("entity_members").select("organizer_id").eq("user_id", uid);
      let delegated: Org[] = [];
      if (mem && mem.length > 0) {
        const ids = mem.map((m: { organizer_id: string }) => m.organizer_id);
        const ownedIds = new Set((owned ?? []).map((o: Org) => o.id));
        const filtered = ids.filter((id) => !ownedIds.has(id));
        if (filtered.length > 0) {
          const { data: delOrgs } = await supabase.from("organizers").select("id, name").in("id", filtered);
          delegated = (delOrgs as Org[]) ?? [];
        }
      }
      setOrgs([...(owned as Org[] ?? []), ...delegated]);
    });
  }, []);

  if (orgs === null) {
    return <div className={variant === "sidebar" ? "px-3 py-2 text-xs text-slate-400" : "px-3 py-2 text-xs text-zinc-500"}>Loading…</div>;
  }
  if (orgs.length === 0) {
    return (
      <div className={variant === "sidebar" ? "px-3 py-2" : "px-3 py-2"}>
        <p className={variant === "sidebar" ? "text-xs text-slate-400" : "text-xs text-zinc-500"}>No organizers yet.</p>
        <Link href="/create-organizer" className={variant === "sidebar" ? "text-xs font-bold text-orange-400 hover:underline" : "text-xs font-bold text-primary hover:underline"}>Create organizer</Link>
      </div>
    );
  }

  if (variant === "mobile") {
    return (
      <div className="relative">
        <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 rounded-full bg-zinc-900 px-3 py-2 text-xs font-bold text-white">
          <Building2 className="h-3.5 w-3.5" /> My Organizers <ChevronDown className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="absolute left-0 top-full z-50 mt-2 w-64 max-h-64 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-xl">
            {orgs.map((o) => (
              <Link key={o.id} href={`/dashboard/org/${o.id}/overview`} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
                <Building2 className="h-4 w-4 text-zinc-400" /> <span className="truncate">{o.name}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-3">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold text-zinc-700 shadow-xs hover:bg-zinc-50">
        <span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-zinc-500" /> My Organizers</span>
        <ChevronDown className={`h-4 w-4 text-zinc-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-1 max-h-64 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-xl">
          {orgs.map((o) => (
            <Link key={o.id} href={`/dashboard/org/${o.id}/overview`} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
              <span className="truncate">{o.name}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
