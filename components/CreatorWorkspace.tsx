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
    },
    green: {
      text: "text-emerald-600",
      bg: "bg-emerald-600",
      soft: "bg-emerald-50 text-emerald-700",
      activeNav: "bg-emerald-600/20 text-white ring-1 ring-emerald-400/20",
    },
  };
  const theme = accentClasses[accent];

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-950">
      <div className="mx-auto flex max-w-[1500px] gap-5 px-3 py-4 sm:px-6 sm:py-5 lg:px-8">
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
          <header className="border-b border-zinc-200 bg-white">
            <div className="flex flex-col gap-3 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="grid gap-3 sm:grid-cols-[1fr_220px] xl:w-[620px]">
                <label className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-semibold text-zinc-500">
                  <i className="ti ti-search text-lg" aria-hidden="true" />
                  <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder="Search events..." type="search" />
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-semibold text-zinc-500">
                  <i className="ti ti-map-pin text-lg" aria-hidden="true" />
                  <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder="Location" type="search" />
                </label>
              </div>

              <div className="flex items-center justify-between gap-3 xl:justify-end">
                <button className="hidden rounded-xl p-2.5 text-zinc-500 hover:bg-zinc-50 sm:block" type="button" aria-label="Notifications">
                  <i className="ti ti-bell text-xl" aria-hidden="true" />
                </button>
                <div className="flex h-10 items-center gap-2 rounded-xl bg-zinc-50 px-3 text-sm font-black text-zinc-700 ring-1 ring-zinc-200">
                  <LocalBrandedPlaceholder
                    variant="avatar"
                    title={email || "User"}
                    initials={(email || "U").charAt(0).toUpperCase()}
                    className={`h-6 w-6 rounded-full from-transparent to-transparent text-xs text-white ${theme.bg}`}
                  />
                  <span className="max-w-32 truncate">{email || "User"}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-between gap-4 px-5 pb-5 pt-3 xl:flex-row xl:items-end">
              <div>
                <h1 className="text-3xl font-black tracking-tight">{title}</h1>
                <p className="mt-1 text-sm font-medium text-zinc-500">{description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={onSaveDraft} type="button" className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-black text-zinc-900 hover:bg-zinc-50">
                  Save as Draft
                </button>
                <Link href="/dashboard" className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-black text-zinc-500 hover:bg-zinc-50">
                  Close
                </Link>
              </div>
            </div>

            <div className="border-t border-zinc-100 px-5 py-4">
              <div className="grid gap-3 md:grid-cols-5">
                {steps.map((step, index) => {
                  const activeStep = index === currentStep;
                  const complete = index < currentStep;
                  return (
                    <button
                      key={step.label}
                      onClick={() => onStepChange(index)}
                      type="button"
                      className="flex items-center gap-3 text-left"
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                          activeStep || complete ? `${theme.bg} text-white` : "bg-zinc-100 text-zinc-500"
                        }`}
                      >
                        {index + 1}
                      </span>
                      <span className={`text-xs font-black ${activeStep ? "text-zinc-950" : "text-zinc-500"}`}>{step.label}</span>
                    </button>
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

export function CreatorPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function CreatorField({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-zinc-800">{label}</span>
      {children}
      {hint && <span className="mt-2 block text-xs font-medium text-zinc-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-500 focus:ring-4 focus:ring-orange-100";

export const greenInputClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100";
