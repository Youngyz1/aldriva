import { getApprovedMemoriesCount } from "./public-gallery";

export interface MemoriesProps {
  memoriesToken: string | undefined;
  memoriesCount: number;
}

/**
 * Page statuses the guest memories route resolves a target for. Anything else
 * (draft, archived, …) makes the route 404, so the invitation page must not
 * advertise a memories count either.
 */
const VISIBLE_PAGE_STATUSES = new Set(["published", "unlisted"]);

/** Share tokens are only recognised in the 64-char hex format the route uses. */
function isShareToken(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

/**
 * Resolves memories token and count based on share_enabled status and page
 * visibility. Returns the share token and the approved memories count only when
 * the page is published or unlisted and the token is route-valid; otherwise
 * returns undefined token and count 0, matching the route's 404 behaviour.
 */
export async function resolveMemoriesProps(
  shareEnabled: boolean,
  shareToken: string | undefined,
  eventId: string,
  showMemories: boolean,
  pageStatus: string | null | undefined
): Promise<MemoriesProps> {
  let memoriesToken: string | undefined;
  let memoriesCount = 0;

  const pageVisible =
    typeof pageStatus === "string" && VISIBLE_PAGE_STATUSES.has(pageStatus);

  if (shareEnabled && pageVisible && isShareToken(shareToken)) {
    memoriesToken = shareToken;
    memoriesCount = await getApprovedMemoriesCount(eventId, showMemories);
  }

  return { memoriesToken, memoriesCount };
}
