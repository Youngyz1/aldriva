import { cn } from "@/lib/utils";

interface ProfileSidebarProps {
  children: React.ReactNode;
  className?: string;
}

/** Sticky desktop rail for profile-summary cards (About, Connect, etc.); a plain stacked column below lg. */
export default function ProfileSidebar({ children, className }: ProfileSidebarProps) {
  return (
    <aside className={cn("space-y-5 lg:sticky lg:top-6 lg:h-fit", className)}>
      {children}
    </aside>
  );
}
