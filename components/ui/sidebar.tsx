"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Menu, X } from "lucide-react";

type SidebarContextType = {
  open: boolean;
  setOpen: (v: boolean) => void;
  animate: boolean;
};

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be inside SidebarProvider");
  return ctx;
}

export function SidebarProvider({
  children,
  open: controlledOpen,
  setOpen: controlledSetOpen,
  animate = true,
}: {
  children: ReactNode;
  open?: boolean;
  setOpen?: (v: boolean) => void;
  animate?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledSetOpen ?? setInternalOpen;
  return (
    <SidebarContext.Provider value={{ open, setOpen, animate }}>{children}</SidebarContext.Provider>
  );
}

export function Sidebar({ children, open, setOpen, animate }: { children: ReactNode; open?: boolean; setOpen?: (v: boolean) => void; animate?: boolean }) {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  );
}

export function SidebarBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col", className)}>{children}</div>;
}

export function DesktopSidebar({
  children,
  className,
  widthCollapsed = 60,
  widthExpanded = 300,
}: {
  children: ReactNode;
  className?: string;
  widthCollapsed?: number;
  widthExpanded?: number;
}) {
  const { open, setOpen, animate } = useSidebar();
  const [isHoverCapable, setIsHoverCapable] = useState(true);

  useEffect(() => {
    const mql = window.matchMedia("(hover: hover)");
    setIsHoverCapable(mql.matches);
    const listener = (e: MediaQueryListEvent) => setIsHoverCapable(e.matches);
    mql.addEventListener("change", listener);
    return () => mql.removeEventListener("change", listener);
  }, []);

  // outside click to collapse on touch devices when expanded via tap
  useEffect(() => {
    if (!open || isHoverCapable) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const aside = document.querySelector("[data-adaptive-sidebar]");
      if (aside && !aside.contains(target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open, isHoverCapable, setOpen]);

  return (
    <motion.aside
      data-adaptive-sidebar
      initial={false}
      animate={{ width: open ? widthExpanded : widthCollapsed }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      onMouseEnter={() => {
        if (isHoverCapable) setOpen(true);
      }}
      onMouseLeave={() => {
        if (isHoverCapable) setOpen(false);
      }}
      onClick={() => {
        if (!isHoverCapable) setOpen(!open);
      }}
      className={cn(
        "sticky top-16 z-30 hidden h-[calc(100vh-4rem)] shrink-0 self-start flex-col overflow-hidden border-r border-zinc-200 bg-white text-zinc-900 supports-[height:100dvh]:h-[calc(100dvh-4rem)] lg:flex",
        className
      )}
    >
      <div className="flex h-full flex-col overflow-y-auto overflow-x-hidden overscroll-contain">
        {children}
      </div>
    </motion.aside>
  );
}

export function MobileSidebar({
  children,
  open,
  setOpen,
}: {
  children: ReactNode;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm lg:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-y-0 left-0 z-[101] flex w-[82%] max-w-[320px] flex-col bg-white shadow-xl lg:hidden"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <span className="text-sm font-black">Aldriva</span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function SidebarLink({
  label,
  href,
  icon,
  active,
  collapsed,
}: {
  label: string;
  href: string;
  icon: ReactNode;
  active?: boolean;
  collapsed?: boolean;
}) {
  return (
    <a
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
        active ? "bg-orange-50 text-orange-700" : "text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900",
        collapsed && "justify-center px-2"
      )}
      title={collapsed ? label : undefined}
    >
      <span className="shrink-0">{icon}</span>
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
    </a>
  );
}
