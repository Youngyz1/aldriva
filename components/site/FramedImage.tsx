import { safeImageSrc } from "@/lib/image-url";

export interface FramedImageProps {
  src: string;
  alt: string;
  /** Tailwind aspect-ratio class for the frame, e.g. "aspect-[16/9]" (default) or "aspect-square". */
  aspectClassName?: string;
  className?: string;
}

/**
 * Fixed-aspect image frame: the whole photo stays visible (object-contain)
 * over a blurred, scaled-up copy of the same photo as backdrop, so there are
 * never empty letterbox bars regardless of the source image's own aspect
 * ratio. Shared across Showcase blocks that show a single dashboard-managed
 * photo (promo cards, etc.) rather than a crop.
 */
export function FramedImage({ src, alt, aspectClassName = "aspect-[16/9]", className = "" }: FramedImageProps) {
  const safeSrc = safeImageSrc(src);
  if (!safeSrc) return null;
  return (
    <div className={`relative overflow-hidden rounded-[20px] bg-[var(--tf-soft)] ${aspectClassName} ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={safeSrc}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full scale-110 object-cover blur-[24px] brightness-[0.6]"
        loading="lazy"
        decoding="async"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={safeSrc}
        alt={alt}
        className="absolute inset-0 h-full w-full object-contain"
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
