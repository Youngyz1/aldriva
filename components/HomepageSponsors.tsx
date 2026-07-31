import Image from "next/image";
import type { PublicSponsor } from "@/types/homepage-cms";

interface Props {
  sponsors: PublicSponsor[];
}

export default function HomepageSponsors({ sponsors }: Props) {
  if (sponsors.length === 0) return null;

  return (
    <section className="border-t border-zinc-100 bg-white py-10 sm:py-14">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
        <div className="mb-6 text-center sm:mb-8">
          <p className="text-xs font-black uppercase tracking-widest text-orange-600">
            Our Sponsors
          </p>
          <h2 className="mt-1 text-xl font-black tracking-tight text-zinc-950 sm:text-2xl">
            Proudly supported by
          </h2>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
          {sponsors.map((sponsor) => {
            const logo = sponsor.logo_url ? (
              <Image
                src={sponsor.logo_url}
                alt={sponsor.name}
                width={160}
                height={48}
                className="max-h-10 w-auto max-w-[140px] object-contain grayscale transition duration-300 hover:grayscale-0 sm:max-h-12 sm:max-w-[160px]"
              />
            ) : (
              <span className="text-sm font-black text-zinc-400">{sponsor.name}</span>
            );

            if (sponsor.website_url) {
              return (
                <a
                  key={sponsor.id}
                  href={sponsor.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center rounded-xl px-4 py-3 transition hover:bg-zinc-50"
                  title={sponsor.name}
                >
                  {logo}
                </a>
              );
            }

            return (
              <div
                key={sponsor.id}
                className="flex items-center justify-center rounded-xl px-4 py-3"
                title={sponsor.name}
              >
                {logo}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
