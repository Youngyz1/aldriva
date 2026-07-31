"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface ProfileTabDef {
  id: string;
  label: string;
  count?: number;
  content: React.ReactNode;
}

interface ProfileTabsProps {
  tabs: ProfileTabDef[];
  /** Uncontrolled — which tab starts active. Ignored if `value` is passed. */
  defaultTab?: string;
  /** Controlled active tab id. */
  value?: string;
  onValueChange?: (id: string) => void;
  className?: string;
}

/**
 * Renders tabs dynamically from a `tabs` array — this is the one place a
 * profile page decides which modules are available (see lib/profile-modules
 * for the org_type -> module mapping); this component has no opinion about
 * what a "tab" represents.
 */
export default function ProfileTabs({
  tabs,
  defaultTab,
  value,
  onValueChange,
  className,
}: ProfileTabsProps) {
  if (tabs.length === 0) return null;

  return (
    <Tabs
      defaultValue={defaultTab ?? tabs[0].id}
      value={value}
      onValueChange={onValueChange}
      className={className}
    >
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id}>
            {tab.label}
            {typeof tab.count === "number" && tab.count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-black",
                  "bg-zinc-100 text-zinc-500 group-data-[state=active]:bg-orange-100 group-data-[state=active]:text-orange-700"
                )}
              >
                {tab.count}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id} className="p-4 sm:p-5">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
