import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import StageStub from "../_components/stage-stub";

export default async function WorkforceSentinelPage() {
  await headers();
  await requireAdmin();
  return <StageStub title="Sentinel" stage="Stage 9" blurb="Incidents, events, investigations and reliability reports." />;
}
