import PublicEmptyState from "@/components/public/PublicEmptyState";
import CampaignShowcaseMobileList from "@/components/fundraisers/CampaignShowcaseMobileList";
import CampaignShowcasePager, {
  type CampaignShowcasePage,
} from "@/components/fundraisers/CampaignShowcasePager";
import ShowcaseControls from "@/components/fundraisers/ShowcaseControls";

export interface CampaignShowcaseItem {
  id: string;
  slug: string;
  title: string;
  raised: number;
  goal: number;
  image: string | null;
  category?: string | null;
  organizer?: string | null;
  donorCount?: number;
}

export interface CampaignShowcaseEmptyState {
  icon?: string;
  title: string;
  description?: string;
  action?: { label: string; href: string };
}

interface CampaignShowcaseProps {
  basePath: string;
  /** Current smart-filter key for the discovery dropdown; optional for other callers. */
  activeFilter?: string;
  featured: CampaignShowcaseItem | null;
  items: CampaignShowcaseItem[];
  emptyState: CampaignShowcaseEmptyState;
}

// One big card + a 2×2 grid of four per page.
const PAGE_SIZE = 5;

/** Chunk the ordered campaigns into pages of one big + four small cards. */
function buildPages(
  featured: CampaignShowcaseItem | null,
  items: CampaignShowcaseItem[]
): CampaignShowcasePage[] {
  const ordered = featured ? [featured, ...items] : items;
  const pages: CampaignShowcasePage[] = [];

  for (let i = 0; i < ordered.length; i += PAGE_SIZE) {
    const group = ordered.slice(i, i + PAGE_SIZE);
    pages.push({
      key: group[0].id,
      big: group[0],
      small: group.slice(1),
      bigFeatured: i === 0 && Boolean(featured),
    });
  }

  return pages;
}

export default function CampaignShowcase({
  basePath,
  activeFilter = "all",
  featured,
  items,
  emptyState,
}: CampaignShowcaseProps) {
  const hasResults = Boolean(featured) || items.length > 0;
  const pages = buildPages(featured, items);

  const controls = <ShowcaseControls basePath={basePath} activeFilter={activeFilter} />;

  if (!hasResults) {
    return (
      <div>
        <div className="mb-6">{controls}</div>
        <PublicEmptyState {...emptyState} />
      </div>
    );
  }

  return (
    <div>
      {/* Desktop & tablet: capped single-page pager with header arrows. */}
      <div className="hidden sm:block">
        <CampaignShowcasePager pages={pages} controls={controls} />
      </div>

      {/* Mobile: compact GoFundMe-style vertical list, no horizontal scrolling. */}
      <div className="sm:hidden">
        <div className="mb-6">{controls}</div>
        <CampaignShowcaseMobileList featured={featured} items={items} />
      </div>
    </div>
  );
}
