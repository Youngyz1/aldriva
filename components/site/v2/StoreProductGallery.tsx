"use client";

import { useState } from "react";

/**
 * StoreProductGallery — product image gallery for site-local Store detail
 * pages. Renders every owner-supplied image (already validated with
 * safeImageSrc server-side): a main image plus thumbnail buttons when more
 * than one image exists. Single-image products render exactly as before.
 */
export function StoreProductGallery({
  images,
  name,
  unavailableLabel,
}: {
  images: string[];
  name: string;
  unavailableLabel: string;
}) {
  const [active, setActive] = useState(0);

  if (images.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-[var(--ps-border)] bg-[var(--ps-neutral)]">
        <div className="flex aspect-square items-center justify-center px-8 text-center text-sm text-[var(--ps-muted)]">
          {unavailableLabel}
        </div>
      </div>
    );
  }

  const current = images[Math.min(active, images.length - 1)];

  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-[var(--ps-border)] bg-[var(--ps-neutral)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={current}
          src={current}
          alt={name}
          className="aspect-square w-full object-cover"
        />
      </div>
      {images.length > 1 ? (
        <div
          className="mt-3 grid grid-cols-5 gap-2"
          role="group"
          aria-label={name}
        >
          {images.map((src, index) => {
            const selected = index === Math.min(active, images.length - 1);
            return (
              <button
                key={`${src}-${index}`}
                type="button"
                onClick={() => setActive(index)}
                aria-pressed={selected}
                aria-label={`${name} — ${index + 1}`}
                className={`overflow-hidden rounded-lg border bg-[var(--ps-neutral)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)] ${
                  selected
                    ? "border-[var(--ps-accent-hover)]"
                    : "border-[var(--ps-border)]"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
