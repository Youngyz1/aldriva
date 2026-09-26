import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import StageStub from "../_components/stage-stub";

export default async function WorkforceApprovalsPage() {
  await headers();
  await requireAdmin();
  return <StageStub title="Approvals" stage="Stage 4" blurb="Human review, approve and reject for pending approval requests." />;
}
