import Link from "next/link";
import Image from "next/image";
import { Building2, Plus, ArrowRight } from "lucide-react";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

type Organizer = { id: string; name: string; photo?: string | null };

/** Same org-switcher grid the dashboard already had, restyled to the shared
 *  card/header language (border-b header row, icon + title) instead of its
 *  own bespoke section heading. */
export default function OrganizationsPanel({ organizers }: { organizers: Organizer[] }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-slate-400" aria-hidden />
          <h2 className="text-sm font-semibold text-slate-900">Your Organizations</h2>
        </div>
        <Link
          href="/create-organizer"
          className="flex items-center gap-1.5 text-xs font-black text-brand-700 hover:underline"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New
        </Link>
      </div>

      <div className="p-4">
        {organizers.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 py-10 text-center">
            <Building2 className="mb-2 h-8 w-8 text-zinc-300" aria-hidden />
            <p className="text-sm font-semibold text-zinc-700">No organizations yet</p>
            <p className="mt-1 text-xs text-zinc-500">
              Create one to host events and fundraisers.
            </p>
            <Link
              href="/create-organizer"
              className="mt-3 rounded-xl bg-brand-700 px-4 py-2 text-xs font-black text-white transition hover:bg-brand-800"
            >
              Create Organization
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {organizers.map((org) => (
              <Link
                key={org.id}
                href={`/dashboard/org/${org.id}/overview`}
                className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 transition hover:border-brand-200 hover:bg-brand-50/20"
              >
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-zinc-100 bg-zinc-50">
                  {org.photo ? (
                    <Image src={org.photo} alt={org.name} fill sizes="40px" className="object-cover" />
                  ) : (
                    <LocalBrandedPlaceholder
                      variant="avatar"
                      title={org.name}
                      initials={org.name.charAt(0).toUpperCase()}
                      className="from-transparent to-transparent text-zinc-400"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-zinc-950 transition group-hover:text-brand-700">
                    {org.name}
                  </p>
                  <p className="text-xs font-medium text-zinc-500">Manage events &amp; fundraisers</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 transition-transform group-hover:translate-x-1 group-hover:text-brand-500" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
