import { NextResponse } from "next/server";

/**
 * Round 5: the standalone card-design write no longer exists. Template
 * selection lives in the invitation page builder and writes through
 * setUnifiedInvitationTemplate (card + page together).
 *
 * 410 Gone (not 404): the resource existed and was intentionally removed.
 * The route must never write the card column alone again.
 */
export async function PATCH() {
  return NextResponse.json(
    {
      error:
        "Template selection moved to the invitation page builder. Card-only writes are no longer accepted.",
    },
    { status: 410 }
  );
}
