"use client";

import * as React from "react";
import Link from "next/link";
import { AtSign, ChevronDown, Globe, MessageCircle, Moon, Network, Send, Sun } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { PwaInstallButton } from "@/components/PwaRegister";
import { BRAND } from "@/config/branding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const quickLinks = [
  ["Home", "/"],
  ["About", "/about"],
  ["Events", "/events"],
  ["Fundraisers", "/fundraisers"],
  ["Organizations", "/organizers"],
  ["Platform Reviews", "/reviews"],
  ["Search", "/search"],
  ["Create Event", "/create-event"],
  ["Start Fundraiser", "/create-fundraiser"],
  ["Privacy", "/privacy"],
  ["Cookies", "/cookies"],
] as const;

const socialLinks = [
  ["Community", Globe],
  ["Updates", MessageCircle],
  ["Email", AtSign],
  ["Partners", Network],
] as const;

/**
 * Collapsible section header, rendered ONLY below the `lg` breakpoint.
 * Desktop renders a plain heading instead (see usage below) so the link
 * markup itself is never duplicated for SEO / accessibility.
 */
function MobileSectionToggle({
  sectionId,
  label,
  open,
  onToggle,
}: {
  sectionId: string;
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={sectionId}
      onClick={onToggle}
      className="flex w-full items-center justify-between rounded-lg py-3 text-left text-base font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 lg:hidden"
    >
      {label}
      <ChevronDown
        aria-hidden="true"
        className={cn("h-4 w-4 shrink-0 text-zinc-500 transition-transform", open && "rotate-180")}
      />
    </button>
  );
}

function DesktopSectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 hidden text-base font-bold tracking-tight lg:block lg:text-sm">
      {children}
    </h3>
  );
}

export function MarketingFooter() {
  const [isDarkMode, setIsDarkMode] = React.useState(false);
  // Mobile accordion: which collapsible section is open (all collapsed by
  // default to keep the mobile footer short). Desktop (`lg:`) always shows
  // every section via CSS, independent of this state.
  const [openSection, setOpenSection] = React.useState<string | null>(null);

  React.useEffect(() => {
    const savedTheme = window.localStorage.getItem("Aldriva-theme");
    if (savedTheme === "dark") setIsDarkMode(true);
  }, []);

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
    window.localStorage.setItem("Aldriva-theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  function handleSubscribe(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  function toggle(section: string) {
    setOpenSection((current) => (current === section ? null : section));
  }

  return (
    <footer className="relative border-t border-zinc-200 bg-white text-zinc-950 transition-colors duration-300 dark:border-zinc-900 dark:bg-zinc-950 dark:text-white">
      <div className="mx-auto max-w-7xl px-6 py-8 sm:px-8 md:px-10 lg:px-8">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 lg:gap-12">
          {/* Brand + newsletter — always visible on every breakpoint. */}
          <div className="pb-4 lg:pb-0">
            <BrandMark textClassName="text-zinc-950 dark:text-white" />
            <h2 className="mt-4 text-lg font-bold tracking-tight sm:text-xl lg:text-lg">
              Stay connected
            </h2>
            <p className="mb-4 mt-2 max-w-xs text-xs leading-5 text-zinc-600 sm:text-sm dark:text-zinc-400">
              Get event launches, fundraiser updates, and platform news.
            </p>
            <form onSubmit={handleSubscribe} className="relative w-full max-w-xs">
              <Input
                type="email"
                placeholder="Enter your email"
                aria-label="Email address for platform updates"
                className="h-10 w-full rounded-full border-zinc-200 bg-white px-4 pr-12 text-sm font-medium text-zinc-950 placeholder:text-zinc-500 focus-visible:ring-orange-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
              />
              <Button
                type="submit"
                size="icon"
                className="absolute right-1 top-1 h-8 w-8 rounded-full bg-orange-600 text-white transition-transform hover:scale-105 hover:bg-orange-700"
              >
                <Send className="h-4 w-4" />
                <span className="sr-only">Subscribe</span>
              </Button>
            </form>
          </div>

          {/* Quick links — collapsible on mobile, static grid column on desktop. */}
          <div className="border-t border-zinc-100 lg:border-0 dark:border-zinc-800">
            <DesktopSectionHeading>Quick links</DesktopSectionHeading>
            <MobileSectionToggle
              sectionId="marketing-footer-quicklinks"
              label="Quick links"
              open={openSection === "quicklinks"}
              onToggle={() => toggle("quicklinks")}
            />
            <nav
              id="marketing-footer-quicklinks"
              aria-label="Quick links"
              className={cn(
                "space-y-2 pb-4 text-sm text-zinc-600 lg:pb-0 dark:text-zinc-400",
                openSection !== "quicklinks" && "hidden lg:block"
              )}
            >
              {quickLinks.map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  className="block rounded transition-colors hover:text-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Contact — collapsible on mobile, static grid column on desktop. */}
          <div className="border-t border-zinc-100 lg:border-0 dark:border-zinc-800">
            <DesktopSectionHeading>Contact us</DesktopSectionHeading>
            <MobileSectionToggle
              sectionId="marketing-footer-contact"
              label="Contact us"
              open={openSection === "contact"}
              onToggle={() => toggle("contact")}
            />
            <address
              id="marketing-footer-contact"
              className={cn(
                "max-w-xs space-y-2 pb-4 text-sm leading-6 text-zinc-600 not-italic lg:pb-0 dark:text-zinc-400",
                openSection !== "contact" && "hidden lg:block"
              )}
            >
              <p>{BRAND.name} Support</p>
              <p>Events, fundraising &amp; community commerce.</p>
              <p>
                Email:{" "}
                <a
                  href={`mailto:${BRAND.supportEmail}`}
                  className="font-semibold text-orange-600"
                >
                  {BRAND.supportEmail}
                </a>
              </p>
            </address>
          </div>

          {/* Social + appearance — always visible (single short row). */}
          <div className="border-t border-zinc-100 pt-4 lg:border-0 lg:pt-0 dark:border-zinc-800">
            <h3 className="mb-3 text-base font-bold tracking-tight lg:text-sm">
              Follow us
            </h3>
            <div className="mb-4 flex flex-wrap gap-2">
              <TooltipProvider>
                {socialLinks.map(([label, Icon]) => (
                  <Tooltip key={label}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 rounded-full border-zinc-200 bg-white text-zinc-700 hover:border-orange-500 hover:bg-orange-50 hover:text-orange-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
                      >
                        <Icon className="h-4 w-4" />
                        <span className="sr-only">{label}</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{label}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </TooltipProvider>
            </div>
            <div className="flex items-center space-x-3">
              <Sun className="h-5 w-5 text-zinc-700 dark:text-white" />
              <Switch
                id="dark-mode"
                checked={isDarkMode}
                onCheckedChange={setIsDarkMode}
                className="data-[state=checked]:bg-orange-600"
              />
              <Moon className="h-5 w-5 text-zinc-700 dark:text-white" />
              <Label htmlFor="dark-mode" className="sr-only">
                Toggle dark mode
              </Label>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 border-t border-zinc-200 pt-6 text-center sm:flex-row lg:mt-10 dark:border-zinc-800">
          <p className="text-sm text-zinc-500">
            © 2026 {BRAND.name}. All rights reserved.
          </p>
          <PwaInstallButton />
        </div>
      </div>
    </footer>
  );
}

/**
 * Layout shell for public marketing/discovery segments.
 * Renders page content expanded with the full marketing footer pinned to
 * the bottom of the viewport on short pages. Use in `layout.tsx` files of
 * pure-marketing segments, or wrap mixed-segment list pages.
 */
export function MarketingSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1">{children}</div>
      <MarketingFooter />
    </div>
  );
}
