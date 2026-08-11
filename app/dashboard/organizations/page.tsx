import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import { Building2, Plus, ArrowRight, Globe, ShieldCheck } from "lucide-react";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

const ORG_TYPE_LABELS: Record<string, string> = {
  nonprofit: "Nonprofit", business: "Business", church: "Church",
  school: "School", creator: "Creator", community: "Community",
  government: "Government", restaurant: "Restaurant",
  sports_club: "Sports Club", other: "Organization",
};

const IDENTITY_STATUS_STYLES: Record<string, string> = {
  pending: "bg-zinc-100 text-zinc-600",
  verified: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

const IDENTITY_STATUS_LABELS: Record<string, string> = {
  pending: "Identity: Pending",
  verified: "Identity: Verified",
  rejected: "Identity: Rejected",
};

export default async function DashboardOrganizationsPage() {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  const { organizers, identityStatus } = ctx;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-orange-600">Account Dashboard</p>
          <h1 className="mt-1 text-2xl font-black">Your Organizations</h1>
          <p className="text-sm font-medium text-zinc-500">Select an organization to manage its events, fundraisers, and settings.</p>
          <span
            className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${IDENTITY_STATUS_STYLES[identityStatus] ?? IDENTITY_STATUS_STYLES.pending}`}
          >
            <ShieldCheck className="h-3 w-3" />
            {IDENTITY_STATUS_LABELS[identityStatus] ?? "Identity: Pending"}
          </span>
        </div>
        <Link
          href="/create-organizer"
          className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-orange-700"
        >
          <Plus className="h-4 w-4" />
          New Organization
        </Link>
      </header>

      {organizers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50">
            <Building2 className="h-6 w-6 text-orange-600" />
          </div>
          <p className="font-black text-zinc-950">No organizations found</p>
          <p className="mt-1 text-sm text-zinc-500">Get started by creating your first organization profile.</p>
          <Link
            href="/create-organizer"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-700 transition"
          >
            Create Organization
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {organizers.map((org) => {
            const orgTypeLabel = ORG_TYPE_LABELS[org.org_type ?? "other"] ?? "Organization";
            const verified = org.status === "verified";
            return (
              <div
                key={org.id}
                className="group flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:shadow-md"
              >
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-zinc-100 bg-zinc-50">
                      {org.photo ? (
                        <Image
                          src={org.photo}
                          alt={org.name}
                          fill
                          sizes="48px"
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
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate font-black text-zinc-950 group-hover:text-orange-600 transition">
                        <span className="truncate">{org.name}</span>
                        <VerifiedBadge verified={verified} size="sm" />
                      </p>
                      <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600">
                        {orgTypeLabel}
                      </span>
                    </div>
                  </div>

                  {org.bio && (
                    <p className="line-clamp-2 text-xs font-medium text-zinc-500 leading-relaxed">
                      {org.bio}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        org.payment_enabled ? "bg-blue-100 text-blue-700" : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {org.payment_enabled ? "Payment Enabled" : "Payment Not Enabled"}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        org.fundraising_approved ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {org.fundraising_approved ? "Fundraising Approved" : "Fundraising Not Approved"}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-5 space-y-2 border-t border-zinc-100 pt-4">
                  <Link
                    href={`/dashboard/org/${org.id}/overview`}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 py-2.5 text-xs font-black text-white hover:bg-orange-600 transition"
                  >
                    Enter Workspace
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <a
                    href={org.slug ? `/org/${org.slug}` : `/organizers/${org.id}`}
                    target="_blank"
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    Public Profile
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
