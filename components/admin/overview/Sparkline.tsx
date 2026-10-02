/**
 * Dependency-free SVG sparkline (server-renderable, no hydration cost).
 * Current window solid, previous window dashed when compare is on.
 */

export default function Sparkline({
  current,
  previous,
  compare,
  label,
}: {
  current: number[];
  previous: number[];
  compare: boolean;
  label: string;
}) {
  const W = 100;
  const H = 32;
  const peak = Math.max(1, ...current, ...(compare ? previous : []));

  const points = (values: number[]) =>
    values
      .map((v, i) => {
        const x = values.length === 1 ? W : (i / (values.length - 1)) * W;
        const y = H - 3 - (v / peak) * (H - 6);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-8 w-24"
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      {compare && previous.some((v) => v > 0) && (
        <polyline
          points={points(previous)}
          fill="none"
          stroke="#d4d4d8"
          strokeWidth="1.5"
          strokeDasharray="3 2"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <polyline
        points={points(current)}
        fill="none"
        stroke="#c2410c"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
