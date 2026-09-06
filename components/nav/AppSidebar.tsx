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
    // Pinned app chrome: sticks below the sticky global navbar (h-16) so it
    // never slides underneath it, and is exactly viewport-minus-navbar tall
    // so the footer stays reachable. `self-start` keeps `sticky` working
    // inside the flex-row parent; the nav scrolls internally when taller
    // than the viewport while the page scroll moves only the main content.
    <aside className="sticky top-16 z-30 hidden h-[calc(100vh-4rem)] w-64 shrink-0 self-start flex-col overflow-y-auto overscroll-contain bg-slate-950 text-white supports-[height:100dvh]:h-[calc(100dvh-4rem)] lg:flex">
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
