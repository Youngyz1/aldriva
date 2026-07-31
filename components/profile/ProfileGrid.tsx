import { cn } from "@/lib/utils";

const COLS = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
} as const;

interface ProfileGridProps {
  children: React.ReactNode;
  cols?: keyof typeof COLS;
  className?: string;
}

/** Responsive card grid for campaign/event lists inside a profile tab. */
export default function ProfileGrid({ children, cols = 2, className }: ProfileGridProps) {
  return <div className={cn("grid gap-4", COLS[cols], className)}>{children}</div>;
}
