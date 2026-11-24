import { notFound } from "next/navigation";
import { assertCanAccessBusinessStaffArea } from "@/lib/entity-authz";
import MyAssignmentsList from "@/components/staff/MyAssignmentsList";

export default async function MyAssignmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await assertCanAccessBusinessStaffArea(id);
  if (!auth.ok) return notFound();

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold tracking-tight text-zinc-900">My assignments</h1>
      <MyAssignmentsList businessId={id} />
    </div>
  );
}
