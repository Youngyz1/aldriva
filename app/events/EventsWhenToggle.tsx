"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type EventsWhenToggleProps = {
  activeWhen: "all" | "weekend";
};

/**
 * "When" filter pill toggle (All / This weekend). Writes the `when` param
 * (cleared for "all"), drops any explicit `date`, and preserves every other
 * param. Extracted from the former EventsHeaderControls when its "Browsing
 * events in" heading + location picker were merged into the Browse header.
 */
export default function EventsWhenToggle({ activeWhen }: EventsWhenToggleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setWhen(when: "all" | "weekend") {
    const params = new URLSearchParams(searchParams.toString());
    if (when === "weekend") params.set("when", "weekend");
    else params.delete("when");
    params.delete("date");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setWhen("all")}
        className={`rounded-full px-4 py-2 text-sm font-black transition ${
          activeWhen === "all"
            ? "bg-orange-500 text-white"
            : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:text-orange-600"
        }`}
      >
        All
      </button>
      <button
        type="button"
        onClick={() => setWhen("weekend")}
        className={`rounded-full px-4 py-2 text-sm font-black transition ${
          activeWhen === "weekend"
            ? "bg-orange-500 text-white"
            : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:text-orange-600"
        }`}
      >
        This weekend
      </button>
    </div>
  );
}
