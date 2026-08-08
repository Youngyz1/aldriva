import Image from "next/image";
import logo from "@/public/logo-horizontal.png";

type BrandMarkProps = {
  showName?: boolean;
  className?: string;
  textClassName?: string;
  /** Preload — set on the one instance that's actually above the fold on first paint (Navbar / its Suspense fallback), not the footer. */
  priority?: boolean;
};

export default function BrandMark({
  className = "",
  priority = false,
}: BrandMarkProps) {
  return (
    <span className={`inline-flex items-center ${className}`}>
      <Image
        src={logo}
        alt="Aldriva"
        className="h-12 w-auto object-contain sm:h-14"
        priority={priority}
      />
    </span>
  );
}
