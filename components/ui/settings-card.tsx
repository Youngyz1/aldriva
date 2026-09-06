import * as React from "react";
import { cn } from "@/lib/utils";

interface SettingsCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * SettingsCard — open settings section (NOT a visual card).
 *
 * Platform rule: page/form/settings sections must NOT render as bordered
 * rectangles. Grouping comes from spacing + typography + thin dividers.
 * Visible boundaries are reserved for entity cards, interactive surfaces,
 * dialogs, tables, alerts, upload zones, and selected states.
 */
export const SettingsCard = React.forwardRef<HTMLDivElement, SettingsCardProps>(
  ({ className, title, description, children, footer, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "border-t border-zinc-200 pt-6 first:border-t-0 first:pt-0",
          className
        )}
        {...props}
      >
        {/* Section Header */}
        {(title || description) && (
          <div className="mb-5 border-b border-zinc-100 pb-4 sm:mb-6">
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

        {/* Section Content */}
        <div>{children}</div>

        {/* Section Footer */}
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
