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
    <div className="space-y-6">
      <header className="pb-1">
        <p className="text-xs font-black uppercase tracking-wide text-orange-600">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl lg:text-4xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-zinc-600 sm:text-base">{description}</p>

        <div className="mt-5 flex flex-wrap gap-2 sm:gap-3">
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={`rounded-xl px-4 py-2.5 text-xs font-bold transition shadow-xs sm:px-5 sm:py-3 sm:text-sm ${
                action.primary
                  ? "bg-orange-600 text-white hover:bg-orange-700"
                  : "border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
              }`}
            >
              {action.label}
            </Link>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-4">
        {items.map((item) => (
          <div key={item} className="rounded-xl border border-zinc-200/60 bg-white p-4 shadow-xs sm:rounded-2xl sm:p-5">
            <p className="text-xs font-bold text-zinc-900 sm:text-sm">{item}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
