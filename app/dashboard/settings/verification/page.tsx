/**
 * app/dashboard/settings/verification/page.tsx
 * Settings → Verification hub: the single centralized home for all
 * verification. Identity verification runs here (see ./identity); each
 * organization links out to its existing per-org verification wizard at
 * /dashboard/org/[id]/verify, which is unchanged.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, Building2, ArrowRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

function StatusBadge({ verified, label }: { verified: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide ${
        verified
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-700"
      }`}
    >
      <ShieldCheck className="h-3 w-3" />
      {label}
    </span>
  );
}

export default async function SettingsVerificationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = createSupabaseAdmin();

  const [{ data: profile }, { data: organizers }] = await Promise.all([
    supabase
      .from("profiles")
      .select("identity_status")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("organizers")
      .select("id, name, org_type, status")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
  ]);

  const identityVerified = profile?.identity_status === "verified";

  return (
    <div className="space-y-6">
      {/* Identity Verification — open section, CTA keeps its own boundary. */}
      <section className="border-t border-zinc-200 pt-6 first:border-t-0 first:pt-0">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-black text-zinc-950">Identity Verification</h2>
              <StatusBadge
                verified={identityVerified}
                label={identityVerified ? "Verified" : "Not verified"}
              />
            </div>
            <p className="mt-1.5 max-w-xl text-sm font-medium text-zinc-500">
              Verify your personal identity to unlock restricted actions such as
              receiving payouts. Your documents are reviewed securely.
            </p>
          </div>
          <Link
            href="/dashboard/settings/verification/identity"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-black text-white transition hover:bg-zinc-800"
          >
            {identityVerified ? "View verification" : "Verify identity"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Organization Verification — open section, rows keep dividers. */}
      <section className="border-t border-zinc-200 pt-6">
        <h2 className="font-black text-zinc-950">Organization Verification</h2>
        <p className="mt-1.5 max-w-xl text-sm font-medium text-zinc-500">
          Verified organizations earn donor trust with a public badge.
          Verification is managed per organization.
        </p>

        {(organizers ?? []).length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 p-6 text-center">
            <p className="text-sm font-medium text-zinc-500">
              You don&apos;t have any organizations yet.
            </p>
            <Link
              href="/create-organizer"
              className="mt-3 inline-block rounded-xl bg-zinc-950 px-4 py-2 text-sm font-black text-white transition hover:bg-zinc-800"
            >
              Create Organization
            </Link>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-100 border-y border-zinc-100">
            {(organizers ?? []).map((org) => {
              const verified = org.status === "verified";
              return (
                <li
                  key={org.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-black text-zinc-900">{org.name}</p>
                      <div className="mt-1">
                        <StatusBadge
                          verified={verified}
                          label={verified ? "Verified" : "Unverified"}
                        />
                      </div>
                    </div>
                  </div>
                  <Link
                    href={`/dashboard/org/${org.id}/verify`}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-black text-zinc-700 transition hover:bg-zinc-50"
                  >
                    {verified ? "View verification" : "Get verified"}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
