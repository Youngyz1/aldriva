import Link from "next/link";

type Action = {
  href: string;
  label: string;
  primary?: boolean;
};

export default function DashboardModulePage({
  eyebrow,
  title,
  description,
  actions,
  items,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions: Action[];
  items: string[];
}) {
  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-950">
      <section className="mx-auto max-w-5xl rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-8">
        <p className="text-[10px] font-black uppercase tracking-wide text-orange-600 sm:text-sm">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight sm:mt-2 sm:text-5xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-zinc-600 sm:mt-4 sm:text-lg sm:leading-8">{description}</p>

        <div className="mt-5 flex flex-wrap gap-2 sm:mt-8 sm:gap-3">
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={`rounded-lg px-3 py-2 text-xs font-black transition sm:rounded-xl sm:px-5 sm:py-3 sm:text-sm ${
                action.primary
                  ? "bg-orange-600 text-white hover:bg-orange-700"
                  : "border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
              }`}
            >
              {action.label}
            </Link>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-10 sm:gap-4">
          {items.map((item) => (
            <div key={item} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200 sm:rounded-2xl sm:p-5">
              <p className="text-xs font-black sm:text-base">{item}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
