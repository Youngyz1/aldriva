import Link from "next/link";
import { Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type PublicEmptyStateProps = {
  icon?: React.ReactNode | LucideIcon | React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: { label: string; href: string };
  className?: string;
};

export default function PublicEmptyState({
  icon,
  title,
  description,
  action,
  className,
}: PublicEmptyStateProps) {
  const renderIcon = () => {
    if (!icon) {
      return <Sparkles className="h-8 w-8 text-zinc-400" />;
    }
    if (typeof icon === "function") {
      const IconComponent = icon as LucideIcon;
      return <IconComponent className="h-8 w-8 text-zinc-400" />;
    }
    if (typeof icon === "string") {
      return <span className="text-2xl">{icon}</span>;
    }
    return icon;
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center sm:px-10 sm:py-16",
        className
      )}
    >
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400">
        {renderIcon()}
      </div>
      <h2 className="mt-2 text-xl font-black text-zinc-950 sm:text-2xl">{title}</h2>
      {description && <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500 sm:text-base">{description}</p>}
      {action && (
        <Link
          href={action.href}
          className="mt-6 inline-flex rounded-xl bg-orange-600 px-6 py-3 text-sm font-black text-white transition hover:bg-orange-700"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
