import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import StageStub from "../_components/stage-stub";

export default async function WorkforceTasksPage() {
  await headers();
  await requireAdmin();
  return <StageStub title="Tasks" stage="Stage 3" blurb="Workforce tasks with live status, runs, steps and reports." />;
}
