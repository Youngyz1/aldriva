import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import StageStub from "../_components/stage-stub";

export default async function WorkforceReportsPage() {
  await headers();
  await requireAdmin();
  return <StageStub title="Reports" stage="Stage 5" blurb="Persisted agent reports with findings and recommendations." />;
}
