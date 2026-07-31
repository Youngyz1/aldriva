/**
 * components/ui/VerifiedBadge.tsx
 * Small blue checkmark badge shown next to organizer names.
 * Renders nothing when verified is false.
 */

type VerifiedBadgeProps = {
  verified: boolean;
  size?: 'sm' | 'md';
};

export default function VerifiedBadge({ verified, size = 'md' }: VerifiedBadgeProps) {
  if (!verified) return null;

  const dim = size === 'sm' ? 14 : 18;

  return (
    <span
      title="Verified organizer"
      className="inline-flex shrink-0 items-center justify-center"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={dim}
        height={dim}
        viewBox="0 0 24 24"
        fill="none"
        aria-label="Verified"
        role="img"
      >
        {/* Filled blue circle */}
        <circle cx="12" cy="12" r="12" fill="#2563EB" />
        {/* White checkmark */}
        <path
          d="M7 12.5l3.5 3.5 6.5-7"
          stroke="#ffffff"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
