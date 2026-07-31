import Image from "next/image";
import { UserCircle2 } from "lucide-react";
import type { PublicTestimonial } from "@/types/homepage-cms";

interface Props {
  testimonials: PublicTestimonial[];
}

export default function HomepageTestimonials({ testimonials }: Props) {
  if (testimonials.length === 0) return null;

  return (
    <section className="bg-zinc-50 py-10 sm:py-16">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
        <div className="mb-6 sm:mb-10">
          <p className="text-xs font-black uppercase tracking-widest text-violet-600">
            Testimonials
          </p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-zinc-950 sm:text-4xl">
            What people are saying
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {testimonials.map((item) => (
            <article
              key={item.id}
              className="flex flex-col rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6"
            >
              <blockquote className="flex-1 text-sm leading-relaxed text-zinc-700 sm:text-base">
                &ldquo;{item.quote}&rdquo;
              </blockquote>
              <div className="mt-5 flex items-center gap-3 border-t border-zinc-100 pt-5">
                {item.photo_url ? (
                  <Image
                    src={item.photo_url}
                    alt={item.name}
                    width={44}
                    height={44}
                    className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-violet-100"
                  />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-500">
                    <UserCircle2 className="h-7 w-7" />
                  </span>
                )}
                <div>
                  <p className="text-sm font-black text-zinc-950">{item.name}</p>
                  {item.role && (
                    <p className="text-xs font-medium text-zinc-500">{item.role}</p>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
