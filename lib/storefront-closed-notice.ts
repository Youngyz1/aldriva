/**
 * lib/storefront-closed-notice.ts
 *
 * Labels for the closed-business ordering copy.
 *
 * Both Storefront messages carry a `{time}` ICU placeholder, but the value is
 * only known at render time in the customer-facing components (it comes from
 * the resolved next opening / scheduled_for). So the labels are built with the
 * literal placeholder and StorefrontBrowse substitutes it per order.
 *
 * The value must still be passed to the translator: next-intl's development
 * formatter compiles the ICU message and raises MISSING_VALUE (surfaced as
 * FORMATTING_ERROR) when a referenced placeholder has no value, which crashed
 * the website builder preview. Passing `{ time: "{time}" }` keeps the template
 * intact instead of failing.
 */
export const CLOSED_NOTICE_TIME_PLACEHOLDER = "{time}";

type ClosedNoticeLabels = {
  orderWhileClosed: string;
  closedOpensAt: string;
};

/**
 * `t` is next-intl's translator (or a test double with the same signature).
 * Typed generically so the app's typed translator satisfies the parameter
 * without a cast while the helper stays usable from tests.
 */
export function buildClosedNoticeLabels<
  T extends (
    key: "orderWhileClosed" | "closedOpensAt",
    values: { time: string }
  ) => string,
>(t: T): ClosedNoticeLabels {
  const values = { time: CLOSED_NOTICE_TIME_PLACEHOLDER };
  return {
    orderWhileClosed: t("orderWhileClosed", values),
    closedOpensAt: t("closedOpensAt", values),
  };
}

/** Fills the `{time}` placeholder with an already-formatted opening time. */
export function fillClosedNoticeTime(template: string, time: string): string {
  return template.replace(CLOSED_NOTICE_TIME_PLACEHOLDER, time);
}
