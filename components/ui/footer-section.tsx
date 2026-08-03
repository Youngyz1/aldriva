"use client";

import * as React from "react";
import Link from "next/link";
import {
  AtSign,
  Globe,
  MessageCircle,
  Moon,
  Network,
  Send,
  Sun,
} from "lucide-react";
import BrandMark from "@/components/BrandMark";
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

function Footerdemo() {
  const [isDarkMode, setIsDarkMode] = React.useState(false);

  React.useEffect(() => {
    const savedTheme = window.localStorage.getItem("fund4good-theme");
    if (savedTheme === "dark") setIsDarkMode(true);
  }, []);

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
    window.localStorage.setItem(
      "fund4good-theme",
      isDarkMode ? "dark" : "light"
    );
  }, [isDarkMode]);

  function handleSubscribe(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <footer className="relative border-t border-zinc-200 bg-white text-zinc-950 transition-colors duration-300 dark:border-zinc-900 dark:bg-zinc-950 dark:text-white">
      <div className="mx-auto max-w-7xl px-6 py-8 sm:px-8 md:px-10 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-12">
          <div>
            <BrandMark textClassName="text-zinc-950 dark:text-white" />
            <h2 className="mt-4 text-lg font-bold tracking-tight sm:text-xl lg:text-lg">
              Stay connected
            </h2>
            <p className="mb-4 mt-2 max-w-xs text-xs leading-5 text-zinc-600 sm:text-sm dark:text-zinc-400">
              Get event launches, fundraiser updates, and platform news.
            </p>
            <form onSubmit={handleSubscribe} className="relative max-w-xs">
              <Input
                type="email"
                placeholder="Enter your email"
                className="h-10 rounded-full border-zinc-200 bg-white px-4 pr-12 text-sm font-medium text-zinc-950 placeholder:text-zinc-500 focus-visible:ring-orange-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
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

          <div>
            <h3 className="mb-3 text-base font-bold tracking-tight lg:text-sm">
              Quick links
            </h3>
            <nav className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              {quickLinks.map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  className="block transition-colors hover:text-orange-600"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          <div>
            <h3 className="mb-3 text-base font-bold tracking-tight lg:text-sm">
              Contact us
            </h3>
            <address className="max-w-xs space-y-2 text-sm leading-6 text-zinc-600 not-italic dark:text-zinc-400">
              <p>{BRAND.name} Support</p>
              <p>Events, fundraising & community commerce.</p>
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

          <div>
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

        <div className="mt-8 flex items-center justify-center border-t border-zinc-200 pt-6 text-center lg:mt-10 dark:border-zinc-800">
          <p className="text-sm text-zinc-500">
            © 2026 {BRAND.name}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

export { Footerdemo };
