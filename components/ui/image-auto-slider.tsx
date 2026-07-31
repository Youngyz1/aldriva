"use client";

/**
 * components/ui/image-auto-slider.tsx
 * Infinite horizontal auto-scrolling image strip.
 * Used on the homepage beneath the hero to showcase event photos.
 */

const EVENT_IMAGES = [
  "https://images.unsplash.com/photo-1518495973542-4542c06a5843?q=80&w=1974&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1472396961693-142e6e269027?q=80&w=2152&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1505142468610-359e7d316be0?q=80&w=2126&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1482881497185-d4a9ddbe4151?q=80&w=1965&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1524799526615-766a9833dec0?q=80&w=1935&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1200&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?q=80&w=1800&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?q=80&w=2070&auto=format&fit=crop",
];

// Duplicate for seamless loop
const LOOPED = [...EVENT_IMAGES, ...EVENT_IMAGES];

interface ImageAutoSliderProps {
  images?: string[];
  /** Speed in seconds for one full pass. Default 28. */
  duration?: number;
  /** Height class e.g. "h-48" or "h-64". Default "h-52". */
  heightClass?: string;
}

export function ImageAutoSlider({
  images = EVENT_IMAGES,
  duration = 28,
  heightClass = "h-52",
}: ImageAutoSliderProps) {
  const looped = [...images, ...images];

  return (
    <div className="relative w-full overflow-hidden">
      {/* Edge fade masks */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-white to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-white to-transparent"
        aria-hidden
      />

      <div
        className="flex gap-4 w-max"
        style={{
          animation: `image-slider-scroll ${duration}s linear infinite`,
        }}
      >
        {looped.map((src, i) => (
          <div
            key={i}
            className={`flex-shrink-0 ${heightClass} aspect-[4/3] rounded-2xl overflow-hidden shadow-md`}
          >
            <img
              src={src}
              alt={`Event photo ${(i % images.length) + 1}`}
              className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
              loading="lazy"
            />
          </div>
        ))}
      </div>

      <style>{`
        @keyframes image-slider-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
