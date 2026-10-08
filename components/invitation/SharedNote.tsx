/**
 * components/invitation/SharedNote.tsx
 *
 * Neutral placeholder rendered on the general share link wherever a
 * guest-only block (personal greeting, RSVP controls, entry pass) would
 * appear on a personal guest link. Contains no guest data by construction.
 */

const COPY = {
  en: "Shared view — personal greetings, RSVP and entry passes appear only on personal guest links.",
  fr: "Vue partagée — les salutations personnelles, les RSVP et les laissez-passer n'apparaissent que sur les liens d'invités personnels.",
} as const;

export function SharedNote({ locale = "en" }: { locale?: "en" | "fr" }) {
  return (
    <p
      data-testid="shared-note"
      className="mx-auto my-4 max-w-md rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-center text-xs font-semibold text-zinc-500"
    >
      {COPY[locale] ?? COPY.en}
    </p>
  );
}
