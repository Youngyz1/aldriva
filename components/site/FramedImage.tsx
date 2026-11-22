import { safeImageSrc } from "@/lib/image-url";

export interface FramedImageProps {
  src: string;
  alt: string;
  className?: string;
}

/**
 * Picture-mat: the whole photo stays visible (object-contain, never cropped)
 * at its natural aspect ratio, centred on a solid soft-tint mat instead of a
 * blurred backdrop copy — no fixed aspect ratio, so no forced empty bars.
 * Shared across Showcase blocks that show a single dashboard-managed photo
 * (promo cards, hero) rather than a crop.
 */
export function FramedImage({ src, alt, className = "" }: FramedImageProps) {
  const safeSrc = safeImageSrc(src);
  if (!safeSrc) return null;
  return (
    <div className={`flex items-center justify-center rounded-[20px] border border-[var(--tf-border)] bg-[var(--tf-soft)] p-4 md:p-6 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={safeSrc}
        alt={alt}
        className="h-auto max-h-[420px] w-auto max-w-full rounded-[8px] object-contain md:max-h-[380px]"
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
