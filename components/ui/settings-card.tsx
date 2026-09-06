import * as React from "react";
import { cn } from "@/lib/utils";

interface SettingsCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
}

export const SettingsCard = React.forwardRef<HTMLDivElement, SettingsCardProps>(
  ({ className, title, description, children, footer, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl border border-zinc-200/80 bg-white p-5 shadow-xs sm:rounded-2xl sm:p-6 lg:p-8",
          className
        )}
        {...props}
      >
        {/* Card Header */}
        {(title || description) && (
          <div className="mb-5 sm:mb-6">
            {title && (
              <h3 className="text-lg font-bold tracking-tight text-zinc-900 sm:text-xl font-sans">
                {title}
              </h3>
            )}
            {description && (
              <p className="mt-1 text-xs text-zinc-500 sm:text-sm">
                {description}
              </p>
            )}
          </div>
        )}

        {/* Card Content */}
        <div>{children}</div>

        {/* Card Footer */}
        {footer && (
          <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-zinc-100">
            {footer}
          </div>
        )}
      </div>
    );
  }
);

SettingsCard.displayName = "SettingsCard";
