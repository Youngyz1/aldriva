import ProfileCard from "@/components/profile/ProfileCard";
import { cn } from "@/lib/utils";

interface ProfileSectionProps {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** A titled open profile section — the "About", "Connect", etc. block reused across every profile type. */
export default function ProfileSection({ title, action, children, className }: ProfileSectionProps) {
  return (
    <ProfileCard className={cn("border-t border-zinc-200 pt-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between border-b border-zinc-100 pb-3">
          {title && (
            <h2 className="text-sm font-black uppercase tracking-wide text-zinc-400">{title}</h2>
          )}
          {action}
        </div>
      )}
      {children}
    </ProfileCard>
  );
}
