type Point = {
  label: string;
  value: number;
  date: string;
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

const LineChart = ({
  data,
  color,
  selected,
  onSelect,
  average,
}: {
  data: Point[];
  color: string;
  selected: number | null;
  onSelect: (index: number | null) => void;
  average?: number;
}) => {
  const maxVal = Math.max(1, ...data.map((d) => d.value));

  const x = (i: number) =>
    data.length === 1
      ? PAD_L + INNER_W / 2
      : PAD_L + (INNER_W * i) / (data.length - 1);

  const y = (v: number) => PAD_T + INNER_H - (v / maxVal) * INNER_H;

  const averageY = average && average > 0 ? y(average) : null;

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const points = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");

  const areaPoints = data.length > 1
    ? `${PAD_L},${y(0)} ${points} ${x(data.length - 1)},${y(0)}`
    : null;

  const labelStep = Math.max(1, Math.ceil(data.length / 7));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="Daily totals over time"
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

      {areaPoints && (
        <polygon points={areaPoints} fill={color} opacity="0.09" />
      )}

      {averageY !== null && (
        <g>
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={averageY}
            y2={averageY}
            stroke="#6b7280"
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
          <text
            x={W - PAD_R}
            y={averageY - 5}
            textAnchor="end"
            fontSize="9.5"
            fill="#6b7280"
          >
            avg {formatAxis(average ?? 0)}
          </text>
        </g>
      )}

      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {data.map((d, i) => (
        <g key={d.date}>
          {selected === i && (
            <circle
              cx={x(i)}
              cy={y(d.value)}
              r="9"
              fill={color}
              opacity="0.2"
            />
          )}
          <circle
            cx={x(i)}
            cy={y(d.value)}
            r={selected === i ? 5 : 3.5}
            fill={color}
          />
          <circle
            cx={x(i)}
            cy={y(d.value)}
            r="14"
            fill="transparent"
            className="cursor-pointer"
            onClick={() => onSelect(selected === i ? null : i)}
          />
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
    </svg>
  );
};

export default LineChart;
