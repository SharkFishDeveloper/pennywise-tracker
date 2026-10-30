type Point = {
  label: string;
  actual: number;
  expected: number;
};

const W = 640;
const H = 260;
const PAD_L = 46;
const PAD_R = 14;
const PAD_T = 16;
const PAD_B = 30;

const INNER_W = W - PAD_L - PAD_R;
const INNER_H = H - PAD_T - PAD_B;

const formatAxis = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 100000) return `${Math.round(abs / 1000)}k`;
  if (abs >= 1000) {
    const k = abs / 1000;
    return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`;
  }
  return Math.round(abs).toLocaleString();
};

const ExpectedActualChart = ({
  data,
  symbol,
  actualColor,
  expectedColor,
  ariaLabel,
}: {
  data: Point[];
  symbol: string;
  actualColor: string;
  expectedColor: string;
  ariaLabel: string;
}) => {
  const maxVal = Math.max(
    1,
    ...data.map((d) => d.actual),
    ...data.map((d) => d.expected)
  );

  const x = (i: number) =>
    data.length === 1
      ? PAD_L + INNER_W / 2
      : PAD_L + (INNER_W * i) / (data.length - 1);

  const y = (v: number) => PAD_T + INNER_H - (v / maxVal) * INNER_H;

  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labelStep = Math.max(1, Math.ceil(data.length / 6));

  const actualPoints = data.map((d, i) => `${x(i)},${y(d.actual)}`).join(" ");
  const expectedPoints = data
    .map((d, i) => `${x(i)},${y(d.expected)}`)
    .join(" ");

  const actualArea =
    data.length > 1
      ? `${PAD_L},${y(0)} ${actualPoints} ${x(data.length - 1)},${y(0)}`
      : null;

  const average = data.length
    ? data.reduce((sum, d) => sum + d.expected, 0) / data.length
    : 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-gray-600">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-4 rounded-full"
            style={{ backgroundColor: actualColor }}
          />
          Actual
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-4 border-t-2 border-dashed"
            style={{ borderColor: expectedColor }}
          />
          Expected (avg)
        </span>
        <span className="ml-auto text-gray-500">
          Avg: {symbol}
          {Math.round(average).toLocaleString()}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={ariaLabel}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y(maxVal * t)}
              y2={y(maxVal * t)}
              stroke="#e5e7eb"
            />
            <text
              x={PAD_L - 8}
              y={y(maxVal * t) + 3.5}
              textAnchor="end"
              fontSize="10"
              fill="#9ca3af"
            >
              {formatAxis(maxVal * t)}
            </text>
          </g>
        ))}

        {actualArea && (
          <polygon points={actualArea} fill={actualColor} opacity="0.08" />
        )}

        <polyline
          points={expectedPoints}
          fill="none"
          stroke={expectedColor}
          strokeWidth="2"
          strokeDasharray="6 5"
          strokeLinecap="round"
        />

        <polyline
          points={actualPoints}
          fill="none"
          stroke={actualColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {data.map((d, i) => (
          <g key={`${d.label}-${i}`}>
            <circle cx={x(i)} cy={y(d.actual)} r="3.5" fill={actualColor}>
              <title>
                {`${d.label}: ${symbol}${Math.round(
                  d.actual
                ).toLocaleString()} actual, ${symbol}${Math.round(
                  d.expected
                ).toLocaleString()} expected`}
              </title>
            </circle>
            {(i % labelStep === 0 || i === data.length - 1) && (
              <text
                x={x(i)}
                y={H - 9}
                textAnchor="middle"
                fontSize="9.5"
                fill="#6b7280"
              >
                {d.label}
              </text>
            )}
          </g>
        ))}

        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={y(0)}
          y2={y(0)}
          stroke="#d1d5db"
        />
      </svg>
    </div>
  );
};

export default ExpectedActualChart;
