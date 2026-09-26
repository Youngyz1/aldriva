import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import StageStub from "../_components/stage-stub";

export default async function WorkforceAgentsPage() {
  await headers();
  await requireAdmin();
  return <StageStub title="Agents" stage="Stage 2" blurb="Per-agent identity, tools, runs and reports from the Agent Registry." />;
}
