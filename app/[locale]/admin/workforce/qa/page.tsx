import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import StageStub from "../_components/stage-stub";

export default async function WorkforceQAPage() {
  await headers();
  await requireAdmin();
  return <StageStub title="QA" stage="Stages 7-8" blurb="QA runs, results, artifacts and failure analysis." />;
}
