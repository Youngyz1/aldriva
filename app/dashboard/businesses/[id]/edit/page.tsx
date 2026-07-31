import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import { createSupabaseServer } from "@/lib/supabase-server";
import EditBusinessFormClient from "./EditBusinessFormClient";

export const revalidate = 0;

export default async function EditBusinessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getDashboardContext();
  if (!ctx) {
    redirect("/login");
  }

  const supabase = await createSupabaseServer();
  const { data: business, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !business) {
    notFound();
  }

  if (business.owner_id !== ctx.user.id) {
    redirect("/dashboard/businesses");
  }

  return (
    <div className="flex-1 p-6 max-w-4xl mx-auto">
      <EditBusinessFormClient business={business} />
    </div>
  );
}
