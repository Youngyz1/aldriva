import Link from "next/link";
import CoverageBand from "@/components/marketing/CoverageBand";

/**
 * Fundraisers "we've got you covered" band. Supplies the copy and real inline
 * links to the generic <CoverageBand>.
 *
 * NOTE — dependency for the upcoming FAQ section: the "Still have questions?"
 * link points to the in-page anchor `#faq`. When the FAQ section is built
 * (next in the build order, further down this same page), its root element
 * MUST carry `id="faq"` or this link will not resolve.
 */
export default function WhyAldriva() {
  return (
    <CoverageBand
      pill="We've got you covered"
      headlineLines={["Everything you need to launch,", "grow, and fund your cause."]}
      stillHaveQuestions={{ label: "Read the FAQ", href: "#faq" }}
    >
      From{" "}
      <Link href="/fundraisers?filter=trending">trending campaigns</Link>{" "}
      building real momentum to{" "}
      <Link href="/fundraisers?filter=just-launched">newly launched causes</Link>{" "}
      finding their first backers, Aldriva hands every organizer the tools to
      go from idea to funded. When you&apos;re ready,{" "}
      <Link href="/create-fundraiser">start your fundraiser</Link> — it takes
      just minutes.
    </CoverageBand>
  );
}
