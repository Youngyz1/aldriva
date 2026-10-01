import { CompactSection } from "@/components/footers";

// Gated detail routes (articles/[slug], businesses/[slug],
// products/[slug]) are individual content pages → compact footer tier.
// (Previously these inherited the global marketing footer from the root
// layout; the root layout no longer renders any footer.)
export default function GatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <CompactSection>{children}</CompactSection>;
}
