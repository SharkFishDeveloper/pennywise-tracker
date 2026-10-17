import type { LucideIcon } from "lucide-react";

export type Slice = {
  name: string;
  value: number;
  color: string;
};

export const PIE_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#6366f1",
  "#84cc16",
  "#0ea5e9",
  "#e11d48",
];

const SIZE = 260;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 118;
const INNER_R = 70;

const polar = (angle: number, radius: number) => [
  CX + radius * Math.cos(angle),
  CY + radius * Math.sin(angle),
];

const arcPath = (a0: number, a1: number) => {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(a0, R);
  const [x1, y1] = polar(a1, R);
  const [ix1, iy1] = polar(a1, INNER_R);
  const [ix0, iy0] = polar(a0, INNER_R);

  return [
    `M ${x0} ${y0}`,
    `A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`,
    `L ${ix1} ${iy1}`,
    `A ${INNER_R} ${INNER_R} 0 ${large} 0 ${ix0} ${iy0}`,
    "Z",
  ].join(" ");
};

const PieChart = ({
  data,
  total,
  symbol,
  centerLabel,
  selected,
  onSelect,
  icons,
}: {
  data: Slice[];
  total: number;
  symbol: string;
  centerLabel: string;
  selected: string | null;
  onSelect: (name: string | null) => void;
  icons?: Record<string, LucideIcon>;
}) => {
  let angle = -Math.PI / 2;

  const arcs = data.map((slice) => {
    const frac = total > 0 ? slice.value / total : 0;
    const a0 = angle;
    const a1 = angle + frac * Math.PI * 2;
    angle = a1;
    return { ...slice, a0, a1, frac };
  });

  const singleFullSlice = arcs.length === 1 && arcs[0].frac >= 0.999;

  const pctOf = (value: number) => {
    const pct = (value / total) * 100;
    return pct >= 1 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
  };

  const selectedSlice = arcs.find((arc) => arc.name === selected) ?? null;
  const SelectedIcon = selectedSlice ? icons?.[selectedSlice.name] : undefined;

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-56 shrink-0 sm:w-64"
        role="img"
        aria-label="Breakdown by category"
      >
        {singleFullSlice ? (
          <circle
            cx={CX}
            cy={CY}
            r={(R + INNER_R) / 2}
            fill="none"
            stroke={arcs[0].color}
            strokeWidth={R - INNER_R}
            className="cursor-pointer"
            onClick={() => onSelect(selected === arcs[0].name ? null : arcs[0].name)}
          />
        ) : (
          arcs.map((arc) => {
            const isDimmed = selected !== null && selected !== arc.name;

            return (
              <path
                key={arc.name}
                d={arcPath(
                  arc.a0,
                  arc.a1 - (arc.a1 - arc.a0 < 0.0006 ? 0.0006 : 0)
                )}
                fill={arc.color}
                opacity={isDimmed ? 0.35 : 1}
                className="cursor-pointer transition-opacity"
                onClick={() =>
                  onSelect(selected === arc.name ? null : arc.name)
                }
              />
            );
          })
        )}

        {total > 0 && (
          <>
            <text
              x={CX}
              y={CY - 2}
              textAnchor="middle"
              fontSize="20"
              fontWeight="700"
              fill="#111827"
            >
              {symbol}
              {Math.round(total).toLocaleString()}
            </text>
            <text
              x={CX}
              y={CY + 18}
              textAnchor="middle"
              fontSize="11"
              fill="#6b7280"
            >
              {centerLabel}
            </text>
          </>
        )}
      </svg>

      <div className="w-full sm:w-auto sm:min-w-0 sm:flex-1">
        {selectedSlice && (
          <div
            className="mb-4 rounded-xl border p-3"
            style={{
              borderColor: selectedSlice.color,
              backgroundColor: `${selectedSlice.color}14`,
            }}
          >
            <div className="flex items-center gap-2.5">
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full"
                style={{ backgroundColor: selectedSlice.color }}
              />
              {SelectedIcon && (
                <SelectedIcon size={16} className="shrink-0 text-gray-600" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
                {selectedSlice.name}
              </span>
              <button
                type="button"
                onClick={() => onSelect(null)}
                className="shrink-0 text-xs font-medium text-gray-500 hover:text-gray-800"
              >
                Clear
              </button>
            </div>

            <p className="mt-2 text-xl font-bold text-gray-900">
              {symbol}
              {selectedSlice.value.toLocaleString()}
            </p>
            <p className="text-xs text-gray-600">
              {pctOf(selectedSlice.value)} of total
            </p>
          </div>
        )}

        <ul className="space-y-2.5">
          {arcs.map((arc) => {
            const isActive = selected === arc.name;
            const isDimmed = selected !== null && !isActive;
            const Icon = icons?.[arc.name];

            return (
              <li key={arc.name}>
                <button
                  type="button"
                  onClick={() => onSelect(isActive ? null : arc.name)}
                  className={`flex w-full items-center gap-2.5 rounded-lg p-1 text-left text-sm transition ${
                    isDimmed ? "opacity-50" : "opacity-100"
                  } ${isActive ? "font-semibold text-gray-900" : "text-gray-700"}`}
                >
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-full"
                    style={{ backgroundColor: arc.color }}
                  />
                  {Icon && <Icon size={16} className="shrink-0 text-gray-500" />}
                  <span className="min-w-0 flex-1 truncate">{arc.name}</span>
                  <span className="shrink-0 text-xs text-gray-500">
                    {pctOf(arc.value)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export default PieChart;
