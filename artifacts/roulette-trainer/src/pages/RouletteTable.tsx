import { useState, useCallback } from "react";
import { BASE_WIDTH, BASE_HEIGHT } from "@/data/zones";
import ruletImage from "@assets/rulet_track2_1781011699361.png";

// ── Default grid parameters (editable at runtime) ─────────────────────────────
const DEFAULT_PARAMS = {
  headerY: 147,
  botY: 505,
  zeroX1: 28,
  // 13 column boundaries (12 column left-edges + 1 right-edge of last column)
  colX: [173, 272, 371, 470, 573, 672, 771, 870, 973, 1072, 1171, 1270, 1355],
};

type Params = typeof DEFAULT_PARAMS;

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildZones(p: Params) {
  const rowH = (p.botY - p.headerY) / 3;
  const rowY = (r: number) => p.headerY + (2 - r) * rowH;

  const zones: Array<{
    number: number;
    pts: string;
    cx: number;
    cy: number;
  }> = [];

  // 0 cell
  const z0x1 = p.zeroX1, z0x2 = p.colX[0];
  const z0y1 = p.headerY, z0y2 = p.botY;
  zones.push({
    number: 0,
    pts: `${z0x1},${z0y1} ${z0x2},${z0y1} ${z0x2},${z0y2} ${z0x1},${z0y2}`,
    cx: (z0x1 + z0x2) / 2,
    cy: (z0y1 + z0y2) / 2,
  });

  // Numbers 1–36
  for (let n = 1; n <= 36; n++) {
    const col = Math.floor((n - 1) / 3);
    const row = (n - 1) % 3; // 0=bot 1=mid 2=top
    const x1 = p.colX[col];
    const x2 = p.colX[col + 1];
    const y1 = rowY(row);
    const y2 = rowY(row) + rowH;
    zones.push({
      number: n,
      pts: `${x1},${y1} ${x2},${y1} ${x2},${y2} ${x1},${y2}`,
      cx: (x1 + x2) / 2,
      cy: (y1 + y2) / 2,
    });
  }

  return zones;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function RouletteTable() {
  const [showGrid, setShowGrid] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [copied, setCopied] = useState(false);

  const zones = buildZones(params);

  const setHeaderY = useCallback((v: number) =>
    setParams(p => ({ ...p, headerY: v })), []);
  const setBotY = useCallback((v: number) =>
    setParams(p => ({ ...p, botY: v })), []);
  const setZeroX1 = useCallback((v: number) =>
    setParams(p => ({ ...p, zeroX1: v })), []);
  const setColX = useCallback((i: number, v: number) =>
    setParams(p => {
      const colX = [...p.colX];
      colX[i] = v;
      return { ...p, colX };
    }), []);

  const exportCode = () => {
    const text =
`// Paste this into zones.ts to save your calibration:
const headerY = ${params.headerY};
const botY    = ${params.botY};
const ZERO_X1 = ${params.zeroX1};
const COL_X: readonly number[] = [
${params.colX.map((v, i) => {
  const labels = ['3/2/1','6/5/4','9/8/7','12/11/10','15/14/13','18/17/16',
    '21/20/19','24/23/22','27/26/25','30/29/28','33/32/31','36/35/34','colEnd'];
  return `  ${String(v).padStart(4)},  // ${labels[i]}`;
}).join('\n')}
];`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="roulette-page">
      {/* Top controls */}
      <div className="controls-bar">
        <button
          className={`grid-toggle-btn ${showGrid ? "active" : ""}`}
          onClick={() => setShowGrid(v => !v)}
        >
          {showGrid ? "Скрыть сетку" : "Показать сетку"}
        </button>
        <button
          className={`grid-toggle-btn ${editMode ? "active" : ""}`}
          onClick={() => { setEditMode(v => !v); setShowGrid(true); }}
        >
          {editMode ? "Закрыть редактор" : "Настроить сетку"}
        </button>
      </div>

      {/* Image + SVG overlay */}
      <div className="roulette-wrapper">
        <img
          src={ruletImage}
          alt="Roulette table"
          className="roulette-image"
          draggable={false}
        />
        <svg
          className="roulette-overlay"
          viewBox={`0 0 ${BASE_WIDTH} ${BASE_HEIGHT}`}
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {showGrid && zones.map(z => (
            <g key={z.number}>
              <polygon
                points={z.pts}
                fill="rgba(255,220,0,0.18)"
                stroke="#FFD700"
                strokeWidth="1.5"
              />
              <text
                x={z.cx}
                y={z.cy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="13"
                fontWeight="bold"
                fill="#FFD700"
                stroke="rgba(0,0,0,0.6)"
                strokeWidth="0.4"
                paintOrder="stroke"
              >
                {z.number}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* Editor panel */}
      {editMode && (
        <div className="editor-panel">
          <div className="editor-header">
            <span>Редактор координат сетки</span>
            <button className="copy-btn" onClick={exportCode}>
              {copied ? "✓ Скопировано!" : "Скопировать код"}
            </button>
          </div>

          <div className="editor-grid">
            {/* Vertical bounds */}
            <div className="editor-section">
              <div className="editor-section-title">Вертикальные границы</div>
              <SliderRow
                label="Верхняя граница (headerY)"
                value={params.headerY}
                min={50} max={300}
                onChange={setHeaderY}
              />
              <SliderRow
                label="Нижняя граница (botY)"
                value={params.botY}
                min={300} max={600}
                onChange={setBotY}
              />
              <SliderRow
                label="Левый край нуля (zeroX1)"
                value={params.zeroX1}
                min={0} max={100}
                onChange={setZeroX1}
              />
            </div>

            {/* Column boundaries */}
            <div className="editor-section">
              <div className="editor-section-title">Границы столбцов (COL_X)</div>
              {params.colX.map((v, i) => {
                const labels = [
                  'Левый край (3/2/1)',
                  '| 3/2/1 → 6/5/4',
                  '| 6/5/4 → 9/8/7',
                  '| 9/8/7 → 12/11/10',
                  '| 12→15 (граница 1/2)',
                  '| 15/14/13 → 18/17/16',
                  '| 18 → 21',
                  '| 21 → 24',
                  '| 24→27 (граница 2/3)',
                  '| 27 → 30',
                  '| 30 → 33',
                  '| 33 → 36',
                  'Правый край (36/35/34)',
                ];
                return (
                  <SliderRow
                    key={i}
                    label={labels[i]}
                    value={v}
                    min={0} max={1480}
                    onChange={val => setColX(i, val)}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Slider + number input row ─────────────────────────────────────────────────
function SliderRow({
  label, value, min, max, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="slider-row">
      <span className="slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="slider-input"
      />
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="number-input"
      />
    </div>
  );
}
