import Link from "next/link";
import { cn } from "@/lib/utils";

type PublicEmptyStateProps = {
  icon?: string;
  title: string;
  description?: string;
  action?: { label: string; href: string };
  className?: string;
};

export default function PublicEmptyState({
  icon = "✨",
  title,
  description,
  action,
  className,
}: PublicEmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center sm:px-10 sm:py-16",
        className
      )}
    >
      <p className="text-4xl" aria-hidden>
        {icon}
      </p>
      <h2 className="mt-4 text-xl font-black text-zinc-950 sm:text-2xl">{title}</h2>
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
