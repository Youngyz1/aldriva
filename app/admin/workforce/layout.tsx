/**
 * app/admin/workforce/layout.tsx — Stage 21 (P1): workforce shell.
 *
 * Server Component. Left: department tree (server-rendered rows from the
 * aggregated tree helper, active-link highlight in the client leaf).
 * Center: {children} (existing pages, untouched). Light admin system only.
 * No write actions anywhere in the shell. The tree helper is this file's
 * only data access (it gates requireAdmin itself); the 11-entry sidebar
 * is unchanged.
 */
import { fetchWorkforceTree } from "@/lib/workforce/tree";
import { WorkforceTreeNav } from "./WorkforceTreeNav";

export default async function WorkforceLayout({ children }: { children: React.ReactNode }) {
  const tree = await fetchWorkforceTree();

  return (
    <div className="flex items-start gap-6">
      <WorkforceTreeNav departments={tree} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
