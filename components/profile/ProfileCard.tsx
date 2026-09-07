import { cn } from "@/lib/utils";

interface ProfileCardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

/** Open profile section — spacing + dividers group content, never a bordered card. */
export default function ProfileCard({ children, className }: ProfileCardProps) {
  return <div className={cn(className)}>{children}</div>;
}
