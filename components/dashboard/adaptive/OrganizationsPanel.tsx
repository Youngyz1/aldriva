import Link from "next/link";
import Image from "next/image";
import { Building2, Plus, ArrowRight, ShieldCheck } from "lucide-react";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import { Button } from "@/components/ui/button";

type Organizer = {
  id: string;
  name: string;
  photo?: string | null;
  org_type?: string | null;
  status?: string | null;
  verified_at?: string | null;
  entityRole?: string;
};

export default function OrganizationsPanel({ organizers }: { organizers: Organizer[] }) {
  return (
    <div className="space-y-4">
      {/* Section Header with Clean Inline Action */}
      <div className="flex items-center justify-between border-b border-zinc-200/80 pb-3">
        <div>
          <h2 className="text-base font-bold text-zinc-950">Your Organizations</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Manage entities, team roles, campaigns, and public websites.
          </p>
        </div>
        <Button asChild variant="ghost" size="sm" className="h-8 text-xs font-semibold text-brand-700 hover:text-brand-800 hover:bg-brand-50">
          <Link href="/create-organizer">
            <Plus className="mr-1 h-3.5 w-3.5" />
            New Organization
          </Link>
        </Button>
      </div>

      {/* Structured Open List with Hairline Dividers (NO Nested Cards) */}
      {organizers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 p-8 text-center">
          <Building2 className="mx-auto h-8 w-8 text-zinc-300" aria-hidden />
          <h3 className="mt-2 text-sm font-bold text-zinc-900">No organizations created yet</h3>
          <p className="mt-1 text-xs text-zinc-500 max-w-sm mx-auto">
            Create an organization to manage team permissions, host events, and publish custom pages.
          </p>
          <Button asChild size="sm" className="mt-4 text-xs font-bold">
            <Link href="/create-organizer">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Create Organization
            </Link>
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-zinc-200/70 border-b border-zinc-200/70">
          {organizers.map((org) => {
            const isVerified = Boolean(org.verified_at);
            const role = org.entityRole || "Owner";

            return (
              <div
                key={org.id}
                className="group flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4 transition hover:bg-zinc-50/60 rounded-lg px-2 -mx-2"
              >
                {/* Organization Identity */}
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-zinc-200/80 bg-zinc-50">
                    {org.photo ? (
                      <Image
                        src={org.photo}
                        alt={org.name}
                        fill
                        sizes="44px"
                        className="object-cover"
                      />
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
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/dashboard/org/${org.id}/overview`}
                        className="truncate text-base font-bold text-zinc-950 hover:text-brand-700 transition"
                      >
                        {org.name}
                      </Link>
                      {isVerified && (
                        <span title="Verified Organization">
                          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Verified Organization" />
                        </span>
                      )}
                    </div>

                    <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                      <span className="capitalize font-medium text-zinc-700">{role}</span>
                      <span className="text-zinc-300">·</span>
                      <span className="capitalize">{org.org_type || "Organization"}</span>
                    </div>
                  </div>
                </div>

                {/* Direct Action Link */}
                <div className="shrink-0 sm:pl-4">
                  <Link
                    href={`/dashboard/org/${org.id}/overview`}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800 hover:underline"
                  >
                    <span>Open workspace</span>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
