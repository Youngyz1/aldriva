import { cn } from "@/lib/utils";

type SectionProps = React.HTMLAttributes<HTMLElement> & {
  heading?: string;
  description?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  padded?: boolean;
  bordered?: boolean;
};

/**
 * Section — consistent vertical rhythm for dashboard/settings.
 * Do not force a template; verticals compose Section freely.
 * Default: card-like surface with border + shadow-xs + rounded-xl.
 * Use `bordered={false} padded={false}` for raw grouping.
 */
export function Section({
  heading,
  description,
  eyebrow,
  actions,
  padded = true,
  bordered = true,
  className,
  children,
  ...props
}: SectionProps) {
  return (
    <section
      className={cn(
        bordered && "rounded-xl border border-zinc-200 bg-white shadow-xs",
        padded && "p-5 sm:p-6",
        className
      )}
      {...props}
    >
      {(heading || description || eyebrow || actions) && (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                {eyebrow}
              </p>
            )}
            {heading && (
              <h2 className="mt-1 text-base font-semibold tracking-tight text-zinc-900">
                {heading}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed max-w-2xl">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function SectionGrid({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("grid gap-6", className)} {...props} />;
}
