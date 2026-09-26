import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import StageStub from "../_components/stage-stub";

export default async function WorkforceActivityPage() {
  await headers();
  await requireAdmin();
  return <StageStub title="Activity" stage="Stage 6" blurb="Unified feed across runs, tasks, approvals, reports and incidents." />;
}
