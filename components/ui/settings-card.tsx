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
          "rounded-xl border border-zinc-200/80 bg-white shadow-xs transition duration-200 hover:shadow-sm sm:rounded-2xl",
          className
        )}
        {...props}
      >
        {/* Card Header */}
        {(title || description) && (
          <div className="border-b border-zinc-100 p-5 sm:px-6 sm:py-5">
            {title && (
              <h3 className="text-lg font-bold tracking-tight text-zinc-900 sm:text-xl font-sans">
                {title}
              </h3>
            )}
            {description && (
              <p className="mt-1.5 text-xs text-zinc-500 sm:text-sm">
                {description}
              </p>
            )}
          </div>
        )}

        {/* Card Content */}
        <div className="p-5 sm:p-6 lg:p-8">{children}</div>

        {/* Card Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 rounded-b-xl border-t border-zinc-100 bg-zinc-50/50 px-5 py-4 sm:rounded-b-2xl sm:px-6 sm:py-5">
            {footer}
          </div>
        )}
      </div>
    );
  }
);

SettingsCard.displayName = "SettingsCard";
