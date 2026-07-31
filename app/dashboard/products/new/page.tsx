import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import { createSupabaseServer } from "@/lib/supabase-server";
import NewProductFormClient from "./NewProductFormClient";

export default async function NewProductPage() {
  const ctx = await getDashboardContext();
  if (!ctx) {
    redirect("/login");
  }

  const supabase = await createSupabaseServer();
  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("owner_id", ctx.user.id)
    .order("name", { ascending: true });

  return (
    <div className="flex-1 p-6 max-w-4xl mx-auto">
      <NewProductFormClient ownedBusinesses={businesses || []} />
    </div>
  );
}
