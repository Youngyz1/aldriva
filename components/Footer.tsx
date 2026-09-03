// Legacy alias — prefer importing `MarketingFooter` / `MarketingSection`
// from `@/components/footers` in the layout or page that owns the tier.
// The root layout no longer renders any footer globally (see
// `components/footers/index.ts` for the footer strategy).
import { MarketingFooter } from "@/components/footers/MarketingFooter";

export default function Footer() {
  return <MarketingFooter />;
}
