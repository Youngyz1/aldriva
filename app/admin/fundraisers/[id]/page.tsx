/**
 * app/admin/fundraisers/[id]/page.tsx
 * Admin fundraiser management — summary + approve/reject + donor/comment import.
 * Scope is intentionally limited to those three; full field editing lives in the
 * owner-facing /fundraisers/edit/[id]. Admin-gated by app/admin/layout.tsx.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { money } from "@/lib/format";
import { formatAdminDate } from "@/lib/admin-query";
import FundraiserImportPanel from "@/components/admin/FundraiserImportPanel";
import AdminFundraiserStatusActions from "./AdminFundraiserStatusActions";


type FundraiserStatus = "pending_review" | "published" | "rejected";

export default async function AdminFundraiserManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createSupabaseAdmin();

  const { data: fundraiser } = await admin
    .from("fundraisers")
    .select("id, title, slug, organizer, raised, goal, status, rejection_reason, category, created_at")
    .eq("id", id)
    .maybeSingle();

  if (!fundraiser) return notFound();

  const [{ count: donationCount }, { count: commentCount }] = await Promise.all([
    admin
      .from("donations")
      .select("id", { count: "exact", head: true })
      .eq("fundraiser_id", id)
      .in("status", ["succeeded", "completed"]),
    admin
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("target_type", "fundraiser")
      .eq("target_id", id)
      .eq("status", "approved"),
  ]);

  const raised = Number(fundraiser.raised ?? 0);
  const goal = Number(fundraiser.goal ?? 0);
  const progress = goal > 0 ? Math.min(Math.round((raised / goal) * 100), 100) : 0;

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-zinc-200/80 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link
              href="/admin/fundraisers"
              className="text-xs font-black uppercase tracking-wide text-violet-600 hover:underline"
            >
              ← Fundraisers
            </Link>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{fundraiser.title}</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {fundraiser.organizer || "—"} · {fundraiser.category || "Other"} · Created{" "}
              {formatAdminDate(fundraiser.created_at)}
            </p>
          </div>
          {fundraiser.slug && (
            <Link
              href={`/fundraisers/${fundraiser.slug}`}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-black text-zinc-700 hover:bg-zinc-50"
            >
              View public page
            </Link>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["Raised", money(raised)],
            ["Goal", money(goal)],
            ["Progress", `${progress}%`],
            ["Donations", donationCount ?? 0],
            ["Comments", commentCount ?? 0],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200/70">
              <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</p>
              <p className="mt-1 font-black text-zinc-950">{value}</p>
            </div>
          ))}
        </div>
      </header>

      <AdminFundraiserStatusActions
        fundraiserId={fundraiser.id}
        initialStatus={fundraiser.status as FundraiserStatus}
        initialRejectionReason={fundraiser.rejection_reason}
      />

      <FundraiserImportPanel fundraiserId={fundraiser.id} />
    </div>
  );
}
