"use client";

import Link from "next/link";
import { IconPlus as Plus } from "@tabler/icons-react";
import type { MyThingsSection } from "@/lib/my-things";
import {
  type AccountDashboardData,
  isBrandNewAccount,
} from "@/lib/dashboard/account-blocks-registry";
import { NeedsAttentionBlock } from "./blocks/NeedsAttentionBlock";
import { WorkspacesBlock } from "./blocks/WorkspacesBlock";
import { EventsBlock } from "./blocks/EventsBlock";
import { FundraisersBlock } from "./blocks/FundraisersBlock";
import { ArticlesBlock } from "./blocks/ArticlesBlock";
import { ProductsBlock } from "./blocks/ProductsBlock";
import { SupportingBlock } from "./blocks/SupportingBlock";
import { StartSomethingBlock } from "./blocks/StartSomethingBlock";
import { OnboardingBlock } from "./blocks/OnboardingBlock";

export interface MyThingsViewProps {
  displayName: string;
  accountData?: AccountDashboardData;
  sections?: MyThingsSection[];
  hasAny?: boolean;
}

export function MyThingsView({
  displayName,
  accountData,
  hasAny,
}: MyThingsViewProps) {
  // If accountData is provided, check whether it is a brand-new account
  const isBrandNew = accountData ? isBrandNewAccount(accountData) : !hasAny;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Account Dashboard Header with compact '+' action */}
      <header className="flex items-center justify-between border-b border-zinc-200/80 pb-5">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            What would you like to do today, {displayName}?
          </p>
        </div>
        <Link
          href="/dashboard/create"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white transition hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
          aria-label="Create new"
          title="Create new"
        >
          <Plus className="h-5 w-5" />
        </Link>
      </header>

      {/* Brand-new account state: ONE onboarding card instead of any blocks */}
      {isBrandNew || !accountData ? (
        <OnboardingBlock displayName={displayName} />
      ) : (
        <div className="space-y-6 sm:space-y-8">
          {/* 1. Needs attention */}
          <NeedsAttentionBlock items={accountData.attentionItems} />

          {/* 2. Workspaces (organizers/businesses) */}
          <WorkspacesBlock workspaces={accountData.workspaces} />

          {/* Primary Content Blocks: 2-column responsive layout for lists */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* 3. Events (own, organizer and team) */}
            <EventsBlock events={accountData.events} />

            {/* 4. Fundraisers the user runs */}
            <FundraisersBlock fundraisers={accountData.fundraisers} />

            {/* 5. Articles */}
            <ArticlesBlock articles={accountData.articles} />

            {/* 6. Products */}
            <ProductsBlock products={accountData.products} />

            {/* 7. Supporting: donations made and tickets bought */}
            <SupportingBlock supporting={accountData.supporting} />
          </div>

          {/* 8. Start something: suggested unused types */}
          <StartSomethingBlock suggestions={accountData.startSuggestions} />
        </div>
      )}
    </div>
  );
}
