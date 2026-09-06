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
    <header className="flex flex-col gap-4 pb-1 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-orange-600">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">{title}</h1>
        {description && (
          <p className="mt-1 text-sm font-medium text-zinc-500">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

