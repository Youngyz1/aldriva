import * as React from "react";
import { cn } from "@/lib/utils";

export function FormSection({
  title,
  description,
  children,
  actions,
  className,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-200 bg-white p-5 sm:p-6 shadow-xs space-y-5",
        className
      )}
    >
      {(title || description) && (
        <div>
          {title && <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>}
          {description && (
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{description}</p>
          )}
        </div>
      )}
      <div className="space-y-5">{children}</div>
      {actions && <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">{actions}</div>}
    </div>
  );
}

export function FieldGroup({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("grid gap-4 sm:grid-cols-2", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      {label && (
        <span className="mb-1.5 block text-xs font-semibold text-zinc-700">
          {label} {required && <span className="text-destructive">*</span>}
        </span>
      )}
      {children}
      {hint && !error && <span className="mt-1.5 block text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="mt-1.5 block text-xs font-medium text-destructive">{error}</span>}
    </label>
  );
}
