import "server-only";
/**
 * app/admin/ai/rejections/page.tsx
 *
 * Hard Gate Deliverable per ADR-0002 §4:
 * Admin panel at /admin/ai/rejections surfacing security rejection logs from ai_guard_rejections.
 */

import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import RejectionsClient, { type GuardRejectionRow } from "./RejectionsClient";

export default async function AIRejectionsAuditPage() {
  await headers(); // Forces dynamic server-rendering on every request in Next.js 16
  await requireAdmin();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from("ai_guard_rejections")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const rows: GuardRejectionRow[] = (data || []) as GuardRejectionRow[];

  return <RejectionsClient rows={rows} error={error ? error.message : null} />;
}
