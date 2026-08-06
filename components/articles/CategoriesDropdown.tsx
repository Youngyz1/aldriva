"use client";

import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";

export default function CategoriesDropdown({ categories }: { categories: string[] }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex items-center gap-1 text-sm font-bold text-zinc-600 outline-none transition hover:text-orange-600">
        Categories
        <ChevronDown className="h-3.5 w-3.5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={10}
          className="z-50 max-h-80 w-56 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-xl"
        >
          {categories.map((category) => (
            <DropdownMenu.Item key={category} asChild>
              <Link
                href={`/articles?category=${encodeURIComponent(category)}#latest-articles`}
                className="block cursor-pointer rounded-xl px-3 py-2 text-sm font-semibold text-zinc-700 outline-none transition hover:bg-orange-50 hover:text-orange-600"
              >
                {category}
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
