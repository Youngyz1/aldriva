import { cn } from "@/lib/utils";

interface ProfileCardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

/** Base bordered card used throughout the profile design system. */
export default function ProfileCard({ children, className, padding = true }: ProfileCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-zinc-200 bg-white shadow-sm",
        padding && "p-5",
        className
      )}
    >
      {children}
    </div>
  );
}
