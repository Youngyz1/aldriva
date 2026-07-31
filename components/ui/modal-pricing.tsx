"use client";

/**
 * components/ui/modal-pricing.tsx
 * Plan-selection modal for Aldriva organizer tiers.
 * Adapted from 21st.dev design — uses shadcn Dialog + RadioGroup.
 */

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Check, Sparkles, Zap } from "lucide-react";

export interface PlanOption {
  id:          string;
  name:        string;
  price:       string;
  description: string;
  features:    string[];
}

export const RALLY_UP_PLANS: PlanOption[] = [
  {
    id:          "starter",
    name:        "Starter",
    price:       "Free",
    description: "Launch your first event or fundraiser",
    features:    ["1 active event", "Basic ticket sales", "Public profile", "Email support"],
  },
  {
    id:          "pro",
    name:        "Pro",
    price:       "$19",
    description: "For active organizers",
    features:    ["Unlimited events", "Fundraiser campaigns", "Analytics dashboard", "Priority support", "Custom branding"],
  },
  {
    id:          "business",
    name:        "Business",
    price:       "$49",
    description: "For agencies & large organizations",
    features:    ["Everything in Pro", "Sponsor marketplace", "Team members", "Dedicated account manager", "SLA guarantee"],
  },
];

interface ModalPricingProps {
  plans?: PlanOption[];
  /** Label for the trigger button */
  triggerLabel?: string;
  /** Called when user confirms a plan */
  onConfirm?: (planId: string) => void;
}

export function ModalPricing({
  plans      = RALLY_UP_PLANS,
  triggerLabel = "Upgrade Plan",
  onConfirm,
}: ModalPricingProps) {
  const [isOpen,       setIsOpen]       = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(plans[1]?.id ?? plans[0]?.id);

  function handleConfirm() {
    onConfirm?.(selectedPlan);
    setIsOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-700 transition-colors"
      >
        <Sparkles className="h-4 w-4" />
        {triggerLabel}
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[480px] bg-white border border-zinc-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-black text-zinc-950">
              <Zap className="h-5 w-5 text-orange-600" />
              Choose Your Plan
            </DialogTitle>
            <p className="text-sm text-zinc-500">
              Select the perfect plan for your needs. Upgrade or downgrade at any time.
            </p>
          </DialogHeader>

          <RadioGroup
            value={selectedPlan}
            onValueChange={setSelectedPlan}
            className="gap-3 py-2"
          >
            {plans.map((plan) => (
              <label
                key={plan.id}
                className={`relative flex flex-col p-4 cursor-pointer rounded-2xl border-2 transition-all ${
                  selectedPlan === plan.id
                    ? "border-orange-500 bg-orange-50"
                    : "border-zinc-200 hover:border-zinc-300"
                }`}
              >
                <RadioGroupItem value={plan.id} className="sr-only" />

                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-black text-zinc-950">{plan.name}</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">{plan.description}</p>
                  </div>
                  <div className="flex items-baseline">
                    <span className="text-2xl font-black text-zinc-950">{plan.price}</span>
                    {plan.price !== "Free" && (
                      <span className="ml-1 text-xs text-zinc-400">/mo</span>
                    )}
                  </div>
                </div>

                <ul className="mt-2 space-y-1.5">
                  {plan.features.map((feat, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-zinc-600">
                      <Check className={`h-3.5 w-3.5 flex-shrink-0 ${
                        selectedPlan === plan.id ? "text-orange-600" : "text-zinc-400"
                      }`} />
                      {feat}
                    </li>
                  ))}
                </ul>

                {selectedPlan === plan.id && (
                  <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-orange-600">
                    <Check className="h-3 w-3 text-white" />
                  </span>
                )}
              </label>
            ))}
          </RadioGroup>

          <DialogFooter className="flex flex-col gap-2 pt-2">
            <button
              onClick={handleConfirm}
              className="w-full rounded-xl bg-orange-600 py-3 text-sm font-black text-white hover:bg-orange-700 transition-colors"
            >
              Confirm Selection
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="w-full rounded-xl py-3 text-sm font-semibold text-zinc-500 hover:text-zinc-800 transition-colors"
            >
              Cancel
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
