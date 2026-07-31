import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import { createSupabaseServer } from "@/lib/supabase-server";
import EditProductFormClient from "./EditProductFormClient";

export const revalidate = 0;

export default async function EditProductPage({
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
  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !product) {
    notFound();
  }

  if (product.owner_id !== ctx.user.id) {
    redirect("/dashboard/products");
  }

  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("owner_id", ctx.user.id)
    .order("name", { ascending: true });

  return (
    <div className="flex-1 p-6 max-w-4xl mx-auto">
      <EditProductFormClient product={product} ownedBusinesses={businesses || []} />
    </div>
  );
}
