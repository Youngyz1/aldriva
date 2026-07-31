type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export default function DashboardPageHeader({
  eyebrow = "Dashboard",
  title,
  description,
  action,
}: Props) {
  return (
    <header className="flex flex-col gap-4 rounded-xl border border-zinc-200/80 bg-white px-5 py-4 shadow-sm sm:rounded-2xl sm:px-6 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-violet-600">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
        {description && (
          <p className="mt-2 text-sm font-medium text-zinc-500">{description}</p>
        )}
      </div>
      {action}
    </header>
  );
}
