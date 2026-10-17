type Point = {
  label: string;
  value: number;
  date: string;
};

const W = 640;
const H = 280;
const PAD_L = 46;
const PAD_R = 16;
const PAD_T = 20;

const formatAxis = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 100000) return `${Math.round(abs / 1000)}k`;
  if (abs >= 1000) {
    const k = abs / 1000;
    return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`;
  }
  return Math.round(abs).toLocaleString();
};

const BarChart = ({
  data,
  color,
  ariaLabel,
}: {
  data: Point[];
  color: string;
  ariaLabel: string;
}) => {
  const rotate = data.length > 6;
  const PAD_B = rotate ? 58 : 30;

  const INNER_W = W - PAD_L - PAD_R;
  const INNER_H = H - PAD_T - PAD_B;

  const maxVal = Math.max(1, ...data.map((d) => d.value));

  const slot = INNER_W / Math.max(1, data.length);
  const barW = Math.min(40, Math.max(6, slot * 0.6));
  const baseline = PAD_T + INNER_H;

  const y = (v: number) => PAD_T + INNER_H - (v / maxVal) * INNER_H;

  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const showValues = data.length <= 10;
  const labelY = baseline + 14;

  return (
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

      {data.map((d, i) => {
        const center = PAD_L + slot * i + slot / 2;
        const barH = Math.max(d.value > 0 ? 2 : 0, baseline - y(d.value));

        return (
          <g key={d.date}>
            <rect
              x={center - barW / 2}
              y={baseline - barH}
              width={barW}
              height={barH}
              rx="4"
              fill={color}
            >
              <title>{`${d.label}: ${formatAxis(d.value)}`}</title>
            </rect>

            {showValues && d.value > 0 && (
              <text
                x={center}
                y={baseline - barH - 4}
                textAnchor="middle"
                fontSize="9.5"
                fill="#6b7280"
              >
                {formatAxis(d.value)}
              </text>
            )}

            <text
              x={rotate ? center + 4 : center}
              y={rotate ? labelY : H - 9}
              textAnchor={rotate ? "end" : "middle"}
              fontSize="9.5"
              fill="#6b7280"
              transform={rotate ? `rotate(-45 ${center + 4} ${labelY})` : undefined}
            >
              {d.label}
            </text>
          </g>
        );
      })}

      <line
        x1={PAD_L}
        x2={W - PAD_R}
        y1={baseline}
        y2={baseline}
        stroke="#d1d5db"
      />
    </svg>
  );
};

export default BarChart;
