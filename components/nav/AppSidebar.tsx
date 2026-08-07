import type { ReactNode } from "react";
import SidebarNavList from "./SidebarNavList";
import type { NavGroup } from "./nav-active";

/**
 * Shared shell for every persistent, full-height app sidebar (dashboard,
 * organization workspace, admin). Owns layout and background; nav rendering
 * itself comes from SidebarNavList (tone="dark"), the same primitive the
 * settings nav uses in its own light-themed shell.
 */
export default function AppSidebar({
  groups,
  header,
  footer,
  navAriaLabel,
}: {
  groups: NavGroup[];
  header: ReactNode;
  footer?: ReactNode;
  navAriaLabel: string;
}) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto bg-slate-950 text-white lg:flex">
      {header}
      <SidebarNavList
        groups={groups}
        tone="dark"
        ariaLabel={navAriaLabel}
        className="flex-1 space-y-5 px-3 py-4"
      />
      {footer}
    </aside>
  );
}
