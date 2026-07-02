import { useState, useCallback, useEffect, useMemo } from "react";
import { BASE_WIDTH, BASE_HEIGHT } from "@/data/zones";
import { DEFAULT_TRACK_PARAMS, buildTrackZones, buildSectorBands, sectorFor, type TrackParams } from "@/data/trackZones";
import ruletImage from "@assets/rul_final_1782983519184.png";
import { GameSettings } from "@/types/gameSettings";
import { BET_POSITIONS_MAP } from "@/data/betPositions";
import { spinGame, calculatePayout, getNumberColor, type GameState, type TrackBet } from "@/lib/rouletteGame";

// ── Series quiz ────────────────────────────────────────────────────────────────
const SERIES_DIVISORS: Record<TrackBet["type"], number> = {
  SERIE_5_8: 6,
  ORPHELINS: 5,
  SERIE_0_2_3: 9,
  ZERO_SPIEL: 4,
};
const SERIES_QUIZ_ORDER: TrackBet["type"][] = [
  "SERIE_5_8", "ORPHELINS", "SERIE_0_2_3", "ZERO_SPIEL",
];

function calcSeriesResult(amount: number, divisor: number, multiplicity: number) {
  const rawPerUnit = amount / divisor;
  const playPerUnit = Math.floor(rawPerUnit / multiplicity) * multiplicity;
  const acceptedAmount = playPerUnit * divisor;
  const change = amount - acceptedAmount;
  return { playPerUnit, change, acceptedAmount, rawPerUnit };
}

type QuizPhase = { kind: "series"; idx: number } | { kind: "field" } | { kind: "report" };

interface SeriesQuizRecord {
  type: TrackBet["type"];
  label: string;
  amount: number;
  divisor: number;
  multiplicity: number;
  rawPerUnit: number;
  correctPlayPerUnit: number;
  correctChange: number;
  userPlayPerUnit: number;
  userChange: number;
  correct: boolean;
}

interface FieldQuizRecord {
  userAnswer: number;
  correctAnswer: number;
  correct: boolean;
}

// ── Main grid default params ──────────────────────────────────────────────────
const DEFAULT_GRID = {
  headerY: 205,
  botY: 616,
  zeroX1: 34,
  colX: [146, 241, 334, 429, 524, 617, 712, 806, 900, 995, 1089, 1183, 1277],
};
type GridParams = typeof DEFAULT_GRID;

// ── Build main grid zones ─────────────────────────────────────────────────────
function buildGridZones(p: GridParams) {
  const rowH = (p.botY - p.headerY) / 3;
  const rowY = (r: number) => p.headerY + (2 - r) * rowH;
  const zones: { number: number; pts: string; cx: number; cy: number }[] = [];

  // 0
  const z0x1 = p.zeroX1, z0x2 = p.colX[0];
  zones.push({
    number: 0, pts: `${z0x1},${p.headerY} ${z0x2},${p.headerY} ${z0x2},${p.botY} ${z0x1},${p.botY}`,
    cx: (z0x1 + z0x2) / 2, cy: (p.headerY + p.botY) / 2,
  });

  // 1–36
  for (let n = 1; n <= 36; n++) {
    const col = Math.floor((n - 1) / 3);
    const row = (n - 1) % 3;
    const x1 = p.colX[col], x2 = p.colX[col + 1];
    const y1 = rowY(row), y2 = y1 + rowH;
    zones.push({
      number: n, pts: `${x1},${y1} ${x2},${y1} ${x2},${y2} ${x1},${y2}`,
      cx: (x1 + x2) / 2, cy: (y1 + y2) / 2,
    });
  }
  return zones;
}

// ── Compute chip positions dynamically from current gridParams ────────────────
// This guarantees chips sit exactly on grid boundaries (splits on column/row
// edges, corners at intersections, streets & sixlines at headerY).
function buildDynamicPositions(p: GridParams): Map<string, { x: number; y: number }> {
  const rowH    = (p.botY - p.headerY) / 3;
  const colCx   = (c: number) => (p.colX[c] + p.colX[c + 1]) / 2;
  const rowCy   = (r: number) => p.headerY + (2 - r) * rowH + rowH / 2;
  const rowTopY = (r: number) => p.headerY + (2 - r) * rowH;
  const getCol  = (n: number) => Math.floor((n - 1) / 3);
  const getRow  = (n: number) => (n - 1) % 3;

  const map = new Map<string, { x: number; y: number }>();

  // ── Zero straight up: centre of the zero cell ─────────────────────────────
  map.set('su-0', { x: (p.zeroX1 + p.colX[0]) / 2, y: (p.headerY + p.botY) / 2 });

  // ── Split 0-n: exactly on the right boundary of zero, at each row centre ───
  ([1, 2, 3] as const).forEach(n => {
    map.set(`sp-0-${n}`, { x: p.colX[0], y: rowCy(getRow(n)) });
  });

  // ── Street 0-1-2 / 0-2-3: right boundary of zero × row boundary ───────────
  map.set('st-0-12', { x: p.colX[0], y: rowTopY(0) });  // between row-0 and row-1
  map.set('st-0-23', { x: p.colX[0], y: rowTopY(1) });  // between row-1 and row-2

  // ── Corner 0-1-2-3: top-right corner of zero cell (zero × header × col-0) ─
  map.set('co-0', { x: p.colX[0], y: p.headerY });

  // ── Straight 1–36: cell centre ─────────────────────────────────────────────
  for (let n = 1; n <= 36; n++) {
    map.set(`su-${n}`, { x: colCx(getCol(n)), y: rowCy(getRow(n)) });
  }

  // ── Split horizontal (n / n+3): exactly on the vertical column boundary ────
  for (let n = 1; n <= 33; n++) {
    const c = getCol(n);
    map.set(`sp-h-${n}`, { x: p.colX[c + 1], y: rowCy(getRow(n)) });
  }

  // ── Split vertical (n / n+1): exactly on the horizontal row boundary ───────
  for (let n = 1; n <= 35; n++) {
    if (n % 3 === 0) continue;
    map.set(`sp-v-${n}`, { x: colCx(getCol(n)), y: rowTopY(getRow(n)) });
  }

  // ── Street: column centre, at headerY (top outer edge) ─────────────────────
  for (let c = 0; c <= 11; c++) {
    map.set(`st-${c}`, { x: colCx(c), y: p.headerY });
  }

  // ── Corner: intersection of column boundary × row boundary ─────────────────
  for (let n = 1; n <= 32; n++) {
    if (n % 3 === 0) continue;
    map.set(`co-${n}`, { x: p.colX[getCol(n) + 1], y: rowTopY(getRow(n)) });
  }

  // ── Six-line: column boundary × headerY ────────────────────────────────────
  for (let c = 0; c <= 10; c++) {
    map.set(`sl-${c}`, { x: p.colX[c + 1], y: p.headerY });
  }

  return map;
}

// ── localStorage persistence ──────────────────────────────────────────────────
const STORAGE_KEY_GRID  = "roulette_grid_params_v2";
const STORAGE_KEY_TRACK = "roulette_track_params_v2";

function loadGrid(): GridParams {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GRID);
    if (raw) return { ...DEFAULT_GRID, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_GRID;
}

function loadTrack(): TrackParams {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TRACK);
    if (raw) return { ...DEFAULT_TRACK_PARAMS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_TRACK_PARAMS;
}

// ── Component ─────────────────────────────────────────────────────────────────
interface RouletteTableProps {
  settings: GameSettings;
  onOpenSettings: () => void;
}

export default function RouletteTable({ settings, onOpenSettings }: RouletteTableProps) {
  const [showGrid,  setShowGrid]  = useState(false);
  const [showTrack, setShowTrack] = useState(false);
  const [editMode,  setEditMode]  = useState(false);
  const [editTab,   setEditTab]   = useState<"grid" | "track">("grid");
  const [copied,    setCopied]    = useState(false);
  const [game,      setGame]      = useState<GameState | null>(null);

  // ── Quiz state ──────────────────────────────────────────────────────────────
  const [quizPhase,         setQuizPhase]         = useState<QuizPhase | null>(null);
  const [activeSeries,      setActiveSeries]      = useState<TrackBet[]>([]);
  const [seriesRecords,     setSeriesRecords]     = useState<SeriesQuizRecord[]>([]);
  const [fieldRecord,       setFieldRecord]       = useState<FieldQuizRecord | null>(null);
  const [seriesPlayInput,   setSeriesPlayInput]   = useState("");
  const [seriesChangeInput, setSeriesChangeInput] = useState("");
  const [fieldInput,        setFieldInput]        = useState("");

  const [gridParams,  setGridParams]  = useState<GridParams>(loadGrid);
  const [trackParams, setTrackParams] = useState<TrackParams>(loadTrack);

  // Auto-save to localStorage whenever params change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_GRID, JSON.stringify(gridParams));
  }, [gridParams]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_TRACK, JSON.stringify(trackParams));
  }, [trackParams]);

  const gridZones   = buildGridZones(gridParams);
  const trackZones  = buildTrackZones(trackParams);
  const sectorBands = buildSectorBands(trackParams);
  const chipPosMap  = useMemo(() => buildDynamicPositions(gridParams), [gridParams]);

  // ── Grid param setters ──────────────────────────────────────────────────────
  const setHeaderY = useCallback((v: number) => setGridParams(p => ({ ...p, headerY: v })), []);
  const setBotY    = useCallback((v: number) => setGridParams(p => ({ ...p, botY: v })), []);
  const setZeroX1  = useCallback((v: number) => setGridParams(p => ({ ...p, zeroX1: v })), []);
  const setColX    = useCallback((i: number, v: number) =>
    setGridParams(p => { const colX = [...p.colX]; colX[i] = v; return { ...p, colX }; }), []);

  // ── Track param setters ─────────────────────────────────────────────────────
  const setTP = useCallback(<K extends keyof TrackParams>(k: K, v: TrackParams[K]) =>
    setTrackParams(p => ({ ...p, [k]: v })), []);

  const setTopX = useCallback((i: number, v: number) =>
    setTrackParams(p => { const topX = [...p.topX]; topX[i] = v; return { ...p, topX }; }), []);
  const setBotX = useCallback((i: number, v: number) =>
    setTrackParams(p => { const botX = [...p.botX]; botX[i] = v; return { ...p, botX }; }), []);
  const setArcLY = useCallback((i: number, v: number) =>
    setTrackParams(p => { const arcLY = [...p.arcLY] as TrackParams["arcLY"]; arcLY[i] = v; return { ...p, arcLY }; }), []);
  const setArcRY = useCallback((i: number, v: number) =>
    setTrackParams(p => { const arcRY = [...p.arcRY] as TrackParams["arcRY"]; arcRY[i] = v; return { ...p, arcRY }; }), []);

  // ── Random track bet amount: minAmount–5000, multiples of 50 ────────────────
  function randomTrackAmount(minAmount: number): number {
    const minRounded = Math.ceil(minAmount / 50) * 50;
    const safeMin = Math.max(50, minRounded);
    const count = Math.floor((5000 - safeMin) / 50) + 1;
    if (count <= 0) return safeMin;
    return safeMin + Math.floor(Math.random() * count) * 50;
  }

  // ── Spin ────────────────────────────────────────────────────────────────────
  const handleSpin = useCallback(() => {
    const chipCount = settings.chipsInField ?? 100;
    const chipValue = settings.chipValue ?? 10;
    const base = spinGame(chipCount, chipValue);

    // Compute sector band centres from current trackParams
    const bands = buildSectorBands(trackParams);
    // bands order: [serie58, orphelins, serie023, zerospiel]
    const seriesCfg: Array<{
      enabled: boolean;
      type: TrackBet["type"];
      label: string;
      band: (typeof bands)[0];
    }> = [
      { enabled: settings.bet58       === "yes", type: "SERIE_5_8",   label: "Serie 5/8",   band: bands[0] },
      { enabled: settings.betOrphelins === "yes", type: "ORPHELINS",  label: "Orphelins",   band: bands[1] },
      { enabled: settings.betSeria023  === "yes", type: "SERIE_0_2_3",label: "Serie 0/2/3", band: bands[2] },
      { enabled: settings.betZeroSpiel === "yes", type: "ZERO_SPIEL", label: "Zero Spiel",  band: bands[3] },
    ];

    const mult = Math.max(10, Math.min(1000, settings.multiplicity ?? 10));

    const trackBets: TrackBet[] = seriesCfg
      .filter(s => s.enabled)
      .map(s => ({
        type:     s.type,
        label:    s.label,
        amount:   randomTrackAmount(mult * SERIES_DIVISORS[s.type]),
        position: { x: s.band.cx, y: s.band.cy },
        source:   "TRACK" as const,
      }));

    setGame({ ...base, trackBets });

    // Build quiz queue from active series in fixed order
    const ordered = SERIES_QUIZ_ORDER
      .map(t => trackBets.find(tb => tb.type === t))
      .filter((tb): tb is TrackBet => tb !== undefined);
    setActiveSeries(ordered);
    setSeriesRecords([]);
    setFieldRecord(null);
    setSeriesPlayInput("");
    setSeriesChangeInput("");
    setFieldInput("");
    setQuizPhase(ordered.length > 0 ? { kind: "series", idx: 0 } : { kind: "field" });

    setEditMode(false);
  }, [
    settings.chipsInField,
    settings.chipValue,
    settings.multiplicity,
    settings.bet58,
    settings.betOrphelins,
    settings.betSeria023,
    settings.betZeroSpiel,
    trackParams,
  ]);

  const handleCheckSeries = useCallback(() => {
    if (!game || !quizPhase || quizPhase.kind !== "series") return;
    const tb = activeSeries[quizPhase.idx];
    if (!tb) return;
    const mult = Math.max(10, Math.min(1000, settings.multiplicity ?? 10));
    const divisor = SERIES_DIVISORS[tb.type];
    const { playPerUnit, change, rawPerUnit } = calcSeriesResult(tb.amount, divisor, mult);
    const userPlay = parseInt(seriesPlayInput  || "0", 10) || 0;
    const userChg  = parseInt(seriesChangeInput || "0", 10) || 0;
    const record: SeriesQuizRecord = {
      type: tb.type, label: tb.label, amount: tb.amount,
      divisor, multiplicity: mult, rawPerUnit,
      correctPlayPerUnit: playPerUnit, correctChange: change,
      userPlayPerUnit: userPlay, userChange: userChg,
      correct: userPlay === playPerUnit && userChg === change,
    };
    setSeriesRecords(prev => [...prev, record]);
    setSeriesPlayInput("");
    setSeriesChangeInput("");
    const nextIdx = quizPhase.idx + 1;
    setQuizPhase(nextIdx < activeSeries.length ? { kind: "series", idx: nextIdx } : { kind: "field" });
  }, [game, quizPhase, activeSeries, seriesPlayInput, seriesChangeInput, settings.multiplicity]);

  const handleCheckField = useCallback(() => {
    if (!game || !quizPhase || quizPhase.kind !== "field") return;
    const userAnswer = parseInt(fieldInput || "0", 10) || 0;
    setFieldRecord({ userAnswer, correctAnswer: game.correctAnswer, correct: userAnswer === game.correctAnswer });
    setQuizPhase({ kind: "report" });
  }, [game, quizPhase, fieldInput]);

  // ── Export ──────────────────────────────────────────────────────────────────
  const exportCode = () => {
    const g = gridParams, t = trackParams;
    const text = [
      `// ── Main grid ──`,
      `const headerY = ${g.headerY};`,
      `const botY    = ${g.botY};`,
      `const ZERO_X1 = ${g.zeroX1};`,
      `const COL_X: readonly number[] = [`,
      g.colX.map(v => `  ${v}`).join(",\n"),
      `];`,
      ``,
      `// ── Track ──`,
      `topY1: ${t.topY1},  topY2: ${t.topY2},`,
      `botY1: ${t.botY1},  botY2: ${t.botY2},`,
      `arcLX1: ${t.arcLX1}, arcLX2: ${t.arcLX2},`,
      `arcRX1: ${t.arcRX1}, arcRX2: ${t.arcRX2},`,
      `arcLY: [${t.arcLY.join(", ")}],`,
      `arcRY: [${t.arcRY.join(", ")}],`,
      `topX: [${t.topX.join(", ")}],`,
      `botX: [${t.botX.join(", ")}],`,
    ].join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="roulette-page">
      {/* Controls */}
      <div className="controls-bar">
        <button className="grid-toggle-btn settings-open-btn"
          onClick={onOpenSettings}>
          ⚙ Настройки
        </button>
        <button className="grid-toggle-btn spin-btn" onClick={handleSpin}>
          ▶ Spin
        </button>
        <button className={`grid-toggle-btn ${showGrid ? "active" : ""}`}
          onClick={() => setShowGrid(v => !v)}>
          {showGrid ? "Скрыть сетку" : "Показать сетку"}
        </button>
        <button className={`grid-toggle-btn ${showTrack ? "active" : ""}`}
          onClick={() => setShowTrack(v => !v)}>
          {showTrack ? "Скрыть трек" : "Показать трек"}
        </button>
        <button className={`grid-toggle-btn ${editMode ? "active" : ""}`}
          onClick={() => { setEditMode(v => !v); if (!editMode) { setShowTrack(true); } }}>
          {editMode ? "Закрыть редактор" : "Настроить трек"}
        </button>
      </div>

      {/* Table + info sidebar */}
      <div className="table-row">
      {/* Table image + SVG overlay */}
      <div className="roulette-wrapper">
        <img src={ruletImage} alt="Roulette table" className="roulette-image" draggable={false} />
        <svg className="roulette-overlay"
          viewBox={`0 0 ${BASE_WIDTH} ${BASE_HEIGHT}`}
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg">

          {/* Main grid */}
          {showGrid && gridZones.map(z => (
            <g key={`g-${z.number}`}>
              <polygon points={z.pts} fill="rgba(255,220,0,0.18)" stroke="#FFD700" strokeWidth="1.5" />
              <text x={z.cx} y={z.cy} textAnchor="middle" dominantBaseline="central"
                fontSize="13" fontWeight="bold" fill="#FFD700"
                stroke="rgba(0,0,0,0.6)" strokeWidth="0.4" paintOrder="stroke">
                {z.number}
              </text>
            </g>
          ))}

          {/* Track — sector bands (middle label area) */}
          {showTrack && sectorBands.map(b => (
            <g key={`sb-${b.sector.id}`}>
              <rect x={b.x1} y={b.y1} width={b.x2 - b.x1} height={b.y2 - b.y1}
                fill={b.sector.fill} stroke={b.sector.color} strokeWidth="1.5" />
              <text x={b.cx} y={b.cy} textAnchor="middle" dominantBaseline="central"
                fontSize="22" fontWeight="bold" fill={b.sector.color}
                stroke="rgba(0,0,0,0.7)" strokeWidth="0.6" paintOrder="stroke">
                {b.sector.label}
              </text>
            </g>
          ))}

          {/* Track — individual number cells colored by sector */}
          {showTrack && trackZones.map(z => {
            const sec = sectorFor(z.number);
            const color = sec?.color ?? "#00CFFF";
            const fill  = sec?.fill  ?? "rgba(100,200,255,0.18)";
            return (
              <g key={`t-${z.number}-${z.section}`}>
                <polygon points={z.pts} fill={fill} stroke={color} strokeWidth="1.5" />
                <text x={z.cx} y={z.cy} textAnchor="middle" dominantBaseline="central"
                  fontSize="11" fontWeight="bold" fill={color}
                  stroke="rgba(0,0,0,0.6)" strokeWidth="0.4" paintOrder="stroke">
                  {z.number}
                </text>
              </g>
            );
          })}
          {/* Winning number highlight */}
          {game && (() => {
            const wz = gridZones.find(z => z.number === game.drawnNumber);
            if (!wz) return null;
            return (
              <g style={{ pointerEvents: "none" }}>
                <polygon points={wz.pts}
                  fill="rgba(255,255,60,0.55)"
                  stroke="#FFE500"
                  strokeWidth="4"
                  strokeLinejoin="round" />
              </g>
            );
          })()}

          {/* Chips */}
          {game && game.chips.map(stack => {
            const pos = chipPosMap.get(stack.positionId);
            if (!pos) return null;
            const count = stack.count;
            return (
              <g key={stack.positionId} style={{ pointerEvents: "none" }}>
                <circle cx={pos.x} cy={pos.y} r={19.1}
                  fill="#1a6fd4" stroke="#fff" strokeWidth="2.5"
                  opacity="0.92" />
                <text x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="central"
                  fontSize={count >= 10 ? "12.75" : "14.9"} fontWeight="bold" fill="#fff">
                  {count}
                </text>
              </g>
            );
          })}

          {/* Track series chips — ~3× larger than normal chips (r=57) */}
          {game && game.trackBets.map(tb => {
            const sec = sectorBands.find(b =>
              (b.sector.id === "serie58"   && tb.type === "SERIE_5_8")  ||
              (b.sector.id === "orphelins" && tb.type === "ORPHELINS")  ||
              (b.sector.id === "serie023"  && tb.type === "SERIE_0_2_3")||
              (b.sector.id === "zerospiel" && tb.type === "ZERO_SPIEL")
            );
            const color = sec?.sector.color ?? "#fff";
            const { x, y } = tb.position;
            const amt = String(tb.amount);
            const fs = amt.length >= 4 ? "22" : "26";
            return (
              <g key={tb.type} style={{ pointerEvents: "none" }}>
                {/* Outer glow ring */}
                <circle cx={x} cy={y} r={62} fill="none" stroke={color} strokeWidth="2" opacity="0.35" />
                {/* Main body */}
                <circle cx={x} cy={y} r={57} fill="rgba(8,18,10,0.93)" stroke={color} strokeWidth="4.5" />
                {/* Inner decorative ring */}
                <circle cx={x} cy={y} r={49} fill="none" stroke={color} strokeWidth="1.5" opacity="0.55" />
                {/* Amount text */}
                <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
                  fontSize={fs} fontWeight="800" fill={color}
                  stroke="rgba(0,0,0,0.7)" strokeWidth="0.8" paintOrder="stroke"
                  letterSpacing="0.5">
                  {amt}
                </text>
              </g>
            );
          })}

        </svg>
      </div>

      {/* Info sidebar */}
      <div className="table-info-sidebar">
        <div className="info-sidebar-title">Лимиты и фишки</div>
        <div className="info-sidebar-row">
          <span className="info-sidebar-label">Минимум</span>
          <span className="info-sidebar-value">{settings.minBet}</span>
        </div>
        <div className="info-sidebar-row">
          <span className="info-sidebar-label">Максимум</span>
          <span className="info-sidebar-value">{settings.maxBet}</span>
        </div>
        <div className="info-sidebar-divider" />
        <div className="info-sidebar-row">
          <span className="info-sidebar-label">Номинал цвета</span>
          <span className="info-sidebar-value info-sidebar-chip">{settings.chipValue}</span>
        </div>
        <div className="info-sidebar-divider" />
        <div className="info-sidebar-row">
          <span className="info-sidebar-label">Кратность</span>
          <span className="info-sidebar-value">{settings.multiplicity}</span>
        </div>
      </div>
      </div>{/* /table-row */}

      {/* Quiz panel */}
      {game && quizPhase && (
        <div className="game-panel">
          <div className="game-result-row">
            {/* Drawn number */}
            <div className={`number-badge number-badge--${getNumberColor(game.drawnNumber)}`}>
              {game.drawnNumber}
            </div>

            {/* Series question */}
            {quizPhase.kind === "series" && (() => {
              const tb = activeSeries[quizPhase.idx];
              if (!tb) return null;
              return (
                <div className="game-answer-area">
                  <div className="quiz-series-header">
                    <span className="quiz-series-title">{tb.label}</span>
                    <span className="quiz-series-sub">Рассчитайте ставку серии</span>
                  </div>
                  <input
                    type="number"
                    className="game-answer-input"
                    placeholder="По сколько играет"
                    value={seriesPlayInput}
                    onChange={e => setSeriesPlayInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleCheckSeries()}
                    autoFocus
                  />
                  <input
                    type="number"
                    className="game-answer-input"
                    placeholder="Сдача"
                    value={seriesChangeInput}
                    onChange={e => setSeriesChangeInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleCheckSeries()}
                  />
                  <button className="game-check-btn" onClick={handleCheckSeries}>Проверить</button>
                </div>
              );
            })()}

            {/* Field question */}
            {quizPhase.kind === "field" && (
              <div className="game-answer-area">
                <div className="quiz-series-header">
                  <span className="quiz-series-title">Выплата по полю</span>
                  <span className="quiz-series-sub">Сумма выплаты</span>
                </div>
                <input
                  type="number"
                  className="game-answer-input"
                  placeholder="введите ответ"
                  value={fieldInput}
                  onChange={e => setFieldInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleCheckField()}
                  autoFocus
                />
                <button className="game-check-btn" onClick={handleCheckField}>Проверить</button>
              </div>
            )}

            {quizPhase.kind === "report" && (
              <span className="quiz-series-title" style={{ marginLeft: 8 }}>Отчёт по раунду</span>
            )}
          </div>

          {/* Full report */}
          {quizPhase.kind === "report" && (
            <div className="quiz-report">
              {seriesRecords.map((rec, i) => (
                <div key={i} className={`quiz-report-item ${rec.correct ? "quiz-report-item--ok" : "quiz-report-item--err"}`}>
                  <div className="quiz-report-name">{rec.label}</div>
                  {rec.correct ? (
                    <>
                      <div className="quiz-report-verdict quiz-ok">✅ Верно</div>
                      <div className="quiz-report-detail">По сколько играет: {rec.correctPlayPerUnit} · Сдача: {rec.correctChange}</div>
                    </>
                  ) : (
                    <>
                      <div className="quiz-report-verdict quiz-err">❌ Неверно</div>
                      <div className="quiz-report-detail">Ваш ответ: по сколько играет {rec.userPlayPerUnit}, сдача {rec.userChange}</div>
                      <div className="quiz-report-detail">Правильный ответ: по сколько играет {rec.correctPlayPerUnit}, сдача {rec.correctChange}</div>
                      <div className="quiz-report-calc">
                        Ставка серии: {rec.amount} / Делитель: {rec.divisor} / Кратность: {rec.multiplicity}<br/>
                        {rec.amount} / {rec.divisor} = {rec.rawPerUnit.toFixed(2)}<br/>
                        Округляем вниз до ближайшей кратности {rec.multiplicity} = {rec.correctPlayPerUnit}<br/>
                        Принятая сумма: {rec.correctPlayPerUnit} × {rec.divisor} = {rec.correctPlayPerUnit * rec.divisor}<br/>
                        Сдача: {rec.amount} − {rec.correctPlayPerUnit * rec.divisor} = {rec.correctChange}
                      </div>
                    </>
                  )}
                </div>
              ))}

              {fieldRecord && (
                <div className={`quiz-report-item ${fieldRecord.correct ? "quiz-report-item--ok" : "quiz-report-item--err"}`}>
                  <div className="quiz-report-name">Выплата по полю</div>
                  {fieldRecord.correct ? (
                    <>
                      <div className="quiz-report-verdict quiz-ok">✅ Верно</div>
                      <div className="quiz-report-detail">Ответ: {fieldRecord.correctAnswer}</div>
                    </>
                  ) : (
                    <>
                      <div className="quiz-report-verdict quiz-err">❌ Неверно</div>
                      <div className="quiz-report-detail">Ваш ответ: {fieldRecord.userAnswer}</div>
                      <div className="quiz-report-detail">Правильный ответ: {fieldRecord.correctAnswer}</div>
                      <div className="quiz-report-calc">
                        {game.breakdown.length === 0 ? (
                          <span>Нет выигрышных ставок — выплата 0</span>
                        ) : (
                          <>
                            {game.breakdown.map((line, j) => (
                              <div key={j}>{line.label}: {line.chips} фишки × {line.chipValue} × {line.payout} = {line.subtotal}</div>
                            ))}
                            <div className="quiz-report-total">Итого: {fieldRecord.correctAnswer}</div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Editor panel */}
      {editMode && (
        <div className="editor-panel">
          <div className="editor-header">
            <div className="editor-tabs">
              <button
                className={`tab-btn ${editTab === "grid" ? "active" : ""}`}
                onClick={() => setEditTab("grid")}
              >
                Верхнее поле
              </button>
              <button
                className={`tab-btn ${editTab === "track" ? "active" : ""}`}
                onClick={() => setEditTab("track")}
              >
                Нижний трек
              </button>
            </div>
            <div className="editor-actions">
              <span className="autosave-badge">✓ Автосохранение</span>
              {editTab === "grid"
                ? <button className="reset-btn" onClick={() => setGridParams(DEFAULT_GRID)}>Сбросить</button>
                : <button className="reset-btn" onClick={() => setTrackParams(DEFAULT_TRACK_PARAMS)}>Сбросить</button>
              }
              <button className="copy-btn" onClick={exportCode}>
                {copied ? "✓ Скопировано!" : "Скопировать код"}
              </button>
            </div>
          </div>

          {/* ── Grid editor ── */}
          {editTab === "grid" && (
            <div className="editor-grid-4">
              <div className="editor-section">
                <div className="editor-section-title">Вертикальные границы</div>
                <SliderRow label="Верх заголовка (headerY)" value={gridParams.headerY} min={50} max={300} onChange={setHeaderY} />
                <SliderRow label="Низ поля (botY)" value={gridParams.botY} min={400} max={700} onChange={setBotY} />
                <SliderRow label="Левый край нуля (zeroX1)" value={gridParams.zeroX1} min={0} max={100} onChange={setZeroX1} />
              </div>
              <div className="editor-section">
                <div className="editor-section-title">X-разделители колонок</div>
                {gridParams.colX.map((v, i) => {
                  const colNums = [0,3,6,9,12,15,18,21,24,27,30,33,36];
                  const lbl = i === 0 ? "← левый край (нуль|1)"
                    : i === gridParams.colX.length - 1 ? "правый край →"
                    : `${colNums[i-1]*3+1}...|${colNums[i]*3+1}...`;
                  return (
                    <SliderRow key={i} label={`Колонка ${i}: X=${v}`} value={v} min={0} max={1480} onChange={val => setColX(i, val)} />
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Track editor ── */}
          {editTab === "track" && (
          <div className="editor-grid-4">
              {/* Vertical bounds */}
              <div className="editor-section">
                <div className="editor-section-title">Общие границы трека</div>
                <SliderRow label="Верхний ряд — верх (topY1)" value={trackParams.topY1} min={500} max={700} onChange={v => setTP("topY1", v)} />
                <SliderRow label="Верхний ряд — низ (topY2)"  value={trackParams.topY2} min={550} max={800} onChange={v => setTP("topY2", v)} />
                <SliderRow label="Нижний ряд — верх (botY1)"  value={trackParams.botY1} min={700} max={1000} onChange={v => setTP("botY1", v)} />
                <SliderRow label="Нижний ряд — низ (botY2)"   value={trackParams.botY2} min={900} max={1063} onChange={v => setTP("botY2", v)} />
              </div>

              {/* Arc bounds */}
              <div className="editor-section">
                <div className="editor-section-title">Дуги (левая / правая)</div>
                <SliderRow label="Лев. дуга — внешний X (arcLX1)" value={trackParams.arcLX1} min={0} max={300} onChange={v => setTP("arcLX1", v)} />
                <SliderRow label="Лев. дуга — внутренний X (arcLX2)" value={trackParams.arcLX2} min={50} max={400} onChange={v => setTP("arcLX2", v)} />
                <SliderRow label="Прав. дуга — внутренний X (arcRX1)" value={trackParams.arcRX1} min={900} max={1450} onChange={v => setTP("arcRX1", v)} />
                <SliderRow label="Прав. дуга — внешний X (arcRX2)" value={trackParams.arcRX2} min={1000} max={1480} onChange={v => setTP("arcRX2", v)} />
                <div className="editor-section-title" style={{ marginTop: 10 }}>Левая дуга — Y-разделители (23 / 8 / 30)</div>
                {(["Y0 (верх)", "Y1 (23|8)", "Y2 (8|30)", "Y3 (низ)"] as const).map((lbl, i) => (
                  <SliderRow key={i} label={lbl} value={trackParams.arcLY[i]} min={500} max={1063} onChange={v => setArcLY(i, v)} />
                ))}
                <div className="editor-section-title" style={{ marginTop: 10 }}>Правая дуга — Y-разделители (3 / 26 / 0)</div>
                {(["Y0 (верх)", "Y1 (3|26)", "Y2 (26|0)", "Y3 (низ)"] as const).map((lbl, i) => (
                  <SliderRow key={i} label={lbl} value={trackParams.arcRY[i]} min={500} max={1063} onChange={v => setArcRY(i, v)} />
                ))}
              </div>

              {/* Top row X boundaries */}
              <div className="editor-section">
                <div className="editor-section-title">Верхний ряд — X-разделители</div>
                {trackParams.topX.map((v, i) => {
                  const topNums = [10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35];
                  const lbl = i === 0 ? "← левый край"
                    : i === trackParams.topX.length - 1 ? "правый край →"
                    : `${topNums[i-1]}|${topNums[i]}`;
                  return <SliderRow key={i} label={lbl} value={v} min={100} max={1400} onChange={v => setTopX(i, v)} />;
                })}
              </div>

              {/* Bottom row X boundaries */}
              <div className="editor-section">
                <div className="editor-section-title">Нижний ряд — X-разделители</div>
                {trackParams.botX.map((v, i) => {
                  const botNums = [11,36,13,27,6,34,17,25,2,21,4,19,15,32];
                  const lbl = i === 0 ? "← левый край"
                    : i === trackParams.botX.length - 1 ? "правый край →"
                    : `${botNums[i-1]}|${botNums[i]}`;
                  return <SliderRow key={i} label={lbl} value={v} min={100} max={1400} onChange={v => setBotX(i, v)} />;
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Slider + number input ─────────────────────────────────────────────────────
function SliderRow({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <div className="slider-row">
      <span className="slider-label">{label}</span>
      <input type="range" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))} className="slider-input" />
      <input type="number" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))} className="number-input" />
    </div>
  );
}
