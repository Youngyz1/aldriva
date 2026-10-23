"use client";

import Link from "next/link";
import {
  IconPlus as Plus,
  IconCalendar as Calendar,
  IconHeart as Heart,
  IconBuildingStore as Store,
  IconNews as Newspaper,
  IconShoppingBag as ShoppingBag,
  IconBuilding as Building2,
  IconTicket as Ticket,
  IconGift as Gift,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import type { MyThingsSection } from "@/lib/my-things";

const iconMap: Record<string, typeof Calendar> = {
  organizers: Building2,
  tickets: Ticket,
  donations: Gift,
  events: Calendar,
  fundraisers: Heart,
  businesses: Store,
  articles: Newspaper,
  products: ShoppingBag,
  orders: ShoppingBag,
};

export function MyThingsView({
  displayName,
  sections,
  hasAny,
}: {
  displayName: string;
  sections: MyThingsSection[];
  hasAny: boolean;
}) {
  if (!hasAny) {
    return (
      <div className="space-y-6">
        <header className="pb-2 border-b border-zinc-200/80">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl text-zinc-950">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500">Welcome, {displayName}. You haven&apos;t created or purchased anything yet.</p>
        </header>
        <div className="py-8 text-center">
          <p className="text-sm font-semibold text-zinc-600">
            Create your first Event, Fundraiser, Business, Article, or Product.
          </p>
          <Button asChild className="mt-4 rounded-xl bg-brand-700 font-bold hover:bg-brand-800">
            <Link href="/dashboard/create">
              <Plus className="mr-2 h-4 w-4" /> Create New
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200/80 pb-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl text-zinc-950">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500">
            What would you like to do today, {displayName}?
          </p>
        </div>
        <Button asChild className="rounded-xl bg-brand-700 font-bold hover:bg-brand-800">
          <Link href="/dashboard/create">
            <Plus className="mr-2 h-4 w-4" /> Create New
          </Link>
        </Button>
      </header>

      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
        {sections.map((section) => {
          const Icon = iconMap[section.key] ?? Calendar;
          const isOrganizer = section.key === "organizers";

          return (
            <section key={section.key} className="min-w-0 border-b border-zinc-200 pb-6 last:border-b-0">
              <header className="flex items-center justify-between gap-3 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-50 border border-zinc-200">
                    <Icon className="h-4 w-4 text-zinc-700" />
                  </div>
                  <h2 className="text-base font-black text-zinc-950">{section.label}</h2>
                </div>
                <Link
                  href={section.listHref}
                  className="text-xs font-bold text-orange-700 hover:text-orange-800 hover:underline"
                >
                  View all →
                </Link>
              </header>
              <div>
                {section.items.length === 0 ? (
                  <div className="py-3">
                    <p className="text-xs font-semibold text-zinc-500">No {section.label.toLowerCase()} yet.</p>
                    {section.createHref && (
                      <Button asChild variant="outline" size="sm" className="mt-2 rounded-xl text-xs font-bold">
                        <Link href={section.createHref}>
                          <Plus className="mr-1 h-3 w-3" /> {section.createLabel || "Create"}
                        </Link>
                      </Button>
                    )}
                  </div>
                ) : (
                  <ul className="divide-y divide-zinc-100">
                    {section.items.slice(0, 5).map((item) => (
                      <li
                        key={item.id}
                        className="py-3 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <Link
                            href={item.href}
                            className="block truncate text-sm font-bold text-zinc-900 hover:text-orange-700"
                          >
                            {item.title}
                          </Link>
                          <p className="text-xs font-medium text-zinc-500 truncate">
                            {item.subtitle ? (
                              <span>{item.subtitle} · </span>
                            ) : null}
                            {item.status ? `${item.status} · ` : ""}
                            {new Date(item.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="shrink-0 rounded-xl text-xs font-bold hover:border-orange-200 hover:text-orange-700"
                        >
                          <Link href={item.href}>
                            {isOrganizer ? "Workspace" : "View"}
                          </Link>
                        </Button>
                      </li>
                    ))}
                    {section.items.length > 5 && (
                      <li className="py-2.5 text-xs text-zinc-500">
                        +{section.items.length - 5} more —{" "}
                        <Link
                          href={section.listHref}
                          className="font-bold text-orange-700 hover:underline"
                        >
                          view all
                        </Link>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
