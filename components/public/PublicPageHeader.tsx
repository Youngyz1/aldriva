import Link from "next/link";
import { cn } from "@/lib/utils";

type PublicPageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: { label: string; href: string };
  className?: string;
};

export default function PublicPageHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: PublicPageHeaderProps) {
  return (
    <div className={cn("mb-8 sm:mb-10", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-xs font-black uppercase tracking-widest text-orange-600 sm:text-sm">
              {eyebrow}
            </p>
          )}
          <h1 className="mt-1 text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl lg:text-5xl">
            {title}
          </h1>
          {description && (
            <p className="mt-3 max-w-2xl text-base text-zinc-600 sm:text-lg">{description}</p>
          )}
        </div>
        {action && (
          <Link
            href={action.href}
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-orange-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-orange-700"
          >
            {action.label}
          </Link>
        )}
      </div>
    </div>
  );
}
