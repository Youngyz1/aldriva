type TrustBarProps = {
  stats: { label: string; value: string }[];
};

export default function TrustBar({ stats }: TrustBarProps) {
  if (stats.length === 0) return null;

  return (
    <section className="border-y border-zinc-100 bg-zinc-50/80">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-6 sm:grid-cols-4 sm:gap-6 sm:px-6 lg:px-8">
        {stats.map((stat) => (
          <div key={stat.label} className="text-center sm:text-left">
            <p className="text-xl font-black text-zinc-950 sm:text-2xl">{stat.value}</p>
            <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:text-sm">
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
