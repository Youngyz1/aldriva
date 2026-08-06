import CoverageBand from "@/components/marketing/CoverageBand";

const DEEP_VIOLET = "#2E1065";

export default function ArticlesWriteCTA() {
  return (
    <CoverageBand
      pill="Become a contributor"
      headlineLines={["Share Your Knowledge", "With The Community"]}
      cta={{ label: "Write Your First Article", href: "/dashboard/articles/new" }}
      backgroundColor={DEEP_VIOLET}
      waveColor="#ffffff"
    >
      Whether it&apos;s a fundraising success story, a business lesson, or a
      technical deep dive — your experience could be exactly what someone else
      needs to read today. Publishing takes minutes.
    </CoverageBand>
  );
}
