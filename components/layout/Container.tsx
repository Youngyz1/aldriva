import { cn } from "@/lib/utils";

type ContainerProps = React.HTMLAttributes<HTMLDivElement> & {
  size?: "sm" | "md" | "lg" | "xl" | "full" | "prose";
  gutter?: boolean;
};

const sizeMap: Record<NonNullable<ContainerProps["size"]>, string> = {
  sm: "max-w-[42rem]", // --container-sm
  md: "max-w-[64rem]", // --container-md
  lg: "max-w-[72rem]", // --container-lg (site sections)
  xl: "max-w-[80rem]", // --container-xl (dashboard)
  full: "max-w-none",
  prose: "max-w-[42rem]",
};

/**
 * Container — centralizes max-width + gutters.
 * Use instead of hard-coding `max-w-7xl px-4 sm:px-6 lg:px-8` per page.
 * Composable: different verticals can choose size but share gutters.
 */
export function Container({
  size = "xl",
  gutter = true,
  className,
  children,
  ...props
}: ContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full",
        sizeMap[size],
        gutter && "px-4 sm:px-6 lg:px-8",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
