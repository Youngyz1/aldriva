import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "bg-zinc-100 text-zinc-700",
        orange: "bg-orange-50 text-orange-700",
        emerald: "bg-emerald-100 text-emerald-800",
        blue: "bg-blue-100 text-blue-800",
        purple: "bg-purple-100 text-purple-800",
        amber: "bg-amber-100 text-amber-800",
        rose: "bg-rose-100 text-rose-800",
        outline: "border border-zinc-200 text-zinc-600",
      },
      size: {
        sm: "px-2 py-0.5 text-[10px]",
        md: "px-2.5 py-0.5 text-xs",
      },
    },
    defaultVariants: { variant: "neutral", size: "md" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size, className }))} {...props} />;
}

export { Badge, badgeVariants };
