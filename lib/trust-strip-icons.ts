import type { ComponentType } from "react";
import {
  IconCalendar,
  IconCheck,
  IconClock,
  IconCreditCard,
  IconAward,
  IconHeadset,
  IconRefresh,
  IconShieldCheck,
  IconShoppingBag,
  IconSparkles,
  IconToolsKitchen2,
  IconTruck,
} from "@tabler/icons-react";

/**
 * Icon lookup for trust/services strip items — shared between the server
 * (BlockRenderer's static row for non-showcase templates) and the client
 * (Showcase's ServicesMarquee), so neither pulls the other's module graph
 * across the server/client boundary.
 */
const TRUST_STRIP_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  shield: IconShieldCheck,
  shield_check: IconShieldCheck,
  iconshieldcheck: IconShieldCheck,
  truck: IconTruck,
  delivery: IconTruck,
  shipping: IconTruck,
  icontruck: IconTruck,
  refresh: IconRefresh,
  returns: IconRefresh,
  iconrefresh: IconRefresh,
  sparkles: IconSparkles,
  quality: IconSparkles,
  iconsparkles: IconSparkles,
  clock: IconClock,
  time: IconClock,
  iconclock: IconClock,
  credit_card: IconCreditCard,
  card: IconCreditCard,
  payment: IconCreditCard,
  iconcreditcard: IconCreditCard,
  award: IconAward,
  guarantee: IconAward,
  iconaward: IconAward,
  headset: IconHeadset,
  support: IconHeadset,
  contact: IconHeadset,
  iconheadset: IconHeadset,
  bag: IconShoppingBag,
  pickup: IconShoppingBag,
  shoppingbag: IconShoppingBag,
  iconshoppingbag: IconShoppingBag,
  calendar: IconCalendar,
  reservations: IconCalendar,
  booking: IconCalendar,
  iconcalendar: IconCalendar,
  kitchen: IconToolsKitchen2,
  ordering: IconToolsKitchen2,
  icontoolskitchen2: IconToolsKitchen2,
};

export function resolveTrustIcon(name?: string, index = 0): ComponentType<{ className?: string }> {
  if (name) {
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (TRUST_STRIP_ICONS[key]) return TRUST_STRIP_ICONS[key];
  }
  const fallbacks = [IconCheck, IconSparkles];
  return fallbacks[index % fallbacks.length];
}
