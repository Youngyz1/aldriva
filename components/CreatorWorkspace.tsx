import type { ReactNode } from "react";
import Link from "next/link";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

type Step = {
  label: string;
};

type SidebarItem = {
  label: string;
  href: string;
};

const sidebarItems: SidebarItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Organizations", href: "/dashboard/organizations" },
  { label: "Analytics", href: "/dashboard/analytics" },
  { label: "Settings", href: "/dashboard/settings" },
];

const mobileDashboardItems: SidebarItem[] = [
  { label: "Home", href: "/" },
  { label: "Overview", href: "/dashboard" },
  { label: "Organizations", href: "/dashboard/organizations" },
  { label: "Settings", href: "/dashboard/settings" },
];

export function CreatorWorkspace({
  active,
  accent,
  title,
  description,
  email,
  steps,
  currentStep,
  onStepChange,
  onSaveDraft,
  children,
  aside,
  footer,
}: {
  active: "Events" | "Fundraisers";
  accent: "orange" | "green";
  title: string;
  description: string;
  email?: string | null;
  steps: Step[];
  currentStep: number;
  onStepChange: (step: number) => void;
  onSaveDraft: () => void;
  children: ReactNode;
  aside: ReactNode;
  footer: ReactNode;
}) {
  const accentClasses = {
    orange: {
      text: "text-orange-600",
      bg: "bg-orange-600",
      soft: "bg-orange-50 text-orange-700",
      activeNav: "bg-blue-600/20 text-white ring-1 ring-blue-400/20",
      ring: "ring-orange-500",
      dot: "bg-orange-500",
    },
    green: {
      text: "text-emerald-600",
      bg: "bg-emerald-600",
      soft: "bg-emerald-50 text-emerald-700",
      activeNav: "bg-emerald-600/20 text-white ring-1 ring-emerald-400/20",
      ring: "ring-emerald-500",
      dot: "bg-emerald-500",
    },
  };
  const theme = accentClasses[accent];

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-950">
      <div className="mx-auto flex max-w-[1500px] gap-5 px-3 py-4 sm:px-6 sm:py-5 lg:px-8">
        {/* Desktop sidebar */}
        <aside className="sticky top-5 hidden h-[calc(100vh-2.5rem)] w-56 shrink-0 rounded-2xl bg-slate-950 p-4 text-white shadow-xl shadow-slate-950/15 lg:flex lg:flex-col">
          <Link href="/" className="mb-8 flex items-center gap-3 px-2">
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${theme.bg} text-lg font-black`}>E</span>
            <span className="text-sm font-black">EventBrite</span>
          </Link>

          <nav className="space-y-1 text-sm font-bold text-slate-300">
            {sidebarItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
                  item.label === active ? theme.activeNav : "hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {item.label}
              </Link>
            ))}
          </nav>

          <Link href="/about" className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-300 hover:bg-white/10 hover:text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            Help & Support
          </Link>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Mobile top nav — dashboard links only, no search/location/email pill */}
          <nav className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-zinc-200/80 bg-white px-1.5 py-2 text-center text-[10px] font-black text-slate-700 shadow-sm sm:gap-2 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-xs lg:hidden">
            {mobileDashboardItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="shrink-0 whitespace-nowrap rounded-lg px-2.5 py-2 transition hover:bg-zinc-100 sm:px-3"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <section className="min-w-0 flex-1 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm sm:rounded-2xl">
            {/* Header: title + actions only — no search bar, no location bar, no email pill */}
            <header className="border-b border-zinc-200 bg-white">
              <div className="flex flex-col justify-between gap-4 px-5 py-5 sm:flex-row sm:items-center">
                <div>
                  <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
                  <p className="mt-1 text-sm font-medium text-zinc-500">{description}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button onClick={onSaveDraft} type="button" className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-black text-zinc-900 hover:bg-zinc-50">
                    Save as Draft
                  </button>
                  <Link href="/dashboard" className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-black text-zinc-500 hover:bg-zinc-50">
                    Close
                  </Link>
                </div>
              </div>

              {/* Step rail — slim horizontal, no bordered box */}
              <div className="px-5 pb-5">
                <div className="flex items-center">
                  {steps.map((step, index) => {
                    const isActive = index === currentStep;
                    const isComplete = index < currentStep;
                    const isLast = index === steps.length - 1;
                    return (
                      <div key={step.label} className="flex min-w-0 flex-1 items-center">
                        <button
                          onClick={() => onStepChange(index)}
                          type="button"
                          className="flex shrink-0 flex-col items-center gap-1.5"
                          aria-current={isActive ? "step" : undefined}
                        >
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black transition ${
                              isComplete
                                ? `${theme.bg} text-white`
                                : isActive
                                  ? `ring-2 ${theme.ring} ring-offset-2 ${theme.bg} text-white`
                                  : "bg-zinc-100 text-zinc-400"
                            }`}
                          >
                            {isComplete ? (
                              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              index + 1
                            )}
                          </span>
                          <span className={`hidden text-[10px] font-black leading-none sm:block ${isActive ? "text-zinc-950" : "text-zinc-400"}`}>
                            {step.label}
                          </span>
                        </button>
                        {!isLast && (
                          <div
                            className={`mx-2 h-px flex-1 transition ${isComplete ? theme.bg : "bg-zinc-200"}`}
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </header>

            <div className="grid gap-5 bg-white p-5 xl:grid-cols-[1fr_320px]">
              <div>{children}</div>
              <aside className="space-y-5">{aside}</aside>
            </div>

            <div className="border-t border-zinc-200 bg-white px-5 py-4">{footer}</div>
          </section>
        </div>
      </div>
    </main>
  );
}

/**
 * FormSection — flat form-section primitive.
 *
 * Renders a small-caps uppercase label + optional thin divider + children,
 * with NO card chrome (no border, no shadow, no rounded container, no distinct
 * background). Sections are separated by spacing alone.
 */
export function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <p className="shrink-0 text-[10px] font-black uppercase tracking-widest text-zinc-400">{title}</p>
        <div className="h-px flex-1 bg-zinc-100" aria-hidden="true" />
      </div>
      {children}
    </section>
  );
}

/**
 * CreatorPanel — thin alias for FormSection kept for backward compatibility
 * with the create-fundraiser page and any other callers.
 *
 * Previously this rendered a white bordered card. It now delegates to
 * FormSection so that both form creation flows get the same flat look
 * without requiring a separate refactor of create-fundraiser.
 */
export function CreatorPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return <FormSection title={title}>{children}</FormSection>;
}

export function CreatorField({
  label,
  children,
  hint,
  /**
   * Render as a plain group instead of a <label>.
   *
   * Required for any field whose children are a composite widget rather than a
   * single control. A <label> with no htmlFor implicitly targets its FIRST
   * labelable descendant, and a click anywhere inside it activates that
   * control. Wrapping the story editor this way meant tapping the text area
   * activated the editor's hidden <input type="file">, opening the image picker.
   */
  asGroup = false,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  asGroup?: boolean;
}) {
  const caption = (
    <span className="mb-2 block text-sm font-black text-zinc-800">{label}</span>
  );
  const hintNode = hint ? (
    <span className="mt-2 block text-xs font-medium text-zinc-500">{hint}</span>
  ) : null;

  if (asGroup) {
    return (
      <div className="block" role="group" aria-label={label}>
        {caption}
        {children}
        {hintNode}
      </div>
    );
  }

  return (
    <label className="block">
      {caption}
      {children}
      {hintNode}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-500 focus:ring-4 focus:ring-orange-100";

export const greenInputClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100";
