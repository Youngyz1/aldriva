"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function EditOrganizerRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const organizerId = params?.id as string;
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      const { data: organizer, error: organizerError } = await supabase
        .from("organizers")
        .select("slug")
        .eq("id", organizerId)
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (organizerError || !organizer) {
        setError("Organization not found or you do not have permission to edit it.");
        return;
      }

      router.push(`/dashboard/org/${organizerId}/settings`);
    }

    if (organizerId) load();
  }, [organizerId, router]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 text-center">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-bold text-red-700 max-w-sm">
          {error}
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
    </main>
  );
}
