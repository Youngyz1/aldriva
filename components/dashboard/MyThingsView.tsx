"use client";
import Link from "next/link";
import { Plus, Calendar, Heart, Store, Newspaper, ShoppingBag, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { MyThingsSection } from "@/lib/my-things";

const iconMap: Record<string, typeof Calendar> = {
  organizers: Building2,
  events: Calendar,
  fundraisers: Heart,
  businesses: Store,
  articles: Newspaper,
  products: ShoppingBag,
};

export function MyThingsView({ displayName, sections, hasAny }: { displayName: string; sections: MyThingsSection[]; hasAny: boolean }) {
  if (!hasAny) {
    return (
      <div className="space-y-6">
        <header className="pb-2 border-b border-zinc-200/80">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">My Things</h1>
          <p className="mt-1 text-sm text-zinc-500">Welcome, {displayName}. You haven&apos;t created anything yet.</p>
        </header>
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center">
          <p className="text-sm font-medium text-zinc-600">Create your first Event, Fundraiser, Business, Article, or Product.</p>
          <Button asChild className="mt-4">
            <Link href="/dashboard/create"><Plus className="mr-2 h-4 w-4" /> Create New</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200/80 pb-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">My Things</h1>
          <p className="mt-1 text-sm text-zinc-500">Select an entity to manage it. What would you like to do today, {displayName}?</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/create"><Plus className="mr-2 h-4 w-4" /> Create New</Link>
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {sections.map((section) => {
          const Icon = iconMap[section.key] ?? Calendar;
          return (
            <Card key={section.key} className="flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-50 border">
                    <Icon className="h-4 w-4 text-zinc-600" />
                  </div>
                  <CardTitle className="text-sm font-bold">{section.label}</CardTitle>
                </div>
                <Link href={section.listHref} className="text-xs font-semibold text-primary hover:underline">View all →</Link>
              </CardHeader>
              <CardContent className="flex-1">
                {section.items.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-4 text-center">
                    <p className="text-xs text-zinc-500">No {section.label.toLowerCase()} yet.</p>
                    <Button asChild variant="outline" size="sm" className="mt-2">
                      <Link href={section.createHref}><Plus className="mr-1 h-3 w-3" /> Create</Link>
                    </Button>
                  </div>
                ) : (
                  <ul className="divide-y divide-zinc-100 -mx-6">
                    {section.items.slice(0, 5).map((item) => (
                      <li key={item.id} className="px-6 py-3 flex items-center justify-between gap-3 hover:bg-zinc-50">
                        <div className="min-w-0">
                          <Link href={item.href} className="block truncate text-sm font-semibold text-zinc-900 hover:text-primary hover:underline">
                            {item.title}
                          </Link>
                          <p className="text-xs text-zinc-500 truncate">{item.status ?? "—"} · {new Date(item.created_at).toLocaleDateString()}</p>
                        </div>
                        <Button asChild size="sm" variant="outline" className="shrink-0">
                          <Link href={item.href}>Manage</Link>
                        </Button>
                      </li>
                    ))}
                    {section.items.length > 5 && (
                      <li className="px-6 py-2 text-xs text-zinc-500">+{section.items.length - 5} more — <Link href={section.listHref} className="font-semibold text-primary hover:underline">view all</Link></li>
                    )}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
