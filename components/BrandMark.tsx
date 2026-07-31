import { BRAND } from "@/config/branding";

type BrandMarkProps = {
  showName?: boolean;
  className?: string;
  textClassName?: string;
};

export default function BrandMark({
  className = "",
}: BrandMarkProps) {
  return (
    <span className={`inline-flex items-center ${className}`}>
      <img
        src={BRAND.assets.logo}
        alt={BRAND.name}
        className="h-12 w-auto sm:h-14 object-contain"
      />
    </span>
  );
}