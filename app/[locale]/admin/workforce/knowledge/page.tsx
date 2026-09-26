import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import StageStub from "../_components/stage-stub";

export default async function WorkforceKnowledgePage() {
  await headers();
  await requireAdmin();
  return <StageStub title="Knowledge" stage="Stage 11" blurb="Platform, agent and tenant knowledge documents, versions and chunks." />;
}
