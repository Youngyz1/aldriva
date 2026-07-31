import { StatCardGrid, type StatCardItem } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils";

export type { StatCardItem as ProfileMetric };

interface ProfileMetricsProps {
  metrics: StatCardItem[];
  className?: string;
}

/** KPI row shown directly below the profile header — same StatCard system used in the dashboard. */
export default function ProfileMetrics({ metrics, className }: ProfileMetricsProps) {
  if (metrics.length === 0) return null;
  return <StatCardGrid items={metrics} className={cn("grid-cols-2 sm:grid-cols-4", className)} />;
}
