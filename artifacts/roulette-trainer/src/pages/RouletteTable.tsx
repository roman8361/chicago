import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { BASE_WIDTH, BASE_HEIGHT } from "@/data/zones";
import { DEFAULT_TRACK_PARAMS, buildTrackZones, buildSectorBands, sectorFor, type TrackParams } from "@/data/trackZones";
import ruletImage from "@assets/rul_final_1782983519184.png";
import { GameSettings } from "@/types/gameSettings";
import { BET_POSITIONS_MAP } from "@/data/betPositions";
import { spinGame, calculatePayout, getNumberColor, generateCashChips, type GameState, type TrackBet, type DozenCompleteBet, type NumberCompleteBet, type NeighboursBet } from "@/lib/rouletteGame";
import { useRouletteRules } from "@/lib/rulesContext";
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

type QuizPhase = { kind: "completes" } | { kind: "series"; idx: number } | { kind: "field" } | { kind: "report" };

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

interface CompleteLineSummary {
  label: string;
  amount: number;
  chipsRequired: number;
  rawPlay: number;
  playPerUnit: number;
  acceptedAmount: number;
  change: number;
  maxBet: number;
  multiplicity: number;
}

interface CompleteQuizRecord {
  userAnswer: number;
  correctAnswer: number;
  correct: boolean;
  lines: CompleteLineSummary[];
}

function calcOneCompleteChange(
  amount: number,
  chipsRequired: number,
  maxBet: number,
  multiplicity: number,
): { rawPlay: number; playPerUnit: number; acceptedAmount: number; change: number } {
  const rawPlay = amount / chipsRequired;
  const playPerUnit = Math.floor(Math.min(rawPlay, maxBet) / multiplicity) * multiplicity;
  const acceptedAmount = playPerUnit * chipsRequired;
  return { rawPlay, playPerUnit, acceptedAmount, change: amount - acceptedAmount };
}

// ── Main grid default params ──────────────────────────────────────────────────
const DEFAULT_GRID = {
  headerY: 205,
  botY: 593,
  zeroX1: 46,
  colX: [149, 247, 342, 440, 537, 634, 733, 830, 926, 1023, 1120, 1219, 1316],
};
type GridParams = typeof DEFAULT_GRID;

// ── Dozens (1st 12 / 2nd 12 / 3rd 12) default params ──────────────────────────
const DEFAULT_DOZENS = {
  y1: 117,
  y2: 195,
  x: [151, 539, 925, 1315],
};
type DozensParams = typeof DEFAULT_DOZENS;

// ── Build dozens zones ─────────────────────────────────────────────────────────
function buildDozensZones(p: DozensParams) {
  const labels = ["1st 12", "2nd 12", "3rd 12"];
  const zones: { id: string; label: string; pts: string; cx: number; cy: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const x1 = p.x[i], x2 = p.x[i + 1];
    zones.push({
      id: `dz-${i}`, label: labels[i],
      pts: `${x1},${p.y1} ${x2},${p.y1} ${x2},${p.y2} ${x1},${p.y2}`,
      cx: (x1 + x2) / 2, cy: (p.y1 + p.y2) / 2,
    });
  }
  return zones;
}

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
const STORAGE_KEY_GRID   = "roulette_grid_params_v2";
const STORAGE_KEY_TRACK  = "roulette_track_params_v2";
const STORAGE_KEY_DOZENS = "roulette_dozens_params_v1";

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

function loadDozens(): DozensParams {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DOZENS);
    if (raw) return { ...DEFAULT_DOZENS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_DOZENS;
}

// ── Component ─────────────────────────────────────────────────────────────────
interface RouletteTableProps {
  settings: GameSettings;
  onOpenSettings: () => void;
}

export default function RouletteTable({ settings, onOpenSettings }: RouletteTableProps) {
  const [showGrid,   setShowGrid]   = useState(false);
  const [showTrack,  setShowTrack]  = useState(false);
  const [showDozens, setShowDozens] = useState(false);
  const [editMode,  setEditMode]  = useState(false);
  const [editTab,   setEditTab]   = useState<"grid" | "track" | "dozens">("grid");
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
  const [completesInput,    setCompletesInput]    = useState("");
  const [completesRecord,   setCompletesRecord]   = useState<CompleteQuizRecord | null>(null);

  const [gridParams,   setGridParams]   = useState<GridParams>(loadGrid);
  const [trackParams,  setTrackParams]  = useState<TrackParams>(loadTrack);
  const [dozensParams, setDozensParams] = useState<DozensParams>(loadDozens);

  const { getPayouts, getTrackBetRule, getAllRules, getCompleteBetRule, getNeighboursRule } = useRouletteRules();

  // Series divisors and payout map — re-derived whenever rules change
  const seriesDivisors = useMemo<Record<TrackBet["type"], number>>(() => ({
    SERIE_5_8:   getTrackBetRule("SERIE_5_8").divisor,
    ORPHELINS:   getTrackBetRule("ORPHELINS").divisor,
    SERIE_0_2_3: getTrackBetRule("SERIE_0_2_3").divisor,
    ZERO_SPIEL:  getTrackBetRule("ZERO_SPIEL").divisor,
  }), [getTrackBetRule]);

  const payoutMap = useMemo<Record<string, number>>(() => {
    const p = getPayouts();
    return {
      straight: p.straightUp,
      split:    p.split,
      street:   p.street,
      corner:   p.corner,
      sixline:  p.sixLine,
    };
  }, [getPayouts]);

  // Keep getAllRules accessible for any future per-spin rule reads
  const _getAllRules = getAllRules;

  // Auto-save to localStorage whenever params change.
  // Skip the very first run (initial mount) so that, on first load with no
  // saved coordinates, the code defaults are used without being immediately
  // re-persisted verbatim — keeping DEFAULT_GRID/DEFAULT_TRACK_PARAMS/DEFAULT_DOZENS
  // as the single source of truth for both "first load" and "Сбросить".
  const isGridFirstRender = useRef(true);
  useEffect(() => {
    if (isGridFirstRender.current) { isGridFirstRender.current = false; return; }
    localStorage.setItem(STORAGE_KEY_GRID, JSON.stringify(gridParams));
  }, [gridParams]);

  const isTrackFirstRender = useRef(true);
  useEffect(() => {
    if (isTrackFirstRender.current) { isTrackFirstRender.current = false; return; }
    localStorage.setItem(STORAGE_KEY_TRACK, JSON.stringify(trackParams));
  }, [trackParams]);

  const isDozensFirstRender = useRef(true);
  useEffect(() => {
    if (isDozensFirstRender.current) { isDozensFirstRender.current = false; return; }
    localStorage.setItem(STORAGE_KEY_DOZENS, JSON.stringify(dozensParams));
  }, [dozensParams]);

  const gridZones   = buildGridZones(gridParams);
  const trackZones  = buildTrackZones(trackParams);
  const sectorBands = buildSectorBands(trackParams);
  const dozensZones = buildDozensZones(dozensParams);
  const chipPosMap  = useMemo(() => buildDynamicPositions(gridParams), [gridParams]);
  const trackNumberPosMap = useMemo(() => {
    const m = new Map<number, { x: number; y: number }>();
    for (const z of trackZones) m.set(z.number, { x: z.cx, y: z.cy });
    return m;
  }, [trackZones]);

  // ── Grid param setters ──────────────────────────────────────────────────────
  const setHeaderY = useCallback((v: number) => setGridParams(p => ({ ...p, headerY: v })), []);
  const setBotY    = useCallback((v: number) => setGridParams(p => ({ ...p, botY: v })), []);
  const setZeroX1  = useCallback((v: number) => setGridParams(p => ({ ...p, zeroX1: v })), []);
  const setColX    = useCallback((i: number, v: number) =>
    setGridParams(p => { const colX = [...p.colX]; colX[i] = v; return { ...p, colX }; }), []);

  // ── Dozens param setters ─────────────────────────────────────────────────────
  const setDozensY1 = useCallback((v: number) => setDozensParams(p => ({ ...p, y1: v })), []);
  const setDozensY2 = useCallback((v: number) => setDozensParams(p => ({ ...p, y2: v })), []);
  const setDozensX  = useCallback((i: number, v: number) =>
    setDozensParams(p => { const x = [...p.x]; x[i] = v; return { ...p, x }; }), []);

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

  // ── Number complete bet generation ──────────────────────────────────────────
  function generateNumberCompletes(
    dozenCompleteBet: DozenCompleteBet | undefined,
    currentChipPosMap: Map<string, { x: number; y: number }>,
  ): { bets: NumberCompleteBet[]; excludedIds: Set<string> } {
    const bets: NumberCompleteBet[] = [];
    const excludedIds = new Set<string>();

    if (settings.completeField !== "yes") return { bets, excludedIds };

    const count = Math.min(3, Math.max(1, settings.completeCount ?? 1));
    const minBet = Math.max(1, settings.minBet);
    const maxBet = Math.max(minBet, settings.maxBet);

    const DOZEN_RANGES: Record<"1ST_12" | "2ND_12" | "3RD_12", number[]> = {
      "1ST_12": Array.from({ length: 12 }, (_, i) => i + 1),
      "2ND_12": Array.from({ length: 12 }, (_, i) => i + 13),
      "3RD_12": Array.from({ length: 12 }, (_, i) => i + 25),
    };

    let selectedNumbers: number[] = [];

    if (settings.completeDozen === "yes" && dozenCompleteBet) {
      const primaryDozen = dozenCompleteBet.dozen;
      const allDozens = ["1ST_12", "2ND_12", "3RD_12"] as const;
      const otherDozens = allDozens.filter(d => d !== primaryDozen);

      // One number from the primary dozen
      const primaryPool = [...DOZEN_RANGES[primaryDozen]];
      const n1 = primaryPool[Math.floor(Math.random() * primaryPool.length)];
      selectedNumbers.push(n1);

      if (count >= 2) {
        const d2 = otherDozens[Math.floor(Math.random() * otherDozens.length)];
        const d2Pool = DOZEN_RANGES[d2].filter(n => !selectedNumbers.includes(n));
        const n2 = d2Pool[Math.floor(Math.random() * d2Pool.length)];
        selectedNumbers.push(n2);
      }

      if (count >= 3) {
        // Third number goes in the remaining dozen
        const usedDozens = new Set<string>();
        selectedNumbers.forEach(n => {
          if (n <= 12) usedDozens.add("1ST_12");
          else if (n <= 24) usedDozens.add("2ND_12");
          else usedDozens.add("3RD_12");
        });
        const d3 = allDozens.find(d => !usedDozens.has(d));
        if (d3) {
          const d3Pool = DOZEN_RANGES[d3].filter(n => !selectedNumbers.includes(n));
          const n3 = d3Pool[Math.floor(Math.random() * d3Pool.length)];
          selectedNumbers.push(n3);
        }
      }
    } else {
      // Any number 0–36, pick unique random
      const pool = Array.from({ length: 37 }, (_, i) => i);
      // Fisher-Yates shuffle first `count` picks
      for (let i = 0; i < count; i++) {
        const j = i + Math.floor(Math.random() * (pool.length - i));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      selectedNumbers = pool.slice(0, count);
    }

    for (const num of selectedNumbers) {
      const rule = getCompleteBetRule(num);
      if (!rule) continue;
      const pos = currentChipPosMap.get(`su-${num}`);
      if (!pos) continue;
      const X = minBet + Math.floor(Math.random() * (maxBet - minBet + 1));
      const rawAmount = X * rule.chipsRequired;
      const amount = Math.floor((rawAmount - 5) / 10) * 10 + 5;
      bets.push({ number: num, chipsRequired: rule.chipsRequired, amount, position: pos });
      excludedIds.add(`su-${num}`);
    }

    return { bets, excludedIds };
  }

  // ── Spin ────────────────────────────────────────────────────────────────────
  const handleSpin = useCallback(() => {
    const chipCount = settings.chipsInField ?? 100;
    const chipValue = settings.chipValue ?? 10;

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
        amount:   randomTrackAmount(mult * seriesDivisors[s.type]),
        position: { x: s.band.cx, y: s.band.cy },
        source:   "TRACK" as const,
      }));

    // ── Dozen complete bet ──────────────────────────────────────────────────────
    let dozenCompleteBet: DozenCompleteBet | undefined;
    if (settings.completeDozen === "yes") {
      const DOZEN_IDS = ["1ST_12", "2ND_12", "3RD_12"] as const;
      const idx = Math.floor(Math.random() * 3);
      const { x, y1, y2 } = dozensParams;
      const cx = (x[idx] + x[idx + 1]) / 2;
      const cy = (y1 + y2) / 2;
      const minBet = Math.max(1, settings.minBet);
      const maxBet = Math.max(minBet, settings.maxBet);
      const X = minBet + Math.floor(Math.random() * (maxBet - minBet + 1));
      dozenCompleteBet = {
        type:      "DOZEN_COMPLETE",
        label:     "Комплит дюжины",
        dozen:     DOZEN_IDS[idx],
        baseValue: X,
        amount:    X * 100 + 25,
        position:  { x: cx, y: cy },
        source:    "DOZEN_COMPLETE",
      };
    }

    // ── Number complete bets ────────────────────────────────────────────────────
    const currentChipPosMap = buildDynamicPositions(gridParams);
    const { bets: numberCompleteBets, excludedIds } = generateNumberCompletes(dozenCompleteBet, currentChipPosMap);

    const base = spinGame(chipCount, chipValue, payoutMap, excludedIds.size > 0 ? excludedIds : undefined);

    const occupiedIds = new Set(base.chips.map(c => c.positionId));
    const cashOnField = settings.cashOnField ?? 0;
    const cashChipValues = settings.cashChipValues?.length ? settings.cashChipValues : ["100"];
    const cashChipStacks = generateCashChips(cashOnField, cashChipValues, occupiedIds);

    // ── Neighbours bets ("Соседи номера") ───────────────────────────────────────
    // Reference only — full 5-number layout (getNeighboursRule) is not laid out
    // on the field at this stage, only a single cash chip per selected number.
    const neighboursRule = getNeighboursRule();
    const neighboursCountRaw = settings.neighborsCount ?? 0;
    const neighboursCount = Math.max(0, Math.min(37, Math.floor(neighboursCountRaw)));
    let neighboursBets: NeighboursBet[] = [];
    if (neighboursCount > 0) {
      const pool = Array.from({ length: 37 }, (_, i) => i);
      for (let i = 0; i < neighboursCount; i++) {
        const j = i + Math.floor(Math.random() * (pool.length - i));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const selectedNumbers = pool.slice(0, neighboursCount);
      const minBet = Math.max(1, settings.minBet);
      const maxBet = Math.max(minBet, settings.maxBet);
      const lowerBoundRaw = Math.round(maxBet / 3);
      const lowerBound = Math.min(Math.max(1, lowerBoundRaw), maxBet);
      neighboursBets = selectedNumbers.map(num => {
        const baseAmount = lowerBound + Math.floor(Math.random() * (maxBet - lowerBound + 1));
        const amount = baseAmount * 5;
        let pos = trackNumberPosMap.get(num) ?? { x: 0, y: 0 };
        if (num === 30) {
          // Place in the top-right corner of the zone, shifted left 20% and down 20% of the cell's dimensions
          const cellW = Math.abs(trackParams.arcLX2 - trackParams.arcLX1);
          const cellH = Math.abs(trackParams.arcLY[3] - trackParams.arcLY[2]);
          pos = {
            x: trackParams.arcLX2 - 0.2 * cellW,
            y: trackParams.arcLY[2] + 0.2 * cellH,
          };
        }
        if (num === 32) {
          // Bottom-row cell for 32 is the last one (index 13 of BOT_NUMBERS)
          const x1 = trackParams.botX[13], x2 = trackParams.botX[14];
          const cellW = Math.abs(x2 - x1);
          const cellH = Math.abs(trackParams.botY2 - trackParams.botY1);
          pos = {
            x: pos.x - 0.4 * cellW,
            y: pos.y + 0.4 * cellH,
          };
        }
        void neighboursRule; // reference-only lookup for future straight-up layout
        return { number: num, baseAmount, amount, position: pos, source: "NEIGHBOURS" as const };
      });
    }

    setGame({ ...base, trackBets, dozenCompleteBet, numberCompleteBets, cashChipStacks, neighboursBets });

    // Build quiz queue from active series in fixed order
    const ordered = SERIES_QUIZ_ORDER
      .map(t => trackBets.find(tb => tb.type === t))
      .filter((tb): tb is TrackBet => tb !== undefined);
    const hasCompletes = settings.completeField === "yes" || settings.completeDozen === "yes";
    setActiveSeries(ordered);
    setSeriesRecords([]);
    setFieldRecord(null);
    setCompletesRecord(null);
    setSeriesPlayInput("");
    setSeriesChangeInput("");
    setFieldInput("");
    setCompletesInput("");
    setQuizPhase(
      hasCompletes ? { kind: "completes" } :
      ordered.length > 0 ? { kind: "series", idx: 0 } :
      { kind: "field" }
    );

    setEditMode(false);
  }, [
    settings.chipsInField,
    settings.chipValue,
    settings.multiplicity,
    settings.bet58,
    settings.betOrphelins,
    settings.betSeria023,
    settings.betZeroSpiel,
    settings.completeDozen,
    settings.completeField,
    settings.completeCount,
    settings.minBet,
    settings.maxBet,
    settings.cashOnField,
    settings.cashChipValues,
    trackParams,
    dozensParams,
    gridParams,
    seriesDivisors,
    payoutMap,
    getCompleteBetRule,
  ]);

  const handleCheckSeries = useCallback(() => {
    if (!game || !quizPhase || quizPhase.kind !== "series") return;
    const tb = activeSeries[quizPhase.idx];
    if (!tb) return;
    const mult = Math.max(10, Math.min(1000, settings.multiplicity ?? 10));
    const divisor = seriesDivisors[tb.type];
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
  }, [game, quizPhase, activeSeries, seriesPlayInput, seriesChangeInput, settings.multiplicity, seriesDivisors]);

  const handleCheckField = useCallback(() => {
    if (!game || !quizPhase || quizPhase.kind !== "field") return;
    const userAnswer = parseInt(fieldInput || "0", 10) || 0;
    setFieldRecord({ userAnswer, correctAnswer: game.correctAnswer, correct: userAnswer === game.correctAnswer });
    setQuizPhase({ kind: "report" });
  }, [game, quizPhase, fieldInput]);

  const handleCheckCompletes = useCallback(() => {
    if (!game || !quizPhase || quizPhase.kind !== "completes") return;
    const userAnswer = parseInt(completesInput || "0", 10) || 0;
    const maxBet = Math.max(1, settings.maxBet);
    const multiplicity = Math.max(1, settings.completeMultiplicity);
    const rules = getAllRules();
    const lines: CompleteLineSummary[] = [];

    if (game.dozenCompleteBet) {
      const { amount, dozen } = game.dozenCompleteBet;
      const dozenNum = dozen === "1ST_12" ? 1 : dozen === "2ND_12" ? 2 : 3;
      const dozenRule = rules.dozenComplete.dozens.find(d => d.dozen === dozenNum);
      const chipsRequired = dozenRule?.chipsRequired ?? 100;
      const { rawPlay, playPerUnit, acceptedAmount, change } = calcOneCompleteChange(amount, chipsRequired, maxBet, multiplicity);
      lines.push({ label: "Неполный комплит дюжины", amount, chipsRequired, rawPlay, playPerUnit, acceptedAmount, change, maxBet, multiplicity });
    }
    for (const ncb of game.numberCompleteBets) {
      const { rawPlay, playPerUnit, acceptedAmount, change } = calcOneCompleteChange(ncb.amount, ncb.chipsRequired, maxBet, multiplicity);
      lines.push({ label: `Комплит №${ncb.number}`, amount: ncb.amount, chipsRequired: ncb.chipsRequired, rawPlay, playPerUnit, acceptedAmount, change, maxBet, multiplicity });
    }

    const correctAnswer = lines.reduce((s, l) => s + l.change, 0);
    setCompletesRecord({ userAnswer, correctAnswer, correct: userAnswer === correctAnswer, lines });
    setCompletesInput("");
    setQuizPhase(activeSeries.length > 0 ? { kind: "series", idx: 0 } : { kind: "field" });
  }, [game, quizPhase, completesInput, activeSeries, settings.maxBet, settings.completeMultiplicity, getAllRules]);

  // ── Export ──────────────────────────────────────────────────────────────────
  const exportCode = () => {
    const g = gridParams, t = trackParams, d = dozensParams;
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
      ``,
      `// ── Dozens ──`,
      `y1: ${d.y1}, y2: ${d.y2},`,
      `x: [${d.x.join(", ")}],`,
    ].join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  const hasCompletesQuestion = settings.completeField === "yes" || settings.completeDozen === "yes";
  const seriesBaseNum = hasCompletesQuestion ? 2 : 1;
  const fieldQuestionNum = (hasCompletesQuestion ? 1 : 0) + activeSeries.length + 1;

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
        <button className={`grid-toggle-btn ${showDozens ? "active" : ""}`}
          onClick={() => setShowDozens(v => !v)}>
          {showDozens ? "Скрыть дюжины" : "Показать дюжины"}
        </button>
        <button className={`grid-toggle-btn ${editMode ? "active" : ""}`}
          onClick={() => { setEditMode(v => !v); if (!editMode) { setShowTrack(true); setShowDozens(true); } }}>
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

          {/* Dozens — 1st 12 / 2nd 12 / 3rd 12 */}
          {showDozens && dozensZones.map(z => (
            <g key={z.id}>
              <polygon points={z.pts} fill="rgba(0,220,255,0.18)" stroke="#00CFFF" strokeWidth="1.5" />
              <text x={z.cx} y={z.cy} textAnchor="middle" dominantBaseline="central"
                fontSize="16" fontWeight="bold" fill="#00CFFF"
                stroke="rgba(0,0,0,0.6)" strokeWidth="0.4" paintOrder="stroke">
                {z.label}
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

          {/* Cash chips — round, slightly larger than color chips */}
          {game && game.cashChipStacks && game.cashChipStacks.map(stack => {
            const pos = chipPosMap.get(stack.positionId);
            if (!pos) return null;
            const amt = String(stack.totalAmount);
            const len = amt.length;
            const fs = len >= 6 ? "8" : len >= 5 ? "9.5" : len >= 4 ? "11" : len >= 3 ? "12.5" : "13.5";
            const r = 22;
            return (
              <g key={`cash-${stack.positionId}`} style={{ pointerEvents: "none" }}>
                {/* Outer glow ring */}
                <circle cx={pos.x} cy={pos.y} r={r + 3} fill="none" stroke="#B87333" strokeWidth="1.6" opacity="0.45" />
                {/* Main body */}
                <circle cx={pos.x} cy={pos.y} r={r} fill="#111418" stroke="#B87333" strokeWidth="2.8" />
                {/* Inner decorative ring */}
                <circle cx={pos.x} cy={pos.y} r={r - 5} fill="none" stroke="#D9D9D9" strokeWidth="0.8" opacity="0.6" />
                {/* Dashed rim accent — distinct chip pattern */}
                <circle cx={pos.x} cy={pos.y} r={r - 2} fill="none" stroke="#D9D9D9" strokeWidth="1"
                  strokeDasharray="3 3" opacity="0.5" />
                {/* Amount text */}
                <text x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="central"
                  fontSize={fs} fontWeight="800" fill="#D9D9D9"
                  stroke="rgba(0,0,0,0.75)" strokeWidth="0.6" paintOrder="stroke"
                  letterSpacing="0.3">
                  {amt}
                </text>
              </g>
            );
          })}

          {/* Dozen complete chip — ~3× larger than normal chips (r=57), gold style */}
          {game?.dozenCompleteBet && (() => {
            const { x, y } = game.dozenCompleteBet.position;
            const amt = String(game.dozenCompleteBet.amount);
            const fs = amt.length >= 6 ? "11" : amt.length >= 5 ? "13" : amt.length >= 4 ? "16" : "19";
            return (
              <g style={{ pointerEvents: "none" }}>
                {/* Outer glow ring */}
                <circle cx={x} cy={y} r={45} fill="none" stroke="#C9A227" strokeWidth="2" opacity="0.4" />
                {/* Main body */}
                <circle cx={x} cy={y} r={40} fill="rgba(8,18,10,0.93)" stroke="#C9A227" strokeWidth="3.5" />
                {/* Inner decorative ring */}
                <circle cx={x} cy={y} r={34} fill="none" stroke="#C9A227" strokeWidth="1.2" opacity="0.6" />
                {/* Amount text */}
                <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
                  fontSize={fs} fontWeight="800" fill="#C9A227"
                  stroke="rgba(0,0,0,0.7)" strokeWidth="0.8" paintOrder="stroke"
                  letterSpacing="0.5">
                  {amt}
                </text>
              </g>
            );
          })()}

          {/* Number complete chips — large gold chip centered on the straight-up */}
          {game && game.numberCompleteBets.map(ncb => {
            const { x, y } = ncb.position;
            const amt = String(ncb.amount);
            const fs = amt.length >= 6 ? "10" : amt.length >= 5 ? "12" : amt.length >= 4 ? "14" : "17";
            return (
              <g key={`ncb-${ncb.number}`} style={{ pointerEvents: "none" }}>
                {/* Outer glow ring */}
                <circle cx={x} cy={y} r={45} fill="none" stroke="#E0C060" strokeWidth="2.5" opacity="0.45" />
                {/* Main body */}
                <circle cx={x} cy={y} r={40} fill="rgba(10,6,2,0.95)" stroke="#E0C060" strokeWidth="4" />
                {/* Inner decorative ring */}
                <circle cx={x} cy={y} r={33} fill="none" stroke="#E0C060" strokeWidth="1.2" opacity="0.55" />
                {/* Number label at top */}
                <text x={x} y={y - 11} textAnchor="middle" dominantBaseline="central"
                  fontSize="16" fontWeight="800" fill="#E0C060"
                  stroke="rgba(0,0,0,0.8)" strokeWidth="0.5" paintOrder="stroke">
                  №{ncb.number}
                </text>
                {/* Amount text */}
                <text x={x} y={y + 12} textAnchor="middle" dominantBaseline="central"
                  fontSize={fs} fontWeight="900" fill="#E0C060"
                  stroke="rgba(0,0,0,0.8)" strokeWidth="0.7" paintOrder="stroke"
                  letterSpacing="0.3">
                  {amt}
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

          {/* Neighbours ("Соседи номера") cash chips — Chicago-1932 copper/silver style */}
          {game && game.neighboursBets.map(nb => {
            const { x, y } = nb.position;
            const amt = String(nb.amount);
            const fs = amt.length >= 6 ? "10" : amt.length >= 5 ? "11" : amt.length >= 4 ? "13" : "15";
            return (
              <g key={`nb-${nb.number}`} style={{ pointerEvents: "none" }}>
                {/* Outer glow ring */}
                <circle cx={x} cy={y} r={32} fill="none" stroke="#B87333" strokeWidth="1.6" opacity="0.45" />
                {/* Main body */}
                <circle cx={x} cy={y} r={28} fill="#111418" stroke="#B87333" strokeWidth="2.8" />
                {/* Inner decorative ring */}
                <circle cx={x} cy={y} r={23} fill="none" stroke="#D9D9D9" strokeWidth="0.8" opacity="0.6" />
                {/* Dashed rim accent — distinct chip pattern */}
                <circle cx={x} cy={y} r={26} fill="none" stroke="#D9D9D9" strokeWidth="1"
                  strokeDasharray="3 3" opacity="0.5" />
                {/* Amount text */}
                <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
                  fontSize={fs} fontWeight="800" fill="#D9D9D9"
                  stroke="rgba(0,0,0,0.75)" strokeWidth="0.6" paintOrder="stroke"
                  letterSpacing="0.3">
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
          <span className="info-sidebar-label">Кратность серии</span>
          <span className="info-sidebar-value">{settings.multiplicity}</span>
        </div>
        {game?.dozenCompleteBet && (
          <>
            <div className="info-sidebar-divider" />
            <div className="info-sidebar-row">
              <span className="info-sidebar-label">Комплит дюжины</span>
              <span className="info-sidebar-value" style={{ color: "#C9A227", fontWeight: 800 }}>
                {game.dozenCompleteBet.amount}
              </span>
            </div>
          </>
        )}
        {game?.numberCompleteBets && game.numberCompleteBets.length > 0 && (
          <>
            <div className="info-sidebar-divider" />
            <div className="info-sidebar-row">
              <span className="info-sidebar-value" style={{ color: "#E0C060", fontWeight: 800, fontSize: "1.1em" }}>Комплиты</span>
            </div>
            {game.numberCompleteBets.map(ncb => (
              <div key={`sidebar-ncb-${ncb.number}`} className="info-sidebar-row">
                <span className="info-sidebar-value" style={{ color: "#E0C060", fontWeight: 700, fontSize: "1em" }}>№{ncb.number}</span>
                <span className="info-sidebar-value" style={{ color: "#E0C060", fontWeight: 800 }}>
                  {ncb.amount}
                </span>
              </div>
            ))}
            <div className="info-sidebar-divider" />
            <div className="info-sidebar-row">
              <span className="info-sidebar-label">Кратность комплита</span>
              <span className="info-sidebar-value">{settings.completeMultiplicity}</span>
            </div>
          </>
        )}
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

            {/* Completes question */}
            {quizPhase.kind === "completes" && (
              <div className="game-answer-area">
                <div className="quiz-series-header">
                  <span className="quiz-series-title">1. Сдача кратности комплитов</span>
                  <span className="quiz-series-sub">Общая сдача</span>
                </div>
                <input
                  type="number"
                  className="game-answer-input"
                  placeholder="Общая сдача"
                  value={completesInput}
                  onChange={e => setCompletesInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleCheckCompletes()}
                  autoFocus
                />
                <button className="game-check-btn" onClick={handleCheckCompletes}>Проверить</button>
              </div>
            )}

            {/* Series question */}
            {quizPhase.kind === "series" && (() => {
              const tb = activeSeries[quizPhase.idx];
              if (!tb) return null;
              return (
                <div className="game-answer-area">
                  <div className="quiz-series-header">
                    <span className="quiz-series-title">{seriesBaseNum + quizPhase.idx}. {tb.label}</span>
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
                  <span className="quiz-series-title">{fieldQuestionNum}. Выплата по полю</span>
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
              {completesRecord && (
                <div className={`quiz-report-item ${completesRecord.correct ? "quiz-report-item--ok" : "quiz-report-item--err"}`}>
                  <div className="quiz-report-name">Сдача кратности комплитов</div>
                  {completesRecord.correct ? (
                    <>
                      <div className="quiz-report-verdict quiz-ok">✅ Верно</div>
                      <div className="quiz-report-detail">Ответ: {completesRecord.correctAnswer}</div>
                    </>
                  ) : (
                    <>
                      <div className="quiz-report-verdict quiz-err">❌ Неверно</div>
                      <div className="quiz-report-detail">Ваш ответ: {completesRecord.userAnswer}</div>
                      <div className="quiz-report-detail">Правильный ответ: {completesRecord.correctAnswer}</div>
                      <div className="quiz-report-calc">
                        {completesRecord.lines.map((line, li) => (
                          <div key={li} style={{ marginBottom: 6 }}>
                            {line.label}: {line.amount} / {line.chipsRequired} = {line.rawPlay.toFixed(3)}<br/>
                            Максимум: {line.maxBet}, кратность: {line.multiplicity}<br/>
                            Округляем вниз до {line.playPerUnit}<br/>
                            Сдача: {line.amount} − {line.playPerUnit} × {line.chipsRequired} = {line.change}
                          </div>
                        ))}
                        <div className="quiz-report-total">
                          Итого: {completesRecord.lines.map(l => l.change).join(" + ")} = {completesRecord.correctAnswer}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
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
              <button
                className={`tab-btn ${editTab === "dozens" ? "active" : ""}`}
                onClick={() => setEditTab("dozens")}
              >
                Дюжины
              </button>
            </div>
            <div className="editor-actions">
              <span className="autosave-badge">✓ Автосохранение</span>
              {editTab === "grid"
                ? <button className="reset-btn" onClick={() => setGridParams(DEFAULT_GRID)}>Сбросить</button>
                : editTab === "track"
                ? <button className="reset-btn" onClick={() => setTrackParams(DEFAULT_TRACK_PARAMS)}>Сбросить</button>
                : <button className="reset-btn" onClick={() => setDozensParams(DEFAULT_DOZENS)}>Сбросить</button>
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

          {/* ── Dozens editor ── */}
          {editTab === "dozens" && (
            <div className="editor-grid-4">
              <div className="editor-section">
                <div className="editor-section-title">Вертикальные границы</div>
                <SliderRow label="Верх ряда (y1)" value={dozensParams.y1} min={0} max={300} onChange={setDozensY1} />
                <SliderRow label="Низ ряда (y2)" value={dozensParams.y2} min={0} max={400} onChange={setDozensY2} />
              </div>
              <div className="editor-section">
                <div className="editor-section-title">X-разделители дюжин</div>
                {dozensParams.x.map((v, i) => {
                  const lbl = i === 0 ? "← левый край (1st 12)"
                    : i === dozensParams.x.length - 1 ? "правый край →"
                    : i === 1 ? "1st 12 | 2nd 12"
                    : "2nd 12 | 3rd 12";
                  return (
                    <SliderRow key={i} label={lbl} value={v} min={0} max={1480} onChange={val => setDozensX(i, val)} />
                  );
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
