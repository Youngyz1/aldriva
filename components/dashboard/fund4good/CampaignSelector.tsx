"use client";

import { ChevronDown } from "lucide-react";
import { type Campaign, formatCurrency } from "@/lib/fund4good-data";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { getStatusMeta } from "./campaign-status";

interface CampaignSelectorProps {
  campaigns: Campaign[];
  selectedCampaign: Campaign;
  onSelect: (campaign: Campaign) => void;
}

export function CampaignSelector({ campaigns, selectedCampaign, onSelect }: CampaignSelectorProps) {
  const config = getStatusMeta(selectedCampaign.status, selectedCampaign.healthScore);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="group flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-left transition-all hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            aria-label="Select campaign"
          >
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-medium text-slate-400 leading-none mb-1">Campaign</span>
              <span className="text-sm font-semibold text-slate-900 leading-none truncate">
                {selectedCampaign.title}
              </span>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0 transition-transform group-data-[state=open]:rotate-180" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72 p-1" sideOffset={4}>
          {campaigns.map((campaign) => {
            const cfg = getStatusMeta(campaign.status, campaign.healthScore);
            return (
              <DropdownMenuItem
                key={campaign.id}
                onSelect={() => onSelect(campaign)}
                className={cn(
                  "flex items-start gap-3 rounded-lg px-3 py-3 cursor-pointer",
                  selectedCampaign.id === campaign.id && "bg-violet-50"
                )}
              >
                <div className={cn("mt-0.5 h-2 w-2 rounded-full flex-shrink-0", cfg.dot)} />
                <div className="flex flex-col gap-1 min-w-0">
                  <span className={cn("text-sm font-medium leading-tight text-slate-900 break-words", selectedCampaign.id === campaign.id && "text-violet-700")}>
                    {campaign.title}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatCurrency(campaign.raised, campaign.currency, true)} of{" "}
                    {formatCurrency(campaign.goal, campaign.currency, true)} · {campaign.daysRemaining > 0 ? `${campaign.daysRemaining}d left` : "Ended"}
                  </span>
                </div>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <Badge
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap",
          config.color
        )}
        variant="outline"
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
        {config.label}
      </Badge>
    </div>
  );
}
