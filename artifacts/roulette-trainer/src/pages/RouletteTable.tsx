import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { BASE_WIDTH, BASE_HEIGHT } from "@/data/zones";
import { DEFAULT_TRACK_PARAMS, buildTrackZones, buildSectorBands, sectorFor, type TrackParams } from "@/data/trackZones";
import ruletImage from "@assets/rul_final_1782983519184.png";
import spinSoundUrl from "@assets/spin_2sec_1784187842896.mp4";
import { GameSettings } from "@/types/gameSettings";
import { BET_POSITIONS_MAP, ALL_BET_POSITIONS } from "@/data/betPositions";
import { spinGame, calculatePayout, getNumberColor, generateColorChips, generateCashChips, type GameState, type TrackBet, type DozenCompleteBet, type NumberCompleteBet, type NeighboursBet } from "@/lib/rouletteGame";
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

type QuizPhase = { kind: "completes" } | { kind: "completesIntersection" } | { kind: "series" } | { kind: "trackIntersection" } | { kind: "trackFieldIntersection" } | { kind: "completeTrackIntersection" } | { kind: "completeNumberPayout" } | { kind: "seriesFieldPayout" } | { kind: "neighboursPayout" } | { kind: "field" } | { kind: "colorPayout" } | { kind: "report" };

interface SeriesLineSummary {
  type: TrackBet["type"];
  label: string;
  amount: number;
  divisor: number;
  multiplicity: number;
  rawPerUnit: number;
  playPerUnit: number;
  acceptedAmount: number;
  change: number;
}

interface SeriesQuizRecord {
  userAnswer: number;
  correctAnswer: number;
  correct: boolean;
  lines: SeriesLineSummary[];
}

interface WinningFieldEntry {
  positionId: string;
  amount: number;
  positionType: "straight" | "split" | "street" | "corner" | "sixline";
  positionNums: number[];
  payoutMultiplier: number;
  /** How to display this winning position on the field */
  displayAs: "color" | "cash" | "merged";
  /** Original chip count — only relevant when displayAs === "color" */
  colorCount: number;
}

interface FieldQuizRecord {
  userAnswer: number;
  correctAnswer: number;
  correct: boolean;
  entries: WinningFieldEntry[];
}

interface ColorPayoutQuizRecord {
  userAnswer: number;
  correctAnswer: number; // colorChips count
  correct: boolean;
  cashPayout: number;
  totalPayout: number;
  colorAmount: number;
  colorNominal: number;
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

interface IntersectionLineSummary {
  label: string;
  positionLimit: number;
  dozenCompleteAmount: number;
  numberCompleteAmounts: Array<{ number: number; amount: number }>;
  colorAmount: number;
  cashAmount: number;
  totalAmount: number;
  change: number;
}

interface IntersectionQuizRecord {
  userAnswer: number;
  correctAnswer: number;
  correct: boolean;
  lines: IntersectionLineSummary[];
}

interface TrackIntersectionLineSummary {
  label: string;
  positionLimit: number;
  contributions: Array<{ source: string; amount: number }>;
  totalAmount: number;
  change: number;
}

interface TrackIntersectionQuizRecord {
  userAnswer: number;
  correctAnswer: number;
  correct: boolean;
  lines: TrackIntersectionLineSummary[];
}

interface TrackFieldIntersectionLineSummary {
  label: string;
  positionLimit: number;
  effectiveTrackAmount: number;
  colorAmount: number;
  cashAmount: number;
  totalAmount: number;
  change: number;
}

interface TrackFieldIntersectionQuizRecord {
  userAnswer: number;
  correctAnswer: number;
  correct: boolean;
  lines: TrackFieldIntersectionLineSummary[];
}

interface CompleteTrackIntersectionLineSummary {
  label: string;
  positionLimit: number;
  completeAmount: number;
  effectiveTrackAmount: number;
  totalAmount: number;
  change: number;
}

interface CompleteTrackIntersectionQuizRecord {
  userAnswer: number;
  correctAnswer: number;
  correct: boolean;
  lines: CompleteTrackIntersectionLineSummary[];
}

interface CompleteNumberPayoutWinningPos {
  positionLabel: string;
  amount: number; // playPerUnit for this touch
}

interface CompleteNumberPayoutLine {
  label: string;        // "Комплит №4" / "Комплит дюжины"
  playPerUnit: number;
  uniquePositions: CompleteNumberPayoutWinningPos[]; // non-capped winning positions only
  uniqueTotal: number;
}

interface CompleteNumberPayoutCappedLine {
  positionLabel: string;
  completeLabels: string[];  // which completes share this position
  sumPlayPerUnit: number;    // combined (exceeds maxBet)
  cappedAmount: number;      // = maxBet
}

interface CompleteNumberPayoutQuizRecord {
  userAnswer: number;
  correctAnswer: number;
  correct: boolean;
  lines: CompleteNumberPayoutLine[];           // per-complete, unique (non-capped) positions
  cappedLines: CompleteNumberPayoutCappedLine[]; // positions capped by multi-complete intersection
}

interface SeriesFieldPayoutLineSummary {
  seriesLabel: string;
  amount: number;
  divisor: number;
  multiplicity: number;
  playPerUnit: number;
  winningPositions: Array<{ label: string; chips: number; positionAmount: number }>;
  seriesTotal: number;
}

interface SeriesFieldPayoutQuizRecord {
  userAnswer: number;
  correctAnswer: number;
  correct: boolean;
  lines: SeriesFieldPayoutLineSummary[];
}

interface NeighboursPayoutWinLine {
  label: string;
  totalAmount: number;
  amountPerNumber: number;
}

interface NeighboursPayoutQuizRecord {
  userAnswer: number;
  correctAnswer: number;
  correct: boolean;
  winningLines: NeighboursPayoutWinLine[];
  winningNeighboursAmount: number;
  seriesContrib: number;
  colorContrib: number;
  cashContrib: number;
  numberCompletesContrib: number;
  dozenCompleteContrib: number;
  existingAmount: number;
  effectiveExistingAmount: number;
  availableAmount: number;
  winningNumber: number;
}

// Single source of truth: how many numbers each bet type covers.
// Position limit = maxBet × BET_COVER_COUNT[type].
const BET_COVER_COUNT: Record<"straight" | "split" | "street" | "corner" | "sixline", number> = {
  straight: 1,
  split:    2,
  street:   3,
  corner:   4,
  sixline:  6,
};

// Maps a bet category from rouletteRules.json's dozenComplete.bets to the
// betPositions BetType and its position-limit multiplier (× maximum bet).
const DOZEN_COMPLETE_CATEGORY_MAP: Record<string, { betType: "straight" | "split" | "street" | "corner" | "sixline"; limitMultiplier: number; label: string }> = {
  straightUp: { betType: "straight", limitMultiplier: BET_COVER_COUNT.straight, label: "Straight Up" },
  splits:     { betType: "split",    limitMultiplier: BET_COVER_COUNT.split,    label: "Split" },
  streets:    { betType: "street",   limitMultiplier: BET_COVER_COUNT.street,   label: "Street" },
  corners:    { betType: "corner",   limitMultiplier: BET_COVER_COUNT.corner,   label: "Corner" },
  sixLines:   { betType: "sixline",  limitMultiplier: BET_COVER_COUNT.sixline,  label: "Six-Line" },
};

// Finds the positionId on the field matching a bet type + set of numbers
// (order-independent), using the same static position list the field uses.
function findPositionId(betType: "straight" | "split" | "street" | "corner" | "sixline", numbers: number[]): string | undefined {
  const target = [...numbers].sort((a, b) => a - b).join(",");
  const found = ALL_BET_POSITIONS.find(p =>
    p.type === betType && [...p.numbers].sort((a, b) => a - b).join(",") === target
  );
  return found?.id;
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

// Decides which quiz phase follows the track×field intersection question
// (and, when present, the complete×track intersection question): whichever
// winning series/neighbours payout question applies, or straight to the
// field-payout question if neither series nor neighbours won.
function decidePostTrackFieldPhase(
  game: GameState,
  activeSeries: TrackBet[],
  rules: Record<string, unknown>,
): QuizPhase {
  const seriesWonNow = activeSeries.length > 0 && activeSeries.some(tb => {
    const trackRule = (rules.trackBets as Record<string, { bets: Record<string, Array<{ numbers: number[]; chips: number }>> }>)[tb.type];
    if (!trackRule) return false;
    return Object.values(trackRule.bets).some(entries =>
      Array.isArray(entries) && entries.some(e => Array.isArray(e.numbers) && e.numbers.includes(game.drawnNumber))
    );
  });
  const neighboursMap = rules.neighbours as Record<string, number[]>;
  const neighboursWonNow = game.neighboursBets.length > 0 && game.neighboursBets.some(nb => {
    const nums = neighboursMap[String(nb.number)];
    return Array.isArray(nums) && nums.includes(game.drawnNumber);
  });
  return seriesWonNow ? { kind: "seriesFieldPayout" } : neighboursWonNow ? { kind: "neighboursPayout" } : { kind: "field" };
}

function generateColorPayout(
  totalPayout: number,
  colorNominal: number,
): { cashPayout: number; colorChips: number; colorAmount: number } | null {
  if (totalPayout <= 0 || colorNominal <= 0) return null;
  const maxPossibleColorChips = Math.floor(totalPayout / colorNominal);
  // colorAmount must be < totalPayout so cashPayout > 0
  // If totalPayout is exactly divisible by colorNominal, the max valid colorChips is one less
  const maxValidColorChips = totalPayout % colorNominal === 0
    ? maxPossibleColorChips - 1
    : maxPossibleColorChips;
  const maxColorChips = Math.min(200, maxValidColorChips);
  if (maxColorChips < 1) return null;
  const colorChips = Math.floor(Math.random() * maxColorChips) + 1;
  const colorAmount = colorChips * colorNominal;
  const cashPayout = totalPayout - colorAmount;
  if (cashPayout <= 0) return null;
  return { cashPayout, colorChips, colorAmount };
}

function computeWinningField(
  game: GameState,
  activeSeries: TrackBet[],
  maxBet: number,
  mult: number,
  chipValue: number,
  completeMultiplicity: number,
  rules: Record<string, unknown>,
  payoutMap: Record<string, number>,
): WinningFieldEntry[] {
  const drawnNumber = game.drawnNumber;
  // Track contributions by source type so we can decide display mode per position
  const colorAmts  = new Map<string, number>(); // color chips: count * chipValue
  const colorCnts  = new Map<string, number>(); // color chips: raw count (for display)
  const cashAmts   = new Map<string, number>(); // field cash chips
  const otherAmts  = new Map<string, number>(); // series + neighbours + completes

  const addColor = (id: string, count: number, amount: number) => {
    colorAmts.set(id, (colorAmts.get(id) ?? 0) + amount);
    colorCnts.set(id, (colorCnts.get(id) ?? 0) + count);
  };
  const addCash  = (id: string, amount: number) => cashAmts.set(id, (cashAmts.get(id) ?? 0) + amount);
  const addOther = (id: string, amount: number) => otherAmts.set(id, (otherAmts.get(id) ?? 0) + amount);

  // 1. Color chips (winning positions only)
  for (const stack of game.chips) {
    const pos = BET_POSITIONS_MAP.get(stack.positionId);
    if (!pos || !pos.numbers.includes(drawnNumber)) continue;
    addColor(stack.positionId, stack.count, stack.count * chipValue);
  }

  // 2. Cash chips (winning positions only)
  for (const cc of game.cashChipStacks) {
    const pos = BET_POSITIONS_MAP.get(cc.positionId);
    if (!pos || !pos.numbers.includes(drawnNumber)) continue;
    addCash(cc.positionId, cc.denomination);
  }

  // 3. Series – expand using trackBets bets
  type TrackRuleT = { divisor: number; bets: Record<string, Array<{ numbers: number[]; chips: number }>> };
  for (const tb of activeSeries) {
    const trackRule = (rules.trackBets as Record<string, TrackRuleT> | undefined)?.[tb.type];
    if (!trackRule) continue;
    const { playPerUnit } = calcSeriesResult(tb.amount, trackRule.divisor, mult);
    if (playPerUnit <= 0) continue;
    for (const [catKey, entries] of Object.entries(trackRule.bets)) {
      const catInfo = DOZEN_COMPLETE_CATEGORY_MAP[catKey];
      if (!catInfo || !Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (!Array.isArray(entry.numbers) || !entry.numbers.includes(drawnNumber)) continue;
        const positionId = findPositionId(catInfo.betType, entry.numbers);
        if (!positionId) continue;
        addOther(positionId, playPerUnit * entry.chips);
      }
    }
  }

  // 4. Neighbours → Straight Up on drawnNumber
  const neighboursMap = rules.neighbours as Record<string, number[]> | undefined;
  if (neighboursMap) {
    for (const nb of game.neighboursBets) {
      const nums = neighboursMap[String(nb.number)];
      if (!Array.isArray(nums) || !nums.includes(drawnNumber)) continue;
      addOther(`su-${drawnNumber}`, nb.baseAmount);
    }
  }

  // 5. Number completes – expand using completeBets bets
  type CompleteBetRuleT = { number: number; chipsRequired: number; bets: Record<string, Array<{ numbers: number[]; chips: number }>> };
  for (const ncb of game.numberCompleteBets) {
    const completeRule = (rules.completeBets as CompleteBetRuleT[] | undefined)?.find(cb => cb.number === ncb.number);
    if (!completeRule) continue;
    const { playPerUnit } = calcOneCompleteChange(ncb.amount, ncb.chipsRequired, maxBet, completeMultiplicity);
    for (const [catKey, entries] of Object.entries(completeRule.bets)) {
      const catInfo = DOZEN_COMPLETE_CATEGORY_MAP[catKey];
      if (!catInfo || !Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (!Array.isArray(entry.numbers) || !entry.numbers.includes(drawnNumber)) continue;
        const positionId = findPositionId(catInfo.betType, entry.numbers);
        if (!positionId) continue;
        addOther(positionId, playPerUnit * entry.chips);
      }
    }
  }

  // 6. Dozen complete – expand using dozenComplete.dozens bets
  type DozenBetRuleT = { dozen: number; chipsRequired: number; bets: Record<string, Array<{ numbers: number[]; chips: number }>> };
  if (game.dozenCompleteBet) {
    const { amount, dozen } = game.dozenCompleteBet;
    const dozenNum = dozen === "1ST_12" ? 1 : dozen === "2ND_12" ? 2 : 3;
    const dozenRule = (rules.dozenComplete as { dozens: DozenBetRuleT[] } | undefined)?.dozens.find(d => d.dozen === dozenNum);
    if (dozenRule) {
      const { playPerUnit } = calcOneCompleteChange(amount, dozenRule.chipsRequired, maxBet, completeMultiplicity);
      for (const [catKey, entries] of Object.entries(dozenRule.bets)) {
        const catInfo = DOZEN_COMPLETE_CATEGORY_MAP[catKey];
        if (!catInfo || !Array.isArray(entries)) continue;
        for (const entry of entries) {
          if (!Array.isArray(entry.numbers) || !entry.numbers.includes(drawnNumber)) continue;
          const positionId = findPositionId(catInfo.betType, entry.numbers);
          if (!positionId) continue;
          addOther(positionId, playPerUnit * entry.chips);
        }
      }
    }
  }

  // Collect all touched positions and build result entries
  const TYPE_LIMIT_MULT = BET_COVER_COUNT;
  const allIds = new Set([...colorAmts.keys(), ...cashAmts.keys(), ...otherAmts.keys()]);
  const result: WinningFieldEntry[] = [];

  for (const positionId of allIds) {
    const pos = BET_POSITIONS_MAP.get(positionId);
    if (!pos) continue;
    const colorAmt = colorAmts.get(positionId) ?? 0;
    const colorCnt = colorCnts.get(positionId) ?? 0;
    const cashAmt  = cashAmts.get(positionId) ?? 0;
    const otherAmt = otherAmts.get(positionId) ?? 0;
    const total    = colorAmt + cashAmt + otherAmt;
    const limitMult = TYPE_LIMIT_MULT[pos.type] ?? 1;
    const capped = Math.min(total, maxBet * limitMult);
    if (capped <= 0) continue;

    // Determine display mode
    let displayAs: WinningFieldEntry["displayAs"];
    if (colorAmt > 0 && cashAmt === 0 && otherAmt === 0) {
      displayAs = "color";   // solo color chip — keep as blue chip
    } else if (colorAmt === 0 && cashAmt > 0 && otherAmt === 0) {
      displayAs = "cash";    // solo cash chip — keep as bronze chip
    } else {
      displayAs = "merged";  // any mix → green merged chip
    }

    result.push({
      positionId,
      amount: capped,
      positionType: pos.type as WinningFieldEntry["positionType"],
      positionNums: [...pos.numbers].sort((a, b) => a - b),
      payoutMultiplier: payoutMap[pos.type] ?? 0,
      displayAs,
      colorCount: colorCnt,
    });
  }
  return result;
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
  onOpenDebug: () => void;
  showGrid: boolean;
  setShowGrid: React.Dispatch<React.SetStateAction<boolean>>;
  showTrack: boolean;
  setShowTrack: React.Dispatch<React.SetStateAction<boolean>>;
  showDozens: boolean;
  setShowDozens: React.Dispatch<React.SetStateAction<boolean>>;
  editMode: boolean;
  setEditMode: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function RouletteTable({
  settings, onOpenSettings, onOpenDebug,
  showGrid, setShowGrid,
  showTrack, setShowTrack,
  showDozens, setShowDozens,
  editMode, setEditMode,
}: RouletteTableProps) {
  const [editTab,   setEditTab]   = useState<"grid" | "track" | "dozens">("grid");
  const [copied,    setCopied]    = useState(false);
  const [game,      setGame]      = useState<GameState | null>(null);
  const [initialRoundSnapshot, setInitialRoundSnapshot] = useState<GameState | null>(null);

  // ── Quiz state ──────────────────────────────────────────────────────────────
  const [quizPhase,         setQuizPhase]         = useState<QuizPhase | null>(null);
  const [activeSeries,      setActiveSeries]      = useState<TrackBet[]>([]);
  const [seriesRecord,      setSeriesRecord]      = useState<SeriesQuizRecord | null>(null);
  const [fieldRecord,       setFieldRecord]       = useState<FieldQuizRecord | null>(null);
  const [seriesInput,       setSeriesInput]       = useState("");
  const [fieldInput,        setFieldInput]        = useState("");
  const [completesInput,    setCompletesInput]    = useState("");
  const [completesRecord,   setCompletesRecord]   = useState<CompleteQuizRecord | null>(null);
  const [intersectionInput,  setIntersectionInput]  = useState("");
  const [intersectionRecord, setIntersectionRecord] = useState<IntersectionQuizRecord | null>(null);
  const [trackIntersectionInput,  setTrackIntersectionInput]  = useState("");
  const [trackIntersectionRecord, setTrackIntersectionRecord] = useState<TrackIntersectionQuizRecord | null>(null);
  const [trackFieldIntersectionInput,  setTrackFieldIntersectionInput]  = useState("");
  const [trackFieldIntersectionRecord, setTrackFieldIntersectionRecord] = useState<TrackFieldIntersectionQuizRecord | null>(null);
  const [completeTrackIntersectionInput,  setCompleteTrackIntersectionInput]  = useState("");
  const [completeTrackIntersectionRecord, setCompleteTrackIntersectionRecord] = useState<CompleteTrackIntersectionQuizRecord | null>(null);
  const [completeNumberPayoutInput,  setCompleteNumberPayoutInput]  = useState("");
  const [completeNumberPayoutRecord, setCompleteNumberPayoutRecord] = useState<CompleteNumberPayoutQuizRecord | null>(null);
  const [seriesFieldPayoutInput,  setSeriesFieldPayoutInput]  = useState("");
  const [seriesFieldPayoutRecord, setSeriesFieldPayoutRecord] = useState<SeriesFieldPayoutQuizRecord | null>(null);
  const [neighboursPayoutInput,  setNeighboursPayoutInput]  = useState("");
  const [neighboursPayoutRecord, setNeighboursPayoutRecord] = useState<NeighboursPayoutQuizRecord | null>(null);
  const [colorPayoutData,   setColorPayoutData]   = useState<{ cashPayout: number; colorChips: number; colorAmount: number; totalPayout: number; colorNominal: number } | null>(null);
  const [colorPayoutInput,  setColorPayoutInput]  = useState("");
  const [colorPayoutRecord, setColorPayoutRecord] = useState<ColorPayoutQuizRecord | null>(null);
  // acceptedNeighboursAmounts: set after trackIntersection question; maps nb.number → accepted display amount
  const [acceptedNeighboursAmounts, setAcceptedNeighboursAmounts] = useState<Map<number, number> | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);

  const isSpinningRef    = useRef(false);
  const spinTimeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generateRoundRef = useRef<() => void>(() => {});
  const audioRef         = useRef<HTMLAudioElement | null>(null);

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

  // ── Display amounts after "без сдачи" reveal (showBetBeforeChange) ─────────
  // Completes: show acceptedAmount once completesIntersection question is answered
  const completesDisplayAmounts = useMemo(() => {
    if (!settings.showBetBeforeChange || !intersectionRecord || !completesRecord) return null;
    const map = new Map<string, number>();
    for (const l of completesRecord.lines) {
      if (l.change > 0) map.set(l.label, l.acceptedAmount);
    }
    return map;
  }, [settings.showBetBeforeChange, intersectionRecord, completesRecord]);

  // Series: show acceptedAmount once series question is answered
  const seriesDisplayAmounts = useMemo(() => {
    if (!settings.showBetBeforeChange || !seriesRecord) return null;
    const map = new Map<TrackBet["type"], number>();
    for (const l of seriesRecord.lines) {
      if (l.change > 0) map.set(l.type, l.acceptedAmount);
    }
    return map;
  }, [settings.showBetBeforeChange, seriesRecord]);

  const winningFieldChips = useMemo<WinningFieldEntry[] | null>(() => {
    if (!game || !quizPhase) return null;
    if (quizPhase.kind !== "field" && quizPhase.kind !== "colorPayout" && quizPhase.kind !== "report") return null;
    const maxBet = Math.max(1, settings.maxBet);
    const mult   = Math.max(10, Math.min(1000, settings.multiplicity ?? 10));
    const chipValue = settings.chipValue ?? 10;
    const completeMultiplicity = Math.max(1, settings.completeMultiplicity ?? 10);
    return computeWinningField(game, activeSeries, maxBet, mult, chipValue, completeMultiplicity, getAllRules(), payoutMap);
  }, [game, quizPhase, activeSeries, settings.maxBet, settings.multiplicity, settings.chipValue, settings.completeMultiplicity, getAllRules, payoutMap]);

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

  // ── Random series amount: X ∈ [maxBet/2 … maxBet], amount = round(X × divisor, 10) ──
  function randomSeriesAmount(maxBet: number, divisor: number): number {
    const safeMax = Math.max(1, maxBet);
    const lowerBound = safeMax / 2;
    const x = lowerBound + Math.random() * (safeMax - lowerBound);
    return Math.round((x * divisor) / 10) * 10;
  }

  // ── Zero Spiel amount: per-bet random in [maxBet/1.5 … maxBet] × 4, rounded to seriesMultiplicity ──
  const ZERO_SPIEL_CHIPS_COUNT = 4;
  function generateZeroSpielAmount(maxBet: number, seriesMultiplicity: number): number {
    if (!Number.isFinite(seriesMultiplicity) || seriesMultiplicity <= 0) return 0;
    const safeMax = Math.max(1, maxBet);
    const minAmountPerBet = Math.ceil(safeMax / 1.5);
    const maxAmountPerBet = Math.floor(safeMax);
    const clampedMax = Math.max(minAmountPerBet, maxAmountPerBet);
    const randomAmountPerBet = Math.floor(Math.random() * (clampedMax - minAmountPerBet + 1)) + minAmountPerBet;
    const rawAmount = randomAmountPerBet * ZERO_SPIEL_CHIPS_COUNT;
    const rounded = Math.floor(rawAmount / seriesMultiplicity) * seriesMultiplicity;
    return Math.max(seriesMultiplicity, rounded);
  }

  // ── Serie 0/2/3 amount: per-bet random in [maxBet/2 … maxBet] × 18, rounded to seriesMultiplicity ──
  const SERIE_ZERO_TWO_THREE_CHIPS_COUNT = 18;
  function generateSerieZeroTwoThreeAmount(maxBet: number, seriesMultiplicity: number): number {
    if (!Number.isFinite(seriesMultiplicity) || seriesMultiplicity <= 0) return 0;
    const safeMax = Math.max(1, maxBet);
    const minAmountPerBet = Math.ceil(safeMax / 2);
    const maxAmountPerBet = Math.floor(safeMax);
    const clampedMax = Math.max(minAmountPerBet, maxAmountPerBet);
    const randomAmountPerBet = Math.floor(Math.random() * (clampedMax - minAmountPerBet + 1)) + minAmountPerBet;
    const rawAmount = randomAmountPerBet * SERIE_ZERO_TWO_THREE_CHIPS_COUNT;
    const rounded = Math.floor(rawAmount / seriesMultiplicity) * seriesMultiplicity;
    return Math.max(seriesMultiplicity, rounded);
  }

  // ── Orphelins amount: per-bet random in [maxBet/1.5 … maxBet] × 5, rounded to seriesMultiplicity ──
  const ORPHELINS_CHIPS_COUNT = 5;
  function generateOrphelinsAmount(maxBet: number, seriesMultiplicity: number): number {
    if (!Number.isFinite(seriesMultiplicity) || seriesMultiplicity <= 0) return 0;
    const safeMax = Math.max(1, maxBet);
    const minAmountPerBet = Math.ceil(safeMax / 1.5);
    const maxAmountPerBet = Math.floor(safeMax);
    const clampedMax = Math.max(minAmountPerBet, maxAmountPerBet);
    const randomAmountPerBet = Math.floor(Math.random() * (clampedMax - minAmountPerBet + 1)) + minAmountPerBet;
    const rawAmount = randomAmountPerBet * ORPHELINS_CHIPS_COUNT;
    const rounded = Math.floor(rawAmount / seriesMultiplicity) * seriesMultiplicity;
    return Math.max(seriesMultiplicity, rounded);
  }

  // ── Serie 5/8 amount: per-bet random in [maxBet/2 … maxBet×0.9] × 12, rounded to seriesMultiplicity ──
  const SERIE_FIVE_EIGHT_CHIPS_COUNT = 12;
  function generateSerie58Amount(maxBet: number, seriesMultiplicity: number): number {
    if (!Number.isFinite(seriesMultiplicity) || seriesMultiplicity <= 0) return 0;
    const safeMax = Math.max(1, maxBet);
    const minAmountPerBet = Math.ceil(safeMax / 2);
    const maxAmountPerBet = Math.floor(safeMax * 0.9);
    const clampedMax = Math.max(minAmountPerBet, maxAmountPerBet);
    const randomAmountPerBet = Math.floor(Math.random() * (clampedMax - minAmountPerBet + 1)) + minAmountPerBet;
    const rawSeriesAmount = randomAmountPerBet * SERIE_FIVE_EIGHT_CHIPS_COUNT;
    const rounded = Math.floor(rawSeriesAmount / seriesMultiplicity) * seriesMultiplicity;
    return Math.max(seriesMultiplicity, rounded);
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

    const multiplicity = Math.max(1, settings.completeMultiplicity);
    for (const num of selectedNumbers) {
      const rule = getCompleteBetRule(num);
      if (!rule) continue;
      const pos = currentChipPosMap.get(`su-${num}`);
      if (!pos) continue;
      // Clamp minPlayUnit to maxBet so minAmount ≤ maxAmount even if multiplicity > maxBet
      const minPlayUnit = Math.min(Math.max(minBet, multiplicity), maxBet);
      const minAmount = minPlayUnit * rule.chipsRequired;
      const maxAmount = maxBet * rule.chipsRequired;
      const range = Math.max(0, maxAmount - minAmount);
      const rawAmount = minAmount + Math.floor(Math.random() * (range + 1));
      // Floor to nearest number ending in 5
      let amount = Math.floor((rawAmount - 5) / 10) * 10 + 5;
      // After rounding, clamp back into [minAmount, maxAmount]
      if (amount < minAmount) {
        amount = Math.ceil((minAmount - 5) / 10) * 10 + 5;
      }
      if (amount > maxAmount) {
        amount = maxAmount; // rare edge: no 5-ending value fits the range
      }
      // Round to nearest completeMultiplicity
      amount = Math.round(amount / multiplicity) * multiplicity;
      if (amount <= 0) amount = multiplicity;
      bets.push({ number: num, chipsRequired: rule.chipsRequired, amount, position: pos });
      excludedIds.add(`su-${num}`);
    }

    return { bets, excludedIds };
  }

  // ── Spin ────────────────────────────────────────────────────────────────────
  const generateRound = useCallback(() => {
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
        amount:   s.type === "SERIE_5_8"
          ? generateSerie58Amount(settings.maxBet, mult)
          : s.type === "ORPHELINS"
          ? generateOrphelinsAmount(settings.maxBet, mult)
          : s.type === "SERIE_0_2_3"
          ? generateSerieZeroTwoThreeAmount(settings.maxBet, mult)
          : s.type === "ZERO_SPIEL"
          ? generateZeroSpielAmount(settings.maxBet, mult)
          : randomSeriesAmount(settings.maxBet, seriesDivisors[s.type]),
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
      const multiplicity = Math.max(1, settings.completeMultiplicity);
      const dozenNum = idx + 1;
      const chipsRequired = getAllRules().dozenComplete?.dozens?.find(d => d.dozen === dozenNum)?.chipsRequired ?? 100;
      // Clamp minPlayUnit to maxBet so minAmount ≤ maxAmount even if multiplicity > maxBet
      const minPlayUnit = Math.min(Math.max(minBet, multiplicity), maxBet);
      const minAmount = minPlayUnit * chipsRequired;
      const maxAmount = maxBet * chipsRequired;
      const range = Math.max(0, maxAmount - minAmount);
      const rawAmount = minAmount + Math.floor(Math.random() * (range + 1));
      // Floor to nearest number ending in 5
      let dozenAmount = Math.floor((rawAmount - 5) / 10) * 10 + 5;
      // After rounding, clamp back into [minAmount, maxAmount]
      if (dozenAmount < minAmount) {
        dozenAmount = Math.ceil((minAmount - 5) / 10) * 10 + 5;
      }
      if (dozenAmount > maxAmount) {
        dozenAmount = maxAmount; // rare edge: no 5-ending value fits the range
      }
      // Round to nearest completeMultiplicity
      dozenAmount = Math.round(dozenAmount / multiplicity) * multiplicity;
      if (dozenAmount <= 0) dozenAmount = multiplicity;
      dozenCompleteBet = {
        type:      "DOZEN_COMPLETE",
        label:     "Комплит дюжины",
        dozen:     DOZEN_IDS[idx],
        baseValue: Math.round(dozenAmount / chipsRequired),
        amount:    dozenAmount,
        position:  { x: cx, y: cy },
        source:    "DOZEN_COMPLETE",
      };
    }

    // ── Number complete bets ────────────────────────────────────────────────────
    const currentChipPosMap = buildDynamicPositions(gridParams);
    const { bets: numberCompleteBets, excludedIds } = generateNumberCompletes(dozenCompleteBet, currentChipPosMap);

    // Draw number first so both color and cash generation can guarantee a winning position
    const drawnNumber = Math.floor(Math.random() * 37);

    // Generate color chips using the new number-center algorithm
    const colorNumbersCount = Math.max(0, Math.floor(settings.colorNumbersCount ?? 1));
    const colorChips = generateColorChips(
      drawnNumber,
      colorNumbersCount,
      chipCount,
      excludedIds.size > 0 ? excludedIds : new Set<string>(),
    );

    const base = spinGame(chipCount, chipValue, payoutMap, excludedIds.size > 0 ? excludedIds : undefined, drawnNumber, colorChips);

    const colorPositionIds = new Set(colorChips.map(c => c.positionId));
    const cashOnField = settings.cashOnField ?? 0;
    const cashChipValues = settings.cashChipValues?.length ? settings.cashChipValues : ["100"];
    const cashChipStacks = generateCashChips(drawnNumber, cashOnField, cashChipValues, colorPositionIds);

    // ── Neighbours bets ("Соседи номера") ───────────────────────────────────────
    // Reference only — full 5-number layout (getNeighboursRule) is not laid out
    // on the field at this stage, only a single cash chip per selected number.
    const neighboursRule = getNeighboursRule();
    const neighboursCountRaw = settings.neighborsCount ?? 0;
    const neighboursCount = Math.max(0, Math.min(37, Math.floor(neighboursCountRaw)));
    let neighboursBets: NeighboursBet[] = [];
    if (neighboursCount > 0) {
      const allNums = Array.from({ length: 37 }, (_, i) => i);
      let selectedNumbers: number[];
      if (neighboursCount === 1) {
        // Single bet — no intersection required
        selectedNumbers = [allNums[Math.floor(Math.random() * allNums.length)]];
      } else {
        // Pick first center randomly
        const center1 = allNums[Math.floor(Math.random() * allNums.length)];
        // Get the 5-number set for center1, exclude center1 itself → 4 candidates
        const center1Set = (neighboursRule as Record<string, number[]>)[String(center1)] ?? [];
        const candidates = center1Set.filter(n => n !== center1);
        // Pick center2 from candidates — guaranteed intersection with center1
        const center2 = candidates[Math.floor(Math.random() * candidates.length)];
        selectedNumbers = [center1, center2];
        // Remaining bets (if any): random from unused numbers
        if (neighboursCount > 2) {
          const used = new Set([center1, center2]);
          const remaining = allNums.filter(n => !used.has(n));
          for (let i = 0; i < remaining.length - 1; i++) {
            const j = i + Math.floor(Math.random() * (remaining.length - i));
            [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
          }
          selectedNumbers.push(...remaining.slice(0, neighboursCount - 2));
        }
      }
      const minBet = Math.max(1, settings.minBet);
      const maxBet = Math.max(minBet, settings.maxBet);
      const lowerBoundRaw = Math.round(maxBet / 3);
      const lowerBound = Math.min(Math.max(1, lowerBoundRaw), maxBet);
      const neighMult = Math.max(1, settings.neighboursMultiplicity ?? 10);
      neighboursBets = selectedNumbers.map(num => {
        const rawBase = lowerBound + Math.floor(Math.random() * (maxBet - lowerBound + 1));
        const baseAmount = Math.max(neighMult, Math.floor(rawBase / neighMult) * neighMult);
        const amount = baseAmount * 5;
        let pos = trackNumberPosMap.get(num) ?? { x: 0, y: 0 };
        if (num === 30) {
          // arcL cell 2 (index 2): raise another 10% of cellH from 0.0768 → 0.0768 - 0.10 = -0.0232
          const cellW = Math.abs(trackParams.arcLX2 - trackParams.arcLX1);
          const cellH = Math.abs(trackParams.arcLY[3] - trackParams.arcLY[2]);
          pos = {
            x: trackParams.arcLX2 - 0.2 * cellW,
            y: trackParams.arcLY[2] + (-0.0232) * cellH,
          };
        }
        if (num === 8) {
          // arcL cell 1 (index 1): raise another 25% of current offset (0.65 → 0.4875)
          const cellH = Math.abs(trackParams.arcLY[2] - trackParams.arcLY[1]);
          pos = {
            x: pos.x,
            y: trackParams.arcLY[1] + 0.4875 * cellH,
          };
        }
        if (num === 23) {
          // arcL cell 0 (index 0): raise 15% from previous (0.90 → 0.75)
          const cellH = Math.abs(trackParams.arcLY[1] - trackParams.arcLY[0]);
          pos = {
            x: pos.x,
            y: trackParams.arcLY[0] + 0.75 * cellH,
          };
        }
        if (num === 10) {
          // top row cell 0: lower 10% of cell height from zone center
          const cellH = Math.abs(trackParams.topY2 - trackParams.topY1);
          pos = {
            x: pos.x,
            y: pos.y + 0.10 * cellH,
          };
        }
        if (num === 3) {
          // Right-arc cell for 3 is the first one (index 0 of ARC_R_NUMBERS)
          const cellW = Math.abs(trackParams.arcRX2 - trackParams.arcRX1);
          const cellH = Math.abs(trackParams.arcRY[1] - trackParams.arcRY[0]);
          pos = {
            x: pos.x - 0.3 * cellW,
            y: pos.y + 0.2 * cellH,
          };
        }
        if (num === 26) {
          // Right-arc cell for 26 is the second one (index 1 of ARC_R_NUMBERS)
          const cellW = Math.abs(trackParams.arcRX2 - trackParams.arcRX1);
          pos = {
            x: pos.x + 0.1 * cellW,
            y: pos.y,
          };
        }
        if (num === 0) {
          // Right-arc cell for 0 is the third one (index 2 of ARC_R_NUMBERS)
          const cellW = Math.abs(trackParams.arcRX2 - trackParams.arcRX1);
          // Horizontal adjustment: move left 20% of cellW from current position (-0.2 → -0.4 total)
          const neighbourChipHorizontalAdjustments: Record<number, number> = { 0: -0.20 };
          const horizontalAdjustment = neighbourChipHorizontalAdjustments[num] ?? 0;
          const baseChipX = pos.x - 0.2 * cellW;
          pos = {
            x: baseChipX + cellW * horizontalAdjustment,
            y: pos.y,
          };
        }
        void neighboursRule; // reference-only lookup for future straight-up layout
        return { number: num, baseAmount, amount, position: pos, source: "NEIGHBOURS" as const };
      });
    }

    const newGameState: GameState = { ...base, trackBets, dozenCompleteBet, numberCompleteBets, cashChipStacks, neighboursBets };
    setGame(newGameState);
    setInitialRoundSnapshot({
      ...newGameState,
      chips: newGameState.chips.map(c => ({ ...c })),
      cashChipStacks: newGameState.cashChipStacks ? newGameState.cashChipStacks.map(c => ({ ...c })) : [],
      trackBets: newGameState.trackBets.map(t => ({ ...t, position: { ...t.position } })),
      numberCompleteBets: newGameState.numberCompleteBets.map(n => ({ ...n, position: { ...n.position } })),
      neighboursBets: newGameState.neighboursBets.map(n => ({ ...n, position: { ...n.position } })),
      dozenCompleteBet: newGameState.dozenCompleteBet
        ? { ...newGameState.dozenCompleteBet, position: { ...newGameState.dozenCompleteBet.position } }
        : undefined,
    });

    // Build quiz queue from active series in fixed order
    const ordered = SERIES_QUIZ_ORDER
      .map(t => trackBets.find(tb => tb.type === t))
      .filter((tb): tb is TrackBet => tb !== undefined);
    const hasCompletes = settings.completeField === "yes" || settings.completeDozen === "yes";
    const needsTrackInt = ordered.length > 0 || neighboursBets.length > 0;
    setActiveSeries(ordered);
    setSeriesRecord(null);
    setFieldRecord(null);
    setCompletesRecord(null);
    setIntersectionRecord(null);
    setTrackIntersectionRecord(null);
    setTrackFieldIntersectionRecord(null);
    setCompleteTrackIntersectionRecord(null);
    setCompleteNumberPayoutRecord(null);
    setSeriesFieldPayoutRecord(null);
    setNeighboursPayoutRecord(null);
    setAcceptedNeighboursAmounts(null);
    setColorPayoutData(null);
    setColorPayoutInput("");
    setColorPayoutRecord(null);
    setSeriesInput("");
    setFieldInput("");
    setCompletesInput("");
    setIntersectionInput("");
    setTrackIntersectionInput("");
    setTrackFieldIntersectionInput("");
    setCompleteTrackIntersectionInput("");
    setCompleteNumberPayoutInput("");
    setSeriesFieldPayoutInput("");
    setNeighboursPayoutInput("");
    setQuizPhase(
      hasCompletes ? { kind: "completes" } :
      ordered.length > 0 ? { kind: "series" } :
      needsTrackInt ? { kind: "trackIntersection" } :
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
    settings.neighborsCount,
    settings.completeMultiplicity,
    settings.colorNumbersCount,
    getAllRules,
    getNeighboursRule,
    getCompleteBetRule,
  ]);

  // Keep ref always pointing to latest generateRound
  useEffect(() => { generateRoundRef.current = generateRound; }, [generateRound]);

  // Preload spin audio on mount so it's ready on first click
  useEffect(() => {
    const audio = new Audio(spinSoundUrl);
    audio.preload = "auto";
    audio.loop = false;
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current);
    };
  }, []);

  const handleSpin = useCallback(() => {
    if (isSpinningRef.current) return;
    isSpinningRef.current = true;

    // Immediately exit report/quiz layout so the full-size field shows at once
    setQuizPhase(null);
    setGame(null);
    setIsSpinning(true);

    // Play spin sound — pause first to reset any in-progress playback, then rewind and play
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      void audio.play().catch(err => console.warn("Spin audio play failed:", err));
    }

    // After 2 seconds: generate the round and unblock spin
    spinTimeoutRef.current = setTimeout(() => {
      isSpinningRef.current = false;
      setIsSpinning(false);
      generateRoundRef.current();
    }, 2000);
  }, []);

  const handleCheckSeries = useCallback(() => {
    if (!game || !quizPhase || quizPhase.kind !== "series") return;
    const userAnswer = parseInt(seriesInput || "0", 10) || 0;
    const mult = Math.max(10, Math.min(1000, settings.multiplicity ?? 10));
    const lines: SeriesLineSummary[] = activeSeries.map(tb => {
      const divisor = seriesDivisors[tb.type];
      const { playPerUnit, change, rawPerUnit } = calcSeriesResult(tb.amount, divisor, mult);
      return {
        type: tb.type,
        label: tb.label,
        amount: tb.amount,
        divisor,
        multiplicity: mult,
        rawPerUnit,
        playPerUnit,
        acceptedAmount: playPerUnit * divisor,
        change,
      };
    });
    const correctAnswer = lines.reduce((s, l) => s + l.change, 0);
    setSeriesRecord({ userAnswer, correctAnswer, correct: userAnswer === correctAnswer, lines });
    setSeriesInput("");
    // Show track intersection question after series (activeSeries.length > 0 here, so condition is met)
    setQuizPhase({ kind: "trackIntersection" });
  }, [game, quizPhase, activeSeries, seriesInput, settings.multiplicity, seriesDivisors]);

  const handleCheckField = useCallback(() => {
    if (!game || !quizPhase || quizPhase.kind !== "field") return;
    const userAnswer = parseInt(fieldInput || "0", 10) || 0;
    const maxBet = Math.max(1, settings.maxBet);
    const mult   = Math.max(10, Math.min(1000, settings.multiplicity ?? 10));
    const chipValue = settings.chipValue ?? 10;
    const completeMultiplicity = Math.max(1, settings.completeMultiplicity ?? 10);
    const entries = computeWinningField(game, activeSeries, maxBet, mult, chipValue, completeMultiplicity, getAllRules(), payoutMap);
    const correctAnswer = entries.reduce((sum, e) => sum + e.amount * e.payoutMultiplier, 0);
    setFieldRecord({ userAnswer, correctAnswer, correct: userAnswer === correctAnswer, entries });
    const generated = generateColorPayout(correctAnswer, chipValue);
    if (generated) {
      setColorPayoutData({ ...generated, totalPayout: correctAnswer, colorNominal: chipValue });
      setColorPayoutInput("");
      setQuizPhase({ kind: "colorPayout" });
    } else {
      setColorPayoutData(null);
      setQuizPhase({ kind: "report" });
    }
  }, [game, quizPhase, fieldInput, activeSeries, settings.maxBet, settings.multiplicity, settings.chipValue, settings.completeMultiplicity, getAllRules, payoutMap]);

  const handleCheckColorPayout = useCallback(() => {
    if (!colorPayoutData || !quizPhase || quizPhase.kind !== "colorPayout") return;
    const userAnswer = parseInt(colorPayoutInput || "0", 10) || 0;
    setColorPayoutRecord({
      userAnswer,
      correctAnswer: colorPayoutData.colorChips,
      correct: userAnswer === colorPayoutData.colorChips,
      cashPayout: colorPayoutData.cashPayout,
      totalPayout: colorPayoutData.totalPayout,
      colorAmount: colorPayoutData.colorAmount,
      colorNominal: colorPayoutData.colorNominal,
    });
    setColorPayoutInput("");
    setQuizPhase({ kind: "report" });
  }, [colorPayoutData, quizPhase, colorPayoutInput]);

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
      lines.push({ label: "Комплит дюжины", amount, chipsRequired, rawPlay, playPerUnit, acceptedAmount, change, maxBet, multiplicity });
    }
    for (const ncb of game.numberCompleteBets) {
      const { rawPlay, playPerUnit, acceptedAmount, change } = calcOneCompleteChange(ncb.amount, ncb.chipsRequired, maxBet, multiplicity);
      lines.push({ label: `Комплит №${ncb.number}`, amount: ncb.amount, chipsRequired: ncb.chipsRequired, rawPlay, playPerUnit, acceptedAmount, change, maxBet, multiplicity });
    }

    const correctAnswer = lines.reduce((s, l) => s + l.change, 0);
    setCompletesRecord({ userAnswer, correctAnswer, correct: userAnswer === correctAnswer, lines });
    setCompletesInput("");
    setQuizPhase({ kind: "completesIntersection" });
  }, [game, quizPhase, completesInput, settings.maxBet, settings.completeMultiplicity, getAllRules]);

  const handleCheckCompletesIntersection = useCallback(() => {
    if (!game || !quizPhase || quizPhase.kind !== "completesIntersection") return;
    const userAnswer = parseInt(intersectionInput || "0", 10) || 0;
    const maxBet = Math.max(1, settings.maxBet);
    const multiplicity = Math.max(1, settings.completeMultiplicity);
    const chipValue = settings.chipValue ?? 10;
    const rules = getAllRules();

    // Field lookup maps
    const chipCountByPos = new Map<string, number>();
    for (const c of game.chips) chipCountByPos.set(c.positionId, (chipCountByPos.get(c.positionId) ?? 0) + c.count);
    const cashByPos = new Map<string, number>();
    for (const cc of game.cashChipStacks) cashByPos.set(cc.positionId, (cashByPos.get(cc.positionId) ?? 0) + cc.denomination);

    // Per-position accumulator
    type PosAccum = {
      limitMultiplier: number;
      betLabel: string;
      dozenAmount: number;
      numberAmounts: Map<number, number>; // roulette number → amount
    };
    const posMap = new Map<string, PosAccum>();

    const ensurePos = (
      positionId: string,
      limitMultiplier: number,
      betLabel: string,
    ): PosAccum => {
      let entry = posMap.get(positionId);
      if (!entry) {
        entry = { limitMultiplier, betLabel, dozenAmount: 0, numberAmounts: new Map() };
        posMap.set(positionId, entry);
      }
      return entry;
    };

    // --- Dozen complete ---
    if (game.dozenCompleteBet) {
      const { amount, dozen } = game.dozenCompleteBet;
      const dozenNum = dozen === "1ST_12" ? 1 : dozen === "2ND_12" ? 2 : 3;
      const dozenRule = rules.dozenComplete.dozens.find(d => d.dozen === dozenNum);
      if (dozenRule) {
        const { playPerUnit } = calcOneCompleteChange(amount, dozenRule.chipsRequired, maxBet, multiplicity);
        for (const [categoryKey, { betType, limitMultiplier, label }] of Object.entries(DOZEN_COMPLETE_CATEGORY_MAP)) {
          const rawEntries = (dozenRule.bets as Record<string, unknown>)[categoryKey];
          if (!Array.isArray(rawEntries)) continue;
          for (const entry of rawEntries) {
            if (!entry || !Array.isArray(entry.numbers) || typeof entry.chips !== "number") continue;
            const positionId = findPositionId(betType, entry.numbers as number[]);
            if (!positionId) continue;
            const sortedNums = [...entry.numbers].sort((a, b) => a - b).join("-");
            const betLabel = `${label} ${sortedNums}`;
            const acc = ensurePos(positionId, limitMultiplier, betLabel);
            acc.dozenAmount += playPerUnit * entry.chips;
          }
        }
      }
    }

    // --- Number completes ---
    for (const ncb of game.numberCompleteBets) {
      const completeRule = rules.completeBets.find(cb => cb.number === ncb.number);
      if (!completeRule) continue;
      const { playPerUnit } = calcOneCompleteChange(ncb.amount, ncb.chipsRequired, maxBet, multiplicity);
      for (const [categoryKey, { betType, limitMultiplier, label }] of Object.entries(DOZEN_COMPLETE_CATEGORY_MAP)) {
        const rawEntries = (completeRule.bets as Record<string, unknown>)[categoryKey];
        if (!Array.isArray(rawEntries)) continue;
        for (const entry of rawEntries) {
          if (!entry || !Array.isArray(entry.numbers) || typeof entry.chips !== "number") continue;
          const positionId = findPositionId(betType, entry.numbers as number[]);
          if (!positionId) continue;
          const sortedNums = [...entry.numbers].sort((a, b) => a - b).join("-");
          const betLabel = `${label} ${sortedNums}`;
          const acc = ensurePos(positionId, limitMultiplier, betLabel);
          const prev = acc.numberAmounts.get(ncb.number) ?? 0;
          acc.numberAmounts.set(ncb.number, prev + playPerUnit * entry.chips);
        }
      }
    }

    // --- Collect lines with limit overflows ---
    const lines: IntersectionLineSummary[] = [];
    for (const [positionId, acc] of posMap.entries()) {
      const colorAmount = (chipCountByPos.get(positionId) ?? 0) * chipValue;
      const cashAmount = cashByPos.get(positionId) ?? 0;
      const numberCompleteTotal = Array.from(acc.numberAmounts.values()).reduce((s, v) => s + v, 0);
      const totalAmount = acc.dozenAmount + numberCompleteTotal + colorAmount + cashAmount;
      const positionLimit = maxBet * acc.limitMultiplier;
      if (totalAmount > positionLimit) {
        lines.push({
          label: acc.betLabel,
          positionLimit,
          dozenCompleteAmount: acc.dozenAmount,
          numberCompleteAmounts: Array.from(acc.numberAmounts.entries())
            .map(([num, amount]) => ({ number: num, amount }))
            .sort((a, b) => a.number - b.number),
          colorAmount,
          cashAmount,
          totalAmount,
          change: totalAmount - positionLimit,
        });
      }
    }

    const correctAnswer = lines.reduce((s, l) => s + l.change, 0);
    setIntersectionRecord({ userAnswer, correctAnswer, correct: userAnswer === correctAnswer, lines });
    setIntersectionInput("");
    setQuizPhase(
      activeSeries.length > 0 ? { kind: "series" } :
      game.neighboursBets.length > 0 ? { kind: "trackIntersection" } :
      { kind: "field" }
    );
  }, [game, quizPhase, intersectionInput, activeSeries, settings.maxBet, settings.completeMultiplicity, settings.chipValue, getAllRules]);

  // ── Track Intersection (серии + соседи на треке) ────────────────────────────
  const handleCheckTrackIntersection = useCallback(() => {
    if (!game || !quizPhase || quizPhase.kind !== "trackIntersection") return;
    const userAnswer = parseInt(trackIntersectionInput || "0", 10) || 0;
    const maxBet = Math.max(1, settings.maxBet);
    const mult = Math.max(10, Math.min(1000, settings.multiplicity ?? 10));
    const rules = getAllRules();

    // positionId → { betLabel, limitMultiplier, contributions: source → amount }
    type PosEntry = { betLabel: string; limitMultiplier: number; contributions: Map<string, number> };
    const posMap = new Map<string, PosEntry>();

    const addContrib = (
      positionId: string, limitMultiplier: number, betLabel: string, source: string, amount: number,
    ) => {
      let entry = posMap.get(positionId);
      if (!entry) {
        entry = { betLabel, limitMultiplier, contributions: new Map() };
        posMap.set(positionId, entry);
      }
      entry.contributions.set(source, (entry.contributions.get(source) ?? 0) + amount);
    };

    // --- Neighbours: expand each bet into 5 straight-up positions ---
    const neighboursMap = rules.neighbours as Record<string, number[]>;
    for (const nb of game.neighboursBets) {
      const nums = neighboursMap[String(nb.number)];
      if (!Array.isArray(nums)) continue;
      const sourceLabel = `Соседи ${nb.number}`;
      for (const n of nums) {
        addContrib(`su-${n}`, 1, `Straight Up ${n}`, sourceLabel, nb.baseAmount);
      }
    }

    // --- Series: expand each active bet using trackBets[type].bets ---
    for (const tb of activeSeries) {
      const trackRule = (rules.trackBets as Record<string, { divisor: number; bets: Record<string, Array<{ numbers: number[]; chips: number }>> }>)[tb.type];
      if (!trackRule) continue;
      const { playPerUnit } = calcSeriesResult(tb.amount, trackRule.divisor, mult);
      if (playPerUnit <= 0) continue;
      for (const [catKey, entries] of Object.entries(trackRule.bets)) {
        const catInfo = DOZEN_COMPLETE_CATEGORY_MAP[catKey];
        if (!catInfo || !Array.isArray(entries)) continue;
        const limitMult = catInfo.limitMultiplier;
        for (const entry of entries) {
          if (!Array.isArray(entry.numbers) || typeof entry.chips !== "number") continue;
          const positionId = findPositionId(catInfo.betType, entry.numbers);
          if (!positionId) continue;
          const sortedNums = [...entry.numbers].sort((a, b) => a - b).join("-");
          const betLabel = `${catInfo.label} ${sortedNums}`;
          addContrib(positionId, limitMult, betLabel, tb.label, playPerUnit * entry.chips);
        }
      }
    }

    // --- Collect positions with limit overflow ---
    const lines: TrackIntersectionLineSummary[] = [];
    for (const acc of posMap.values()) {
      const totalAmount = Array.from(acc.contributions.values()).reduce((s, v) => s + v, 0);
      const positionLimit = maxBet * acc.limitMultiplier;
      if (totalAmount > positionLimit) {
        lines.push({
          label: acc.betLabel,
          positionLimit,
          contributions: Array.from(acc.contributions.entries()).map(([source, amount]) => ({ source, amount })),
          totalAmount,
          change: totalAmount - positionLimit,
        });
      }
    }

    const correctAnswer = lines.reduce((s, l) => s + l.change, 0);
    setTrackIntersectionRecord({ userAnswer, correctAnswer, correct: userAnswer === correctAnswer, lines });

    // --- Compute per-neighbour accepted amounts for showBetBeforeChange display ---
    const nbAcceptedMap = new Map<number, number>();
    for (const nb of game.neighboursBets) {
      const nums = neighboursMap[String(nb.number)];
      if (!Array.isArray(nums)) { nbAcceptedMap.set(nb.number, nb.amount); continue; }
      let acceptedTotal = 0;
      for (const n of nums) {
        const posEntry = posMap.get(`su-${n}`);
        if (!posEntry) { acceptedTotal += nb.baseAmount; continue; }
        const posTotal = Array.from(posEntry.contributions.values()).reduce((s, v) => s + v, 0);
        const posLimit = maxBet * posEntry.limitMultiplier;
        const nbContrib = posEntry.contributions.get(`Соседи ${nb.number}`) ?? 0;
        if (posTotal > posLimit && nbContrib > 0) {
          acceptedTotal += nbContrib * (posLimit / posTotal);
        } else {
          acceptedTotal += nb.baseAmount;
        }
      }
      nbAcceptedMap.set(nb.number, Math.round(acceptedTotal));
    }
    setAcceptedNeighboursAmounts(nbAcceptedMap);

    setTrackIntersectionInput("");
    setQuizPhase({ kind: "trackFieldIntersection" });
  }, [game, quizPhase, trackIntersectionInput, activeSeries, settings.maxBet, settings.multiplicity, getAllRules]);

  // ── Track + Field Intersection (трек × поле, без комплитов) ─────────────────
  const handleCheckTrackFieldIntersection = useCallback(() => {
    if (!game || !quizPhase || quizPhase.kind !== "trackFieldIntersection") return;
    const userAnswer = parseInt(trackFieldIntersectionInput || "0", 10) || 0;
    const maxBet = Math.max(1, settings.maxBet);
    const mult = Math.max(10, Math.min(1000, settings.multiplicity ?? 10));
    const chipValue = settings.chipValue ?? 10;
    const rules = getAllRules();

    // --- Build track contribution map ---
    type PosEntry = { betLabel: string; limitMultiplier: number; trackTotal: number };
    const posMap = new Map<string, PosEntry>();
    const addTrack = (positionId: string, limitMultiplier: number, betLabel: string, amount: number) => {
      let entry = posMap.get(positionId);
      if (!entry) {
        entry = { betLabel, limitMultiplier, trackTotal: 0 };
        posMap.set(positionId, entry);
      }
      entry.trackTotal += amount;
    };

    // Neighbours → straight-up positions
    const neighboursMap = rules.neighbours as Record<string, number[]>;
    for (const nb of game.neighboursBets) {
      const nums = neighboursMap[String(nb.number)];
      if (!Array.isArray(nums)) continue;
      for (const n of nums) {
        addTrack(`su-${n}`, 1, `Straight Up ${n}`, nb.baseAmount);
      }
    }

    // Series → positions from trackBets[type].bets
    for (const tb of activeSeries) {
      const trackRule = (rules.trackBets as Record<string, { divisor: number; bets: Record<string, Array<{ numbers: number[]; chips: number }>> }>)[tb.type];
      if (!trackRule) continue;
      const { playPerUnit } = calcSeriesResult(tb.amount, trackRule.divisor, mult);
      if (playPerUnit <= 0) continue;
      for (const [catKey, entries] of Object.entries(trackRule.bets)) {
        const catInfo = DOZEN_COMPLETE_CATEGORY_MAP[catKey];
        if (!catInfo || !Array.isArray(entries)) continue;
        for (const entry of entries) {
          if (!Array.isArray(entry.numbers) || typeof entry.chips !== "number") continue;
          const positionId = findPositionId(catInfo.betType, entry.numbers);
          if (!positionId) continue;
          const sortedNums = [...entry.numbers].sort((a, b) => a - b).join("-");
          addTrack(positionId, catInfo.limitMultiplier, `${catInfo.label} ${sortedNums}`, playPerUnit * entry.chips);
        }
      }
    }

    // --- Field bets lookup ---
    const chipCountByPos = new Map<string, number>();
    for (const c of game.chips) chipCountByPos.set(c.positionId, (chipCountByPos.get(c.positionId) ?? 0) + c.count);
    const cashByPos = new Map<string, number>();
    for (const cc of game.cashChipStacks) cashByPos.set(cc.positionId, (cashByPos.get(cc.positionId) ?? 0) + cc.denomination);

    // --- Check each track position for overflow with field bets ---
    const lines: TrackFieldIntersectionLineSummary[] = [];
    for (const [positionId, entry] of posMap.entries()) {
      const positionLimit = maxBet * entry.limitMultiplier;
      const effectiveTrackAmount = Math.min(entry.trackTotal, positionLimit);
      const colorAmount = (chipCountByPos.get(positionId) ?? 0) * chipValue;
      const cashAmount = cashByPos.get(positionId) ?? 0;
      const fieldAmount = colorAmount + cashAmount;
      if (fieldAmount === 0) continue;
      const totalAmount = effectiveTrackAmount + fieldAmount;
      if (totalAmount > positionLimit) {
        lines.push({
          label: entry.betLabel,
          positionLimit,
          effectiveTrackAmount,
          colorAmount,
          cashAmount,
          totalAmount,
          change: totalAmount - positionLimit,
        });
      }
    }

    const correctAnswer = lines.reduce((s, l) => s + l.change, 0);
    setTrackFieldIntersectionRecord({ userAnswer, correctAnswer, correct: userAnswer === correctAnswer, lines });
    setTrackFieldIntersectionInput("");
    // Complete × track intersection question comes next when the round has at
    // least one complete bet; otherwise skip straight to the payout phase.
    const hasCompletesNow = !!game.dozenCompleteBet || game.numberCompleteBets.length > 0;
    if (hasCompletesNow) {
      setQuizPhase({ kind: "completeTrackIntersection" });
    } else {
      setQuizPhase(decidePostTrackFieldPhase(game, activeSeries, rules));
    }
  }, [game, quizPhase, trackFieldIntersectionInput, activeSeries, settings.maxBet, settings.multiplicity, settings.chipValue, getAllRules]);

  // ── Complete × Track Intersection (комплиты × ставки трека) ─────────────────
  const handleCheckCompleteTrackIntersection = useCallback(() => {
    if (!game || !quizPhase || quizPhase.kind !== "completeTrackIntersection") return;
    const userAnswer = parseInt(completeTrackIntersectionInput || "0", 10) || 0;
    const maxBet = Math.max(1, settings.maxBet);
    const mult = Math.max(10, Math.min(1000, settings.multiplicity ?? 10));
    const completeMultiplicity = Math.max(1, settings.completeMultiplicity);
    const rules = getAllRules();

    // --- Build complete contribution map (dozen complete + number completes) ---
    type CompletePos = { betLabel: string; limitMultiplier: number; completeAmount: number };
    const completeMap = new Map<string, CompletePos>();
    const addComplete = (positionId: string, limitMultiplier: number, betLabel: string, amount: number) => {
      let entry = completeMap.get(positionId);
      if (!entry) {
        entry = { betLabel, limitMultiplier, completeAmount: 0 };
        completeMap.set(positionId, entry);
      }
      entry.completeAmount += amount;
    };

    if (game.dozenCompleteBet) {
      const { amount, dozen } = game.dozenCompleteBet;
      const dozenNum = dozen === "1ST_12" ? 1 : dozen === "2ND_12" ? 2 : 3;
      const dozenRule = rules.dozenComplete.dozens.find(d => d.dozen === dozenNum);
      if (dozenRule) {
        const { playPerUnit } = calcOneCompleteChange(amount, dozenRule.chipsRequired, maxBet, completeMultiplicity);
        for (const [categoryKey, { betType, limitMultiplier, label }] of Object.entries(DOZEN_COMPLETE_CATEGORY_MAP)) {
          const rawEntries = (dozenRule.bets as Record<string, unknown>)[categoryKey];
          if (!Array.isArray(rawEntries)) continue;
          for (const entry of rawEntries) {
            if (!entry || !Array.isArray(entry.numbers) || typeof entry.chips !== "number") continue;
            const positionId = findPositionId(betType, entry.numbers as number[]);
            if (!positionId) continue;
            const sortedNums = [...entry.numbers].sort((a, b) => a - b).join("-");
            addComplete(positionId, limitMultiplier, `${label} ${sortedNums}`, playPerUnit * entry.chips);
          }
        }
      }
    }

    for (const ncb of game.numberCompleteBets) {
      const completeRule = rules.completeBets.find(cb => cb.number === ncb.number);
      if (!completeRule) continue;
      const { playPerUnit } = calcOneCompleteChange(ncb.amount, ncb.chipsRequired, maxBet, completeMultiplicity);
      for (const [categoryKey, { betType, limitMultiplier, label }] of Object.entries(DOZEN_COMPLETE_CATEGORY_MAP)) {
        const rawEntries = (completeRule.bets as Record<string, unknown>)[categoryKey];
        if (!Array.isArray(rawEntries)) continue;
        for (const entry of rawEntries) {
          if (!entry || !Array.isArray(entry.numbers) || typeof entry.chips !== "number") continue;
          const positionId = findPositionId(betType, entry.numbers as number[]);
          if (!positionId) continue;
          const sortedNums = [...entry.numbers].sort((a, b) => a - b).join("-");
          addComplete(positionId, limitMultiplier, `${label} ${sortedNums}`, playPerUnit * entry.chips);
        }
      }
    }

    // --- Build track contribution map (series + neighbours) ---
    type TrackPos = { betLabel: string; limitMultiplier: number; trackTotal: number };
    const trackMap = new Map<string, TrackPos>();
    const addTrack = (positionId: string, limitMultiplier: number, betLabel: string, amount: number) => {
      let entry = trackMap.get(positionId);
      if (!entry) {
        entry = { betLabel, limitMultiplier, trackTotal: 0 };
        trackMap.set(positionId, entry);
      }
      entry.trackTotal += amount;
    };

    const neighboursMap = rules.neighbours as Record<string, number[]>;
    for (const nb of game.neighboursBets) {
      const nums = neighboursMap[String(nb.number)];
      if (!Array.isArray(nums)) continue;
      for (const n of nums) {
        addTrack(`su-${n}`, 1, `Straight Up ${n}`, nb.baseAmount);
      }
    }

    for (const tb of activeSeries) {
      const trackRule = (rules.trackBets as Record<string, { divisor: number; bets: Record<string, Array<{ numbers: number[]; chips: number }>> }>)[tb.type];
      if (!trackRule) continue;
      const { playPerUnit } = calcSeriesResult(tb.amount, trackRule.divisor, mult);
      if (playPerUnit <= 0) continue;
      for (const [catKey, entries] of Object.entries(trackRule.bets)) {
        const catInfo = DOZEN_COMPLETE_CATEGORY_MAP[catKey];
        if (!catInfo || !Array.isArray(entries)) continue;
        for (const entry of entries) {
          if (!Array.isArray(entry.numbers) || typeof entry.chips !== "number") continue;
          const positionId = findPositionId(catInfo.betType, entry.numbers);
          if (!positionId) continue;
          const sortedNums = [...entry.numbers].sort((a, b) => a - b).join("-");
          addTrack(positionId, catInfo.limitMultiplier, `${catInfo.label} ${sortedNums}`, playPerUnit * entry.chips);
        }
      }
    }

    // --- Positions where both a complete bet and a track bet landed ---
    const lines: CompleteTrackIntersectionLineSummary[] = [];
    for (const [positionId, completeEntry] of completeMap.entries()) {
      const trackEntry = trackMap.get(positionId);
      if (!trackEntry || trackEntry.trackTotal <= 0 || completeEntry.completeAmount <= 0) continue;
      const positionLimit = maxBet * completeEntry.limitMultiplier;
      const effectiveTrackAmount = Math.min(trackEntry.trackTotal, positionLimit);
      const totalAmount = completeEntry.completeAmount + effectiveTrackAmount;
      if (totalAmount > positionLimit) {
        lines.push({
          label: completeEntry.betLabel,
          positionLimit,
          completeAmount: completeEntry.completeAmount,
          effectiveTrackAmount,
          totalAmount,
          change: totalAmount - positionLimit,
        });
      }
    }

    const correctAnswer = lines.reduce((s, l) => s + l.change, 0);
    setCompleteTrackIntersectionRecord({ userAnswer, correctAnswer, correct: userAnswer === correctAnswer, lines });
    setCompleteTrackIntersectionInput("");
    // Only ask completeNumberPayout if at least one complete position contains the winning number
    const anyCompleteWon = (() => {
      if (game.dozenCompleteBet) {
        const dozenNum = game.dozenCompleteBet.dozen === "1ST_12" ? 1 : game.dozenCompleteBet.dozen === "2ND_12" ? 2 : 3;
        const dozenRule = (rules.dozenComplete as { dozens: Array<{ dozen: number; bets: Record<string, Array<{ numbers: number[]; chips: number }>> }> })?.dozens?.find(d => d.dozen === dozenNum);
        if (dozenRule) {
          for (const entries of Object.values(dozenRule.bets)) {
            if (Array.isArray(entries) && entries.some(e => Array.isArray(e.numbers) && e.numbers.includes(game.drawnNumber))) return true;
          }
        }
      }
      for (const ncb of game.numberCompleteBets) {
        const completeRule = (rules.completeBets as Array<{ number: number; bets: Record<string, Array<{ numbers: number[]; chips: number }>> }>)?.find(cb => cb.number === ncb.number);
        if (!completeRule) continue;
        for (const entries of Object.values(completeRule.bets)) {
          if (Array.isArray(entries) && entries.some(e => Array.isArray(e.numbers) && e.numbers.includes(game.drawnNumber))) return true;
        }
      }
      return false;
    })();
    setQuizPhase(anyCompleteWon ? { kind: "completeNumberPayout" } : decidePostTrackFieldPhase(game, activeSeries, rules));
  }, [game, quizPhase, completeTrackIntersectionInput, activeSeries, settings.maxBet, settings.multiplicity, settings.completeMultiplicity, getAllRules]);

  // ── Complete Number Payout (касания комплитов → сумма в выпавший номер) ──────
  const handleCheckCompleteNumberPayout = useCallback(() => {
    if (!game || !quizPhase || quizPhase.kind !== "completeNumberPayout") return;
    const userAnswer = parseInt(completeNumberPayoutInput || "0", 10) || 0;
    const maxBet = Math.max(1, settings.maxBet);
    const completeMultiplicity = Math.max(1, settings.completeMultiplicity);
    const rules = getAllRules();

    // positionId → { positionLabel, contributions: Map<completeLabel, playPerUnit> }
    type PosEntry = { positionLabel: string; contributions: Map<string, number> };
    const posMap = new Map<string, PosEntry>();

    // Per-complete info for building display lines
    type CompleteInfo = { label: string; playPerUnit: number; positions: string[] };
    const completesInfo: CompleteInfo[] = [];

    const processComplete = (
      label: string,
      amount: number,
      chipsRequired: number,
      betsRule: Record<string, Array<{ numbers: number[]; chips: number }>>,
    ) => {
      const { playPerUnit } = calcOneCompleteChange(amount, chipsRequired, maxBet, completeMultiplicity);
      const winningPositionIds: string[] = [];
      for (const [categoryKey, { betType, label: catLabel }] of Object.entries(DOZEN_COMPLETE_CATEGORY_MAP)) {
        const entries = betsRule[categoryKey];
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
          if (!Array.isArray(entry.numbers) || !entry.numbers.includes(game.drawnNumber)) continue;
          const positionId = findPositionId(betType, entry.numbers as number[]);
          if (!positionId) continue;
          const sortedNums = [...entry.numbers].sort((a, b) => a - b).join("-");
          const posLabel = `${catLabel} ${sortedNums}`;
          let posEntry = posMap.get(positionId);
          if (!posEntry) {
            posEntry = { positionLabel: posLabel, contributions: new Map() };
            posMap.set(positionId, posEntry);
          }
          // Each complete contributes playPerUnit once per winning position (not ×chips)
          posEntry.contributions.set(label, (posEntry.contributions.get(label) ?? 0) + playPerUnit);
          winningPositionIds.push(positionId);
        }
      }
      completesInfo.push({ label, playPerUnit, positions: winningPositionIds });
    };

    if (game.dozenCompleteBet) {
      const { amount, dozen } = game.dozenCompleteBet;
      const dozenNum = dozen === "1ST_12" ? 1 : dozen === "2ND_12" ? 2 : 3;
      const dozenRule = rules.dozenComplete.dozens.find(d => d.dozen === dozenNum);
      if (dozenRule) {
        processComplete("Комплит дюжины", amount, dozenRule.chipsRequired, dozenRule.bets as Record<string, Array<{ numbers: number[]; chips: number }>>);
      }
    }
    for (const ncb of game.numberCompleteBets) {
      const completeRule = rules.completeBets.find(cb => cb.number === ncb.number);
      if (!completeRule) continue;
      processComplete(`Комплит №${ncb.number}`, ncb.amount, ncb.chipsRequired, completeRule.bets as Record<string, Array<{ numbers: number[]; chips: number }>>);
    }

    // Classify positions: capped (sum > maxBet) vs non-capped
    const cappedPositions = new Set<string>();
    for (const [positionId, posEntry] of posMap.entries()) {
      const total = Array.from(posEntry.contributions.values()).reduce((s, v) => s + v, 0);
      if (total > maxBet) cappedPositions.add(positionId);
    }

    // Build per-complete lines (unique/non-capped positions only)
    const lines: CompleteNumberPayoutLine[] = [];
    let correctAnswer = 0;

    for (const ci of completesInfo) {
      const uniquePositions: CompleteNumberPayoutWinningPos[] = [];
      for (const positionId of ci.positions) {
        if (cappedPositions.has(positionId)) continue; // handled separately
        const posEntry = posMap.get(positionId)!;
        const contribution = posEntry.contributions.get(ci.label) ?? 0;
        uniquePositions.push({ positionLabel: posEntry.positionLabel, amount: contribution });
        correctAnswer += contribution;
      }
      lines.push({
        label: ci.label,
        playPerUnit: ci.playPerUnit,
        uniquePositions,
        uniqueTotal: uniquePositions.reduce((s, p) => s + p.amount, 0),
      });
    }

    // Build capped lines (each counted once at maxBet)
    const cappedLines: CompleteNumberPayoutCappedLine[] = [];
    const processedCapped = new Set<string>();
    for (const positionId of cappedPositions) {
      if (processedCapped.has(positionId)) continue;
      processedCapped.add(positionId);
      const posEntry = posMap.get(positionId)!;
      const sumPlayPerUnit = Array.from(posEntry.contributions.values()).reduce((s, v) => s + v, 0);
      cappedLines.push({
        positionLabel: posEntry.positionLabel,
        completeLabels: Array.from(posEntry.contributions.keys()),
        sumPlayPerUnit,
        cappedAmount: maxBet,
      });
      correctAnswer += maxBet;
    }

    setCompleteNumberPayoutRecord({ userAnswer, correctAnswer, correct: userAnswer === correctAnswer, lines, cappedLines });
    setCompleteNumberPayoutInput("");
    setQuizPhase(decidePostTrackFieldPhase(game, activeSeries, rules));
  }, [game, quizPhase, completeNumberPayoutInput, activeSeries, settings.maxBet, settings.completeMultiplicity, getAllRules]);

  // ── Series Field Payout (выигравшие серии → сумма в поле) ───────────────────
  const handleCheckSeriesFieldPayout = useCallback(() => {
    if (!game || !quizPhase || quizPhase.kind !== "seriesFieldPayout") return;
    const userAnswer = parseInt(seriesFieldPayoutInput || "0", 10) || 0;
    const mult = Math.max(10, Math.min(1000, settings.multiplicity ?? 10));
    const rules = getAllRules();

    const lines: SeriesFieldPayoutLineSummary[] = [];

    for (const tb of activeSeries) {
      const trackRule = (rules.trackBets as Record<string, { divisor: number; bets: Record<string, Array<{ numbers: number[]; chips: number }>> }>)[tb.type];
      if (!trackRule) continue;
      const { playPerUnit } = calcSeriesResult(tb.amount, trackRule.divisor, mult);
      if (playPerUnit <= 0) continue;

      const winningPositions: SeriesFieldPayoutLineSummary["winningPositions"] = [];

      for (const [catKey, entries] of Object.entries(trackRule.bets)) {
        if (!Array.isArray(entries)) continue;
        const catLabel = DOZEN_COMPLETE_CATEGORY_MAP[catKey]?.label ?? catKey;
        for (const entry of entries) {
          if (!Array.isArray(entry.numbers) || typeof entry.chips !== "number") continue;
          if (!entry.numbers.includes(game.drawnNumber)) continue;
          const sortedNums = [...entry.numbers].sort((a, b) => a - b).join("-");
          winningPositions.push({
            label: `${catLabel} ${sortedNums}`,
            chips: entry.chips,
            positionAmount: playPerUnit * entry.chips,
          });
        }
      }

      if (winningPositions.length === 0) continue;

      lines.push({
        seriesLabel: tb.label,
        amount: tb.amount,
        divisor: trackRule.divisor,
        multiplicity: mult,
        playPerUnit,
        winningPositions,
        seriesTotal: winningPositions.reduce((s, p) => s + p.positionAmount, 0),
      });
    }

    const correctAnswer = lines.reduce((s, l) => s + l.seriesTotal, 0);
    setSeriesFieldPayoutRecord({ userAnswer, correctAnswer, correct: userAnswer === correctAnswer, lines });
    setSeriesFieldPayoutInput("");
    const rulesNow = getAllRules();
    const neighboursMapAfterSeries = rulesNow.neighbours as Record<string, number[]>;
    const neighboursWonAfterSeries = game.neighboursBets.length > 0 && game.neighboursBets.some(nb => {
      const nums = neighboursMapAfterSeries[String(nb.number)];
      return Array.isArray(nums) && nums.includes(game.drawnNumber);
    });
    setQuizPhase(neighboursWonAfterSeries ? { kind: "neighboursPayout" } : { kind: "field" });
  }, [game, quizPhase, seriesFieldPayoutInput, activeSeries, settings.multiplicity, getAllRules]);

  // ── Neighbours Payout (выигравшие соседи → сумма в номер) ───────────────────
  const handleCheckNeighboursPayout = useCallback(() => {
    if (!game || !quizPhase || quizPhase.kind !== "neighboursPayout") return;
    const userAnswer = parseInt(neighboursPayoutInput || "0", 10) || 0;
    const maxBet = Math.max(1, settings.maxBet);
    const mult = Math.max(10, Math.min(1000, settings.multiplicity ?? 10));
    const chipValue = settings.chipValue ?? 10;
    const completeMultiplicity = Math.max(1, settings.completeMultiplicity);
    const rules = getAllRules();
    const neighboursMap = rules.neighbours as Record<string, number[]>;
    const winningNumber = game.drawnNumber;
    const suPositionId = `su-${winningNumber}`;

    // Steps 1 & 2: Find winning neighbours bets and sum their contributions
    let winningNeighboursAmount = 0;
    const winningLines: NeighboursPayoutWinLine[] = [];
    for (const nb of game.neighboursBets) {
      const nums = neighboursMap[String(nb.number)];
      if (!Array.isArray(nums) || !nums.includes(winningNumber)) continue;
      winningNeighboursAmount += nb.baseAmount;
      winningLines.push({ label: `Соседи ${nb.number}`, totalAmount: nb.amount, amountPerNumber: nb.baseAmount });
    }

    // Step 3: Calculate what already plays on Straight Up {winningNumber}
    // Series contributions (only straightUp positions)
    let seriesContrib = 0;
    for (const tb of activeSeries) {
      const trackRule = (rules.trackBets as Record<string, { divisor: number; bets: Record<string, Array<{ numbers: number[]; chips: number }>> }>)[tb.type];
      if (!trackRule) continue;
      const { playPerUnit } = calcSeriesResult(tb.amount, trackRule.divisor, mult);
      if (playPerUnit <= 0) continue;
      const suEntries = trackRule.bets["straightUp"];
      if (!Array.isArray(suEntries)) continue;
      for (const entry of suEntries) {
        if (!Array.isArray(entry.numbers) || !entry.numbers.includes(winningNumber)) continue;
        seriesContrib += playPerUnit * entry.chips;
      }
    }

    // Color chips on Straight Up
    const chipCountByPos = new Map<string, number>();
    for (const c of game.chips) chipCountByPos.set(c.positionId, (chipCountByPos.get(c.positionId) ?? 0) + c.count);
    const colorContrib = (chipCountByPos.get(suPositionId) ?? 0) * chipValue;

    // Cash on Straight Up
    const cashByPos = new Map<string, number>();
    for (const cc of game.cashChipStacks) cashByPos.set(cc.positionId, (cashByPos.get(cc.positionId) ?? 0) + cc.denomination);
    const cashContrib = cashByPos.get(suPositionId) ?? 0;

    // Number complete contributions (only straightUp positions)
    type CompleteBetRule = { number: number; chipsRequired: number; bets: Record<string, Array<{ numbers: number[]; chips: number }>> };
    let numberCompletesContrib = 0;
    for (const ncb of game.numberCompleteBets) {
      const completeRule = (rules.completeBets as CompleteBetRule[]).find(cb => cb.number === ncb.number);
      if (!completeRule) continue;
      const { playPerUnit } = calcOneCompleteChange(ncb.amount, ncb.chipsRequired, maxBet, completeMultiplicity);
      const suEntries = completeRule.bets["straightUp"];
      if (!Array.isArray(suEntries)) continue;
      for (const entry of suEntries) {
        if (!Array.isArray(entry.numbers) || !entry.numbers.includes(winningNumber)) continue;
        numberCompletesContrib += playPerUnit * entry.chips;
      }
    }

    // Dozen complete contribution (only straightUp positions)
    type DozenBetRule = { dozen: number; chipsRequired: number; bets: Record<string, Array<{ numbers: number[]; chips: number }>> };
    let dozenCompleteContrib = 0;
    if (game.dozenCompleteBet) {
      const { amount, dozen } = game.dozenCompleteBet;
      const dozenNum = dozen === "1ST_12" ? 1 : dozen === "2ND_12" ? 2 : 3;
      const dozenRule = (rules.dozenComplete.dozens as DozenBetRule[]).find(d => d.dozen === dozenNum);
      if (dozenRule) {
        const { playPerUnit } = calcOneCompleteChange(amount, dozenRule.chipsRequired, maxBet, completeMultiplicity);
        const suEntries = dozenRule.bets["straightUp"];
        if (Array.isArray(suEntries)) {
          for (const entry of suEntries) {
            if (!Array.isArray(entry.numbers) || !entry.numbers.includes(winningNumber)) continue;
            dozenCompleteContrib += playPerUnit * entry.chips;
          }
        }
      }
    }

    // Steps 4–9: Cap existing amount at maximum (account for already-given change)
    const existingAmount = seriesContrib + colorContrib + cashContrib + numberCompletesContrib + dozenCompleteContrib;
    const effectiveExistingAmount = Math.min(existingAmount, maxBet);

    // Step 10: Available limit
    const availableAmount = Math.max(0, maxBet - effectiveExistingAmount);

    // Step 11: Correct answer
    const correctAnswer = Math.min(winningNeighboursAmount, availableAmount);

    setNeighboursPayoutRecord({
      userAnswer,
      correctAnswer,
      correct: userAnswer === correctAnswer,
      winningLines,
      winningNeighboursAmount,
      seriesContrib,
      colorContrib,
      cashContrib,
      numberCompletesContrib,
      dozenCompleteContrib,
      existingAmount,
      effectiveExistingAmount,
      availableAmount,
      winningNumber,
    });
    setNeighboursPayoutInput("");
    setQuizPhase({ kind: "field" });
  }, [game, quizPhase, neighboursPayoutInput, activeSeries, settings.maxBet, settings.multiplicity, settings.chipValue, settings.completeMultiplicity, getAllRules]);

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

  const showWinningField = quizPhase?.kind === "field" || quizPhase?.kind === "colorPayout";
  const showReportField  = quizPhase?.kind === "report";
  // In report mode use the immutable snapshot; otherwise use live game (hidden when winning field active)
  const fieldSource = showReportField
    ? initialRoundSnapshot
    : (showWinningField ? null : game);

  const hasCompletesQuestion = settings.completeField === "yes" || settings.completeDozen === "yes";
  const hasTrackIntersectionQuestion = activeSeries.length > 0 || (game?.neighboursBets?.length ?? 0) > 0;
  const anySeriesWon = (() => {
    if (!game || activeSeries.length === 0) return false;
    const rules = getAllRules();
    return activeSeries.some(tb => {
      const tr = (rules.trackBets as Record<string, { bets: Record<string, Array<{ numbers: number[]; chips: number }>> }>)[tb.type];
      if (!tr) return false;
      return Object.values(tr.bets).some(entries =>
        Array.isArray(entries) && entries.some(e => Array.isArray(e.numbers) && e.numbers.includes(game.drawnNumber))
      );
    });
  })();
  const anyNeighboursWon = (() => {
    if (!game || (game.neighboursBets?.length ?? 0) === 0) return false;
    const rules = getAllRules();
    const nMap = rules.neighbours as Record<string, number[]>;
    return game.neighboursBets.some(nb => {
      const nums = nMap[String(nb.number)];
      return Array.isArray(nums) && nums.includes(game.drawnNumber);
    });
  })();
  // True when at least one complete bet position (straight/split/street/corner/six-line)
  // contains the winning number — determines whether the completeNumberPayout question is shown.
  const anyCompletePositionWon = (() => {
    if (!game) return false;
    const rules = getAllRules();
    const drawnNumber = game.drawnNumber;
    if (game.dozenCompleteBet) {
      const dozenNum = game.dozenCompleteBet.dozen === "1ST_12" ? 1 : game.dozenCompleteBet.dozen === "2ND_12" ? 2 : 3;
      const dozenRule = (rules.dozenComplete as { dozens: Array<{ dozen: number; bets: Record<string, Array<{ numbers: number[]; chips: number }>> }> })?.dozens?.find(d => d.dozen === dozenNum);
      if (dozenRule) {
        for (const entries of Object.values(dozenRule.bets)) {
          if (Array.isArray(entries) && entries.some(e => Array.isArray(e.numbers) && e.numbers.includes(drawnNumber))) return true;
        }
      }
    }
    for (const ncb of game.numberCompleteBets) {
      const completeRule = (rules.completeBets as Array<{ number: number; bets: Record<string, Array<{ numbers: number[]; chips: number }>> }>)?.find(cb => cb.number === ncb.number);
      if (!completeRule) continue;
      for (const entries of Object.values(completeRule.bets)) {
        if (Array.isArray(entries) && entries.some(e => Array.isArray(e.numbers) && e.numbers.includes(drawnNumber))) return true;
      }
    }
    return false;
  })();
  const hasCompleteTrackQuestion = hasCompletesQuestion && hasTrackIntersectionQuestion;
  const seriesBaseNum = hasCompletesQuestion ? 3 : 1;
  const trackIntQuestionNum = seriesBaseNum + (activeSeries.length > 0 ? 1 : 0);
  const trackFieldIntQuestionNum = trackIntQuestionNum + (hasTrackIntersectionQuestion ? 1 : 0);
  const completeTrackIntQuestionNum = trackFieldIntQuestionNum + (hasTrackIntersectionQuestion ? 1 : 0);
  const completeNumberPayoutQuestionNum = completeTrackIntQuestionNum + (hasCompleteTrackQuestion ? 1 : 0);
  const seriesFieldPayoutQuestionNum = completeNumberPayoutQuestionNum + (hasCompleteTrackQuestion && anyCompletePositionWon ? 1 : 0);
  const neighboursPayoutQuestionNum = seriesFieldPayoutQuestionNum + (anySeriesWon ? 1 : 0);
  const fieldQuestionNum = (hasCompletesQuestion ? 2 : 0) + (activeSeries.length > 0 ? 1 : 0) + (hasTrackIntersectionQuestion ? 2 : 0) + (hasCompleteTrackQuestion ? 1 : 0) + (hasCompleteTrackQuestion && anyCompletePositionWon ? 1 : 0) + (anySeriesWon ? 1 : 0) + (anyNeighboursWon ? 1 : 0) + 1;
  const colorPayoutQuestionNum = fieldQuestionNum + 1;

  return (
    <div className={showReportField ? "roulette-page roulette-page--report" : "roulette-page"}>
      {/* Controls */}
      <div className="controls-bar">
        <button className="grid-toggle-btn spin-btn" onClick={handleSpin} disabled={isSpinning}>
          {isSpinning ? "⏳ Spin…" : "▶ Spin"}
        </button>
        <button className="grid-toggle-btn settings-open-btn" onClick={onOpenSettings}>
          ⚙ Настройки
        </button>
        <button className="grid-toggle-btn" onClick={onOpenDebug} disabled={isSpinning}>
          🔧 Отладка
        </button>
      </div>

      {/* Two-column container in report mode, transparent otherwise */}
      <div className={showReportField ? "spin-report-outer" : ""}>
      {/* Left column: table + sidebar, sticky in report mode */}
      <div className={showReportField ? "spin-report-table" : ""}>
      {/* Table + info sidebar */}
      <div className="table-row">
      {/* Table image + SVG overlay */}
      <div className="roulette-wrapper">
        {isSpinning && (
          <div className="spin-overlay">
            <svg className="spin-wheel" viewBox="-110 -110 220 220" width="220" height="220" xmlns="http://www.w3.org/2000/svg">
              {/* Outer gold ring */}
              <circle r="108" fill="none" stroke="#c8a84b" strokeWidth="4" />
              <circle r="103" fill="#1a1208" />
              {/* Alternating sectors (12 red/black + 1 green for 0, total 13) */}
              {Array.from({ length: 13 }).map((_, i) => {
                const total = 13;
                const startAngle = (i / total) * 2 * Math.PI - Math.PI / 2;
                const endAngle = ((i + 1) / total) * 2 * Math.PI - Math.PI / 2;
                const r = 98;
                const x1 = Math.cos(startAngle) * r;
                const y1 = Math.sin(startAngle) * r;
                const x2 = Math.cos(endAngle) * r;
                const y2 = Math.sin(endAngle) * r;
                const fill = i === 0 ? "#1a5c2a" : i % 2 === 1 ? "#8b1a1a" : "#111418";
                return (
                  <path key={i}
                    d={`M 0 0 L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`}
                    fill={fill}
                    stroke="#c8a84b"
                    strokeWidth="0.8"
                  />
                );
              })}
              {/* Inner decorative ring */}
              <circle r="30" fill="#111418" stroke="#c8a84b" strokeWidth="2" />
              <circle r="24" fill="none" stroke="#c8a84b" strokeWidth="0.8" opacity="0.5" />
              {/* Center hub */}
              <circle r="10" fill="#c8a84b" />
              <circle r="5" fill="#1a1208" />
            </svg>
            <div className="spin-no-more-bets">NO MORE BETS</div>
          </div>
        )}
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
          {/* Number complete highlights — cyan fill (pass 1, before winning yellow; skip winning number so yellow shows on top) */}
          {fieldSource && fieldSource.numberCompleteBets.map(ncb => {
            if (game?.drawnNumber === ncb.number) return null;
            const wz = gridZones.find(z => z.number === ncb.number);
            if (!wz) return null;
            return (
              <g key={`ncb-hl-${ncb.number}`} style={{ pointerEvents: "none" }}>
                <polygon points={wz.pts}
                  fill="rgba(0, 212, 255, 0.42)"
                  stroke="#00D4FF"
                  strokeWidth="3"
                  strokeLinejoin="round" />
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

          {/* Number complete — pass 2 (after winning yellow): cyan border for winning+complete, then "C" for all */}
          {fieldSource && fieldSource.numberCompleteBets.map(ncb => {
            const wz = gridZones.find(z => z.number === ncb.number);
            if (!wz) return null;
            const isWinning = game?.drawnNumber === ncb.number;
            // Compute cell height from polygon bounding box to size the "C" letter
            const ysInPts = wz.pts.split(/\s+/).map(p => Number(p.split(",")[1])).filter(n => !isNaN(n));
            const cellH = ysInPts.length >= 2 ? Math.max(...ysInPts) - Math.min(...ysInPts) : 60;
            const cFontSize = Math.round(cellH * 0.85);
            return (
              <g key={`ncb-post-${ncb.number}`} style={{ pointerEvents: "none" }}>
                {/* Cyan stroke border — only when this complete number is also the winning number */}
                {isWinning && (
                  <polygon points={wz.pts}
                    fill="none"
                    stroke="#00D4FF"
                    strokeWidth="5"
                    strokeLinejoin="round"
                    opacity="0.95" />
                )}
                {/* "C" watermark — fills the cell, sits behind the number */}
                <text
                  x={wz.cx} y={wz.cy}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={cFontSize} fontWeight="900" fill="#D8F4FF"
                  stroke="rgba(0,200,255,0.65)" strokeWidth="3" paintOrder="stroke"
                  opacity="0.72"
                  style={{ pointerEvents: "none" }}>
                  C
                </text>
              </g>
            );
          })}

          {/* Chips */}
          {fieldSource && fieldSource.chips.map(stack => {
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
          {fieldSource && fieldSource.cashChipStacks && fieldSource.cashChipStacks.map(stack => {
            const pos = chipPosMap.get(stack.positionId);
            if (!pos) return null;
            const amt = String(stack.denomination);
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

          {/* Dozen complete badge — cyan rectangle with "C" watermark letter, no amount shown */}
          {fieldSource?.dozenCompleteBet && (() => {
            const { x, y } = fieldSource.dozenCompleteBet!.position;
            const bw = 88; const bh = 62; // badge width / height in SVG units (≈ same footprint as old r=40 circle)
            const rx = 7;                 // border-radius
            return (
              <g style={{ pointerEvents: "none" }}>
                {/* Outer glow */}
                <rect x={x - bw / 2 - 3} y={y - bh / 2 - 3} width={bw + 6} height={bh + 6} rx={rx + 2}
                  fill="none" stroke="rgba(0,212,255,0.45)" strokeWidth="3" />
                {/* Badge body */}
                <rect x={x - bw / 2} y={y - bh / 2} width={bw} height={bh} rx={rx}
                  fill="rgba(0, 212, 255, 0.55)"
                  stroke="rgba(160, 240, 255, 0.95)"
                  strokeWidth="2"
                  style={{ filter: "drop-shadow(0 0 8px rgba(0,212,255,0.80))" }} />
                {/* "C" letter watermark */}
                <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
                  fontSize={Math.round(bh * 0.80)} fontWeight="900"
                  fill="#E8F8FF"
                  stroke="rgba(0,180,230,0.70)" strokeWidth="2.5" paintOrder="stroke"
                  opacity="0.92"
                  style={{ pointerEvents: "none" }}>
                  C
                </text>
              </g>
            );
          })()}

          {/* Number complete chips — replaced by pink highlight + "C" label above */}

          {/* Track series chips — Chicago-1932 copper/silver cash-chip style, 70% of previous size (r≈40) */}
          {fieldSource && fieldSource.trackBets.map(tb => {
            const { x, y } = tb.position;
            const amt = String(showReportField ? tb.amount : (seriesDisplayAmounts?.get(tb.type) ?? tb.amount));
            const fs = amt.length >= 4 ? "15" : "18";
            const r = 40;
            return (
              <g key={tb.type} style={{ pointerEvents: "none" }}>
                {/* Outer glow ring */}
                <circle cx={x} cy={y} r={r + 4} fill="none" stroke="#B87333" strokeWidth="2.2" opacity="0.45" />
                {/* Main body */}
                <circle cx={x} cy={y} r={r} fill="#111418" stroke="#B87333" strokeWidth="4" />
                {/* Inner decorative ring */}
                <circle cx={x} cy={y} r={r - 7} fill="none" stroke="#D9D9D9" strokeWidth="1.1" opacity="0.6" />
                {/* Dashed rim accent — distinct chip pattern */}
                <circle cx={x} cy={y} r={r - 3} fill="none" stroke="#D9D9D9" strokeWidth="1.4"
                  strokeDasharray="4 4" opacity="0.5" />
                {/* Amount text */}
                <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
                  fontSize={fs} fontWeight="800" fill="#D9D9D9"
                  stroke="rgba(0,0,0,0.75)" strokeWidth="0.8" paintOrder="stroke"
                  letterSpacing="0.3">
                  {amt}
                </text>
              </g>
            );
          })}

          {/* Neighbours ("Соседи номера") cash chips — Chicago-1932 copper/silver style */}
          {fieldSource && fieldSource.neighboursBets.map(nb => {
            const { x, y } = nb.position;
            const displayNbAmt = (!showReportField && settings.showBetBeforeChange && acceptedNeighboursAmounts !== null)
              ? (acceptedNeighboursAmounts.get(nb.number) ?? nb.amount)
              : nb.amount;
            const amt = String(displayNbAmt);
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

          {/* Winning field — solo color chips: keep as original blue chip */}
          {showWinningField && winningFieldChips && winningFieldChips.filter(e => e.displayAs === "color").map(entry => {
            const pos = chipPosMap.get(entry.positionId);
            if (!pos) return null;
            const count = entry.colorCount;
            return (
              <g key={`wf-color-${entry.positionId}`} style={{ pointerEvents: "none" }}>
                <circle cx={pos.x} cy={pos.y} r={19.1}
                  fill="#1a6fd4" stroke="#fff" strokeWidth="2.5" opacity="0.92" />
                <text x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="central"
                  fontSize={count >= 10 ? "12.75" : "14.9"} fontWeight="bold" fill="#fff">
                  {count}
                </text>
              </g>
            );
          })}

          {/* Winning field — solo cash chips: keep as original bronze cash chip */}
          {showWinningField && winningFieldChips && winningFieldChips.filter(e => e.displayAs === "cash").map(entry => {
            const pos = chipPosMap.get(entry.positionId);
            if (!pos) return null;
            const amt = String(entry.amount);
            const len = amt.length;
            const fs = len >= 6 ? "8" : len >= 5 ? "9.5" : len >= 4 ? "11" : len >= 3 ? "12.5" : "13.5";
            const r = 22;
            return (
              <g key={`wf-cash-${entry.positionId}`} style={{ pointerEvents: "none" }}>
                <circle cx={pos.x} cy={pos.y} r={r + 3} fill="none" stroke="#B87333" strokeWidth="1.6" opacity="0.45" />
                <circle cx={pos.x} cy={pos.y} r={r} fill="#111418" stroke="#B87333" strokeWidth="2.8" />
                <circle cx={pos.x} cy={pos.y} r={r - 5} fill="none" stroke="#D9D9D9" strokeWidth="0.8" opacity="0.6" />
                <circle cx={pos.x} cy={pos.y} r={r - 2} fill="none" stroke="#D9D9D9" strokeWidth="1"
                  strokeDasharray="3 3" opacity="0.5" />
                <text x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="central"
                  fontSize={fs} fontWeight="800" fill="#D9D9D9"
                  stroke="rgba(0,0,0,0.75)" strokeWidth="0.6" paintOrder="stroke"
                  letterSpacing="0.3">
                  {amt}
                </text>
              </g>
            );
          })}

          {/* Winning field — merged chips: standard cash chip style (same as solo cash) */}
          {showWinningField && winningFieldChips && winningFieldChips.filter(e => e.displayAs === "merged").map(entry => {
            const pos = chipPosMap.get(entry.positionId);
            if (!pos) return null;
            const amt = String(entry.amount);
            const len = amt.length;
            const fs = len >= 6 ? "8" : len >= 5 ? "9.5" : len >= 4 ? "11" : len >= 3 ? "12.5" : "13.5";
            const r = 22;
            return (
              <g key={`wf-merged-${entry.positionId}`} style={{ pointerEvents: "none" }}>
                <circle cx={pos.x} cy={pos.y} r={r + 3} fill="none" stroke="#B87333" strokeWidth="1.6" opacity="0.45" />
                <circle cx={pos.x} cy={pos.y} r={r} fill="#111418" stroke="#B87333" strokeWidth="2.8" />
                <circle cx={pos.x} cy={pos.y} r={r - 5} fill="none" stroke="#D9D9D9" strokeWidth="0.8" opacity="0.6" />
                <circle cx={pos.x} cy={pos.y} r={r - 2} fill="none" stroke="#D9D9D9" strokeWidth="1"
                  strokeDasharray="3 3" opacity="0.5" />
                <text x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="central"
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
        <div className="info-sidebar-row">
          <span className="info-sidebar-label">Кратность соседей</span>
          <span className="info-sidebar-value">{settings.neighboursMultiplicity ?? 10}</span>
        </div>
        {game?.dozenCompleteBet && (
          <>
            <div className="info-sidebar-divider" />
            <div className="info-sidebar-row">
              <span className="info-sidebar-label">Комплит дюжины</span>
              <span className="info-sidebar-value" style={{ color: "#C9A227", fontWeight: 800 }}>
                {showReportField
                  ? (initialRoundSnapshot?.dozenCompleteBet?.amount ?? game.dozenCompleteBet.amount)
                  : (completesDisplayAmounts?.has("Комплит дюжины")
                    ? completesDisplayAmounts.get("Комплит дюжины")
                    : game.dozenCompleteBet.amount)}
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
                  {showReportField
                    ? (initialRoundSnapshot?.numberCompleteBets.find(n => n.number === ncb.number)?.amount ?? ncb.amount)
                    : (completesDisplayAmounts?.has(`Комплит №${ncb.number}`)
                      ? completesDisplayAmounts.get(`Комплит №${ncb.number}`)
                      : ncb.amount)}
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

        {/* Drawn number + title shown in left column during report */}
        {showReportField && game && (
          <div className="spin-report-drawn">
            <div className={`number-badge number-badge--${getNumberColor(game.drawnNumber)}`}>
              {game.drawnNumber}
            </div>
            <span className="quiz-series-title">Отчёт по спину</span>
          </div>
        )}
      </div>{/* /spin-report-table */}

      {/* Quiz panel / right column in report mode */}
      {game && quizPhase && (
        <div className={showReportField ? "spin-report-results" : "game-panel"}>
          {!showReportField && (
          <div className="game-result-row">
            {/* Drawn number */}
            <div className={`number-badge number-badge--${getNumberColor(game.drawnNumber)}`}>
              {game.drawnNumber}
            </div>

            {/* Completes question */}
            {quizPhase.kind === "completes" && (
              <div className="game-answer-area">
                <div className="quiz-series-header">
                  <span className="quiz-series-title">1. Посчитайте сдачу с кратности приема ставок «комплит».</span>
                  <span className="quiz-series-sub">Общая сдача</span>
                </div>
                <input
                  type="number"
                  className="game-answer-input"
                  placeholder="Общая сдача"
                  value={completesInput}
                  min="0"
                  onKeyDown={e => { if (e.key === "-") e.preventDefault(); if (e.key === "Enter") handleCheckCompletes(); }}
                  onChange={e => { const v = e.target.value; setCompletesInput(v !== "" && Number(v) < 0 ? "" : v); }}
                  autoFocus
                />
                <button className="game-check-btn" onClick={handleCheckCompletes}>Проверить</button>
              </div>
            )}

            {/* Completes intersection question */}
            {quizPhase.kind === "completesIntersection" && (
              <div className="game-answer-area">
                <div className="quiz-series-header">
                  <span className="quiz-series-title">2. Посчитайте сдачу с пересечений ставок «комплит» со ставками на поле, без учета трека.</span>
                  <span className="quiz-series-sub">Общая сдача</span>
                </div>
                <input
                  type="number"
                  className="game-answer-input"
                  placeholder="Общая сдача"
                  value={intersectionInput}
                  min="0"
                  onKeyDown={e => { if (e.key === "-") e.preventDefault(); if (e.key === "Enter") handleCheckCompletesIntersection(); }}
                  onChange={e => { const v = e.target.value; setIntersectionInput(v !== "" && Number(v) < 0 ? "" : v); }}
                  autoFocus
                />
                <button className="game-check-btn" onClick={handleCheckCompletesIntersection}>Проверить</button>
              </div>
            )}

            {/* Series question */}
            {quizPhase.kind === "series" && (
              <div className="game-answer-area">
                <div className="quiz-series-header">
                  <span className="quiz-series-title">{seriesBaseNum}. Посчитайте общую сдачу с кратности приема серий.</span>
                  <span className="quiz-series-sub">Общая сдача</span>
                </div>
                <input
                  type="number"
                  className="game-answer-input"
                  placeholder="Общая сдача"
                  value={seriesInput}
                  min="0"
                  onKeyDown={e => { if (e.key === "-") e.preventDefault(); if (e.key === "Enter") handleCheckSeries(); }}
                  onChange={e => { const v = e.target.value; setSeriesInput(v !== "" && Number(v) < 0 ? "" : v); }}
                  autoFocus
                />
                <button className="game-check-btn" onClick={handleCheckSeries}>Проверить</button>
              </div>
            )}

            {/* Track intersection question */}
            {quizPhase.kind === "trackIntersection" && (
              <div className="game-answer-area">
                <div className="quiz-series-header">
                  <span className="quiz-series-title">{trackIntQuestionNum}. Посчитайте сдачу с пересечений на треке серий и ставок «соседи номера», без учета ставок на поле.</span>
                  <span className="quiz-series-sub">Общая сдача</span>
                </div>
                <input
                  type="number"
                  className="game-answer-input"
                  placeholder="Общая сдача"
                  value={trackIntersectionInput}
                  min="0"
                  onKeyDown={e => { if (e.key === "-") e.preventDefault(); if (e.key === "Enter") handleCheckTrackIntersection(); }}
                  onChange={e => { const v = e.target.value; setTrackIntersectionInput(v !== "" && Number(v) < 0 ? "" : v); }}
                  autoFocus
                />
                <button className="game-check-btn" onClick={handleCheckTrackIntersection}>Проверить</button>
              </div>
            )}

            {/* Track × Field intersection question */}
            {quizPhase.kind === "trackFieldIntersection" && (
              <div className="game-answer-area">
                <div className="quiz-series-header">
                  <span className="quiz-series-title">{trackFieldIntQuestionNum}. Посчитайте сдачу с пересечений ставок на треке со ставками на поле, без учета ставок «комплит».</span>
                  <span className="quiz-series-sub">Общая сдача</span>
                </div>
                <input
                  type="number"
                  className="game-answer-input"
                  placeholder="Общая сдача"
                  value={trackFieldIntersectionInput}
                  min="0"
                  onKeyDown={e => { if (e.key === "-") e.preventDefault(); if (e.key === "Enter") handleCheckTrackFieldIntersection(); }}
                  onChange={e => { const v = e.target.value; setTrackFieldIntersectionInput(v !== "" && Number(v) < 0 ? "" : v); }}
                  autoFocus
                />
                <button className="game-check-btn" onClick={handleCheckTrackFieldIntersection}>Проверить</button>
              </div>
            )}

            {/* Complete × Track intersection question */}
            {quizPhase.kind === "completeTrackIntersection" && (
              <div className="game-answer-area">
                <div className="quiz-series-header">
                  <span className="quiz-series-title">{completeTrackIntQuestionNum}. Посчитайте сдачу с пересечений ставок «комплит» со ставками на треке.</span>
                  <span className="quiz-series-sub">Общая сдача</span>
                </div>
                <input
                  type="number"
                  className="game-answer-input"
                  placeholder="Общая сдача"
                  value={completeTrackIntersectionInput}
                  min="0"
                  onKeyDown={e => { if (e.key === "-") e.preventDefault(); if (e.key === "Enter") handleCheckCompleteTrackIntersection(); }}
                  onChange={e => { const v = e.target.value; setCompleteTrackIntersectionInput(v !== "" && Number(v) < 0 ? "" : v); }}
                  autoFocus
                />
                <button className="game-check-btn" onClick={handleCheckCompleteTrackIntersection}>Проверить</button>
              </div>
            )}

            {/* Complete number payout question */}
            {quizPhase.kind === "completeNumberPayout" && (
              <div className="game-answer-area">
                <div className="quiz-series-header">
                  <span className="quiz-series-title">{completeNumberPayoutQuestionNum}. Какую общую сумму нужно поставить в номер с выигрышных ставок «комплит»?</span>
                  <span className="quiz-series-sub">Сумма</span>
                </div>
                <input
                  type="number"
                  className="game-answer-input"
                  placeholder="Сумма"
                  value={completeNumberPayoutInput}
                  min="0"
                  onKeyDown={e => { if (e.key === "-") e.preventDefault(); if (e.key === "Enter") handleCheckCompleteNumberPayout(); }}
                  onChange={e => { const v = e.target.value; setCompleteNumberPayoutInput(v !== "" && Number(v) < 0 ? "" : v); }}
                  autoFocus
                />
                <button className="game-check-btn" onClick={handleCheckCompleteNumberPayout}>Проверить</button>
              </div>
            )}

            {/* Series field payout question */}
            {quizPhase.kind === "seriesFieldPayout" && (
              <div className="game-answer-area">
                <div className="quiz-series-header">
                  <span className="quiz-series-title">{seriesFieldPayoutQuestionNum}. Какую общую сумму нужно выставить в поле с выигрышных серий?</span>
                  <span className="quiz-series-sub">Сумма</span>
                </div>
                <input
                  type="number"
                  className="game-answer-input"
                  placeholder="Сумма"
                  value={seriesFieldPayoutInput}
                  min="0"
                  onKeyDown={e => { if (e.key === "-") e.preventDefault(); if (e.key === "Enter") handleCheckSeriesFieldPayout(); }}
                  onChange={e => { const v = e.target.value; setSeriesFieldPayoutInput(v !== "" && Number(v) < 0 ? "" : v); }}
                  autoFocus
                />
                <button className="game-check-btn" onClick={handleCheckSeriesFieldPayout}>Проверить</button>
              </div>
            )}

            {/* Neighbours payout question */}
            {quizPhase.kind === "neighboursPayout" && (
              <div className="game-answer-area">
                <div className="quiz-series-header">
                  <span className="quiz-series-title">{neighboursPayoutQuestionNum}. Какую общую сумму нужно выставить в поле со ставок «соседи номера»?</span>
                  <span className="quiz-series-sub">Сумма</span>
                </div>
                <input
                  type="number"
                  className="game-answer-input"
                  placeholder="Сумма"
                  value={neighboursPayoutInput}
                  min="0"
                  onKeyDown={e => { if (e.key === "-") e.preventDefault(); if (e.key === "Enter") handleCheckNeighboursPayout(); }}
                  onChange={e => { const v = e.target.value; setNeighboursPayoutInput(v !== "" && Number(v) < 0 ? "" : v); }}
                  autoFocus
                />
                <button className="game-check-btn" onClick={handleCheckNeighboursPayout}>Проверить</button>
              </div>
            )}

            {/* Field question */}
            {quizPhase.kind === "field" && (
              <div className="game-answer-area">
                <div className="quiz-series-header">
                  <span className="quiz-series-title">{fieldQuestionNum}. Посчитайте общую сумму выплаты.</span>
                  <span className="quiz-series-sub">Сумма выплаты</span>
                </div>
                <input
                  type="number"
                  className="game-answer-input"
                  placeholder="введите ответ"
                  value={fieldInput}
                  min="0"
                  onKeyDown={e => { if (e.key === "-") e.preventDefault(); if (e.key === "Enter") handleCheckField(); }}
                  onChange={e => { const v = e.target.value; setFieldInput(v !== "" && Number(v) < 0 ? "" : v); }}
                  autoFocus
                />
                <button className="game-check-btn" onClick={handleCheckField}>Проверить</button>
              </div>
            )}

            {/* Color payout question */}
            {quizPhase.kind === "colorPayout" && colorPayoutData && (
              <div className="game-answer-area">
                <div className="quiz-series-header">
                  <span className="quiz-series-title">
                    {colorPayoutQuestionNum}. Выплата через {colorPayoutData.cashPayout}. Посчитайте остаток выплаты в «цвете».
                  </span>
                  <span className="quiz-series-sub">Количество фишек</span>
                </div>
                <input
                  type="number"
                  className="game-answer-input"
                  placeholder="Количество фишек"
                  value={colorPayoutInput}
                  min="0"
                  onKeyDown={e => { if (e.key === "-") e.preventDefault(); if (e.key === "Enter") handleCheckColorPayout(); }}
                  onChange={e => { const v = e.target.value; setColorPayoutInput(v !== "" && Number(v) < 0 ? "" : v); }}
                  autoFocus
                />
                <button className="game-check-btn" onClick={handleCheckColorPayout}>Проверить</button>
              </div>
            )}

          </div>
          )} {/* /!showReportField */}

          {/* Full report */}
          {quizPhase.kind === "report" && (
            <div className={showReportField ? "quiz-report quiz-report--panel" : "quiz-report"}>
              {completesRecord && (
                <div className={`quiz-report-item ${completesRecord.correct ? "quiz-report-item--ok" : "quiz-report-item--err"}`}>
                  <div className="quiz-report-name">1. Сдача с кратности приема ставок «комплит».</div>
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
              {intersectionRecord && (
                <div className={`quiz-report-item ${intersectionRecord.correct ? "quiz-report-item--ok" : "quiz-report-item--err"}`}>
                  <div className="quiz-report-name">2. Сдача с пересечений ставок «комплит» со ставками на поле, без учета трека.</div>
                  {intersectionRecord.correct ? (
                    <>
                      <div className="quiz-report-verdict quiz-ok">✅ Верно</div>
                      <div className="quiz-report-detail">Ответ: {intersectionRecord.correctAnswer}</div>
                    </>
                  ) : (
                    <>
                      <div className="quiz-report-verdict quiz-err">❌ Неверно</div>
                      <div className="quiz-report-detail">Ваш ответ: {intersectionRecord.userAnswer}</div>
                      <div className="quiz-report-detail">Правильный ответ: {intersectionRecord.correctAnswer}</div>
                      {intersectionRecord.lines.length === 0 ? (
                        <div className="quiz-report-calc">Пересечений с лимитом позиций не найдено — сдачи нет.</div>
                      ) : (
                        <div className="quiz-report-calc">
                          {intersectionRecord.lines.map((line, li) => (
                            <div key={li} style={{ marginBottom: 8 }}>
                              <strong>{line.label}</strong><br/>
                              Лимит: {line.positionLimit}<br/>
                              {line.dozenCompleteAmount > 0 && (
                                <>Комплит дюжины: {line.dozenCompleteAmount}<br/></>
                              )}
                              {line.numberCompleteAmounts.map(nc => (
                                <span key={nc.number}>Комплит №{nc.number}: {nc.amount}<br/></span>
                              ))}
                              {line.colorAmount > 0 && (
                                <>Цветные на поле: {line.colorAmount}<br/></>
                              )}
                              {line.cashAmount > 0 && (
                                <>Кэш на поле: {line.cashAmount}<br/></>
                              )}
                              Итого: {line.totalAmount}<br/>
                              Сдача: {line.totalAmount} − {line.positionLimit} = {line.change}
                            </div>
                          ))}
                          <div className="quiz-report-total">
                            Итого сдача: {intersectionRecord.lines.map(l => l.change).join(" + ")} = {intersectionRecord.correctAnswer}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              {seriesRecord && (
                <div className={`quiz-report-item ${seriesRecord.correct ? "quiz-report-item--ok" : "quiz-report-item--err"}`}>
                  <div className="quiz-report-name">{seriesBaseNum}. Общая сдача с кратности приема серий.</div>
                  {seriesRecord.correct ? (
                    <>
                      <div className="quiz-report-verdict quiz-ok">✅ Верно</div>
                      <div className="quiz-report-detail">Ответ: {seriesRecord.correctAnswer}</div>
                    </>
                  ) : (
                    <>
                      <div className="quiz-report-verdict quiz-err">❌ Неверно</div>
                      <div className="quiz-report-detail">Ваш ответ: {seriesRecord.userAnswer}</div>
                      <div className="quiz-report-detail">Правильный ответ: {seriesRecord.correctAnswer}</div>
                      <div className="quiz-report-calc">
                        {seriesRecord.lines.map((line, i) => (
                          <div key={i} style={{ marginBottom: 6 }}>
                            <strong>{line.label}:</strong><br/>
                            Ставка серии: {line.amount}<br/>
                            Делитель: {line.divisor}<br/>
                            Кратность: {line.multiplicity}<br/>
                            {line.amount} / {line.divisor} = {line.rawPerUnit.toFixed(2)}<br/>
                            Округляем вниз до {line.playPerUnit}<br/>
                            Принятая сумма: {line.playPerUnit} × {line.divisor} = {line.acceptedAmount}<br/>
                            Сдача: {line.amount} − {line.acceptedAmount} = {line.change}
                          </div>
                        ))}
                        <div className="quiz-report-total">
                          Итого сдача с серий: {seriesRecord.lines.map(l => l.change).join(" + ")} = {seriesRecord.correctAnswer}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              {trackIntersectionRecord && (
                <div className={`quiz-report-item ${trackIntersectionRecord.correct ? "quiz-report-item--ok" : "quiz-report-item--err"}`}>
                  <div className="quiz-report-name">{trackIntQuestionNum}. Сдача с пересечений на треке серий и ставок «соседи номера».</div>
                  {trackIntersectionRecord.correct ? (
                    <>
                      <div className="quiz-report-verdict quiz-ok">✅ Верно</div>
                      <div className="quiz-report-detail">Ответ: {trackIntersectionRecord.correctAnswer}</div>
                    </>
                  ) : (
                    <>
                      <div className="quiz-report-verdict quiz-err">❌ Неверно</div>
                      <div className="quiz-report-detail">Ваш ответ: {trackIntersectionRecord.userAnswer}</div>
                      <div className="quiz-report-detail">Правильный ответ: {trackIntersectionRecord.correctAnswer}</div>
                      {trackIntersectionRecord.lines.length === 0 ? (
                        <div className="quiz-report-calc">Пересечений с лимитом позиций не найдено — сдачи нет.</div>
                      ) : (
                        <div className="quiz-report-calc">
                          {trackIntersectionRecord.lines.map((line, li) => (
                            <div key={li} style={{ marginBottom: 8 }}>
                              <strong>{line.label}</strong><br/>
                              Лимит: {line.positionLimit}<br/>
                              {line.contributions.map(c => (
                                <span key={c.source}>{c.source}: {c.amount}<br/></span>
                              ))}
                              Итого: {line.totalAmount}<br/>
                              Сдача: {line.totalAmount} − {line.positionLimit} = {line.change}
                            </div>
                          ))}
                          <div className="quiz-report-total">
                            Итого сдача: {trackIntersectionRecord.lines.map(l => l.change).join(" + ")} = {trackIntersectionRecord.correctAnswer}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              {trackFieldIntersectionRecord && (
                <div className={`quiz-report-item ${trackFieldIntersectionRecord.correct ? "quiz-report-item--ok" : "quiz-report-item--err"}`}>
                  <div className="quiz-report-name">{trackFieldIntQuestionNum}. Сдача с пересечений трека со ставками на поле.</div>
                  {trackFieldIntersectionRecord.correct ? (
                    <>
                      <div className="quiz-report-verdict quiz-ok">✅ Верно</div>
                      <div className="quiz-report-detail">Ответ: {trackFieldIntersectionRecord.correctAnswer}</div>
                    </>
                  ) : (
                    <>
                      <div className="quiz-report-verdict quiz-err">❌ Неверно</div>
                      <div className="quiz-report-detail">Ваш ответ: {trackFieldIntersectionRecord.userAnswer}</div>
                      <div className="quiz-report-detail">Правильный ответ: {trackFieldIntersectionRecord.correctAnswer}</div>
                      {trackFieldIntersectionRecord.lines.length === 0 ? (
                        <div className="quiz-report-calc">Пересечений с лимитом позиций не найдено — сдачи нет.</div>
                      ) : (
                        <div className="quiz-report-calc">
                          {trackFieldIntersectionRecord.lines.map((line, li) => (
                            <div key={li} style={{ marginBottom: 8 }}>
                              <strong>{line.label}</strong><br/>
                              Лимит: {line.positionLimit}<br/>
                              Ставки трека после уже отданной сдачи: {line.effectiveTrackAmount}<br/>
                              Ставки поля: {line.colorAmount > 0 ? `цвет ${line.colorAmount}` : ""}{line.colorAmount > 0 && line.cashAmount > 0 ? " + " : ""}{line.cashAmount > 0 ? `кэш ${line.cashAmount}` : ""} = {line.colorAmount + line.cashAmount}<br/>
                              Итого: {line.effectiveTrackAmount} + {line.colorAmount + line.cashAmount} = {line.totalAmount}<br/>
                              Сдача: {line.totalAmount} − {line.positionLimit} = {line.change}
                            </div>
                          ))}
                          <div className="quiz-report-total">
                            Итого сдача: {trackFieldIntersectionRecord.lines.map(l => l.change).join(" + ")} = {trackFieldIntersectionRecord.correctAnswer}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              {completeTrackIntersectionRecord && (
                <div className={`quiz-report-item ${completeTrackIntersectionRecord.correct ? "quiz-report-item--ok" : "quiz-report-item--err"}`}>
                  <div className="quiz-report-name">{completeTrackIntQuestionNum}. Сдача с пересечений ставок «комплит» со ставками на треке.</div>
                  {completeTrackIntersectionRecord.correct ? (
                    <>
                      <div className="quiz-report-verdict quiz-ok">✅ Верно</div>
                      <div className="quiz-report-detail">Ответ: {completeTrackIntersectionRecord.correctAnswer}</div>
                    </>
                  ) : (
                    <>
                      <div className="quiz-report-verdict quiz-err">❌ Неверно</div>
                      <div className="quiz-report-detail">Ваш ответ: {completeTrackIntersectionRecord.userAnswer}</div>
                      <div className="quiz-report-detail">Правильный ответ: {completeTrackIntersectionRecord.correctAnswer}</div>
                      {completeTrackIntersectionRecord.lines.length === 0 ? (
                        <div className="quiz-report-calc">Пересечений комплитов со ставками трека не найдено — сдачи нет.</div>
                      ) : (
                        <div className="quiz-report-calc">
                          {completeTrackIntersectionRecord.lines.map((line, li) => (
                            <div key={li} style={{ marginBottom: 8 }}>
                              <strong>{line.label}</strong><br/>
                              Лимит: {line.positionLimit}<br/>
                              Комплиты: {line.completeAmount}<br/>
                              Ставки трека: {line.effectiveTrackAmount}<br/>
                              Итого: {line.completeAmount} + {line.effectiveTrackAmount} = {line.totalAmount}<br/>
                              Сдача: {line.totalAmount} − {line.positionLimit} = {line.change}
                            </div>
                          ))}
                          <div className="quiz-report-total">
                            Итого сдача: {completeTrackIntersectionRecord.lines.map(l => l.change).join(" + ")} = {completeTrackIntersectionRecord.correctAnswer}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              {completeNumberPayoutRecord && (
                <div className={`quiz-report-item ${completeNumberPayoutRecord.correct ? "quiz-report-item--ok" : "quiz-report-item--err"}`}>
                  <div className="quiz-report-name">{completeNumberPayoutQuestionNum}. Какую общую сумму нужно поставить в номер с выигрышных ставок «комплит»?</div>
                  {completeNumberPayoutRecord.correct ? (
                    <>
                      <div className="quiz-report-verdict quiz-ok">✅ Верно</div>
                      <div className="quiz-report-detail">Ответ: {completeNumberPayoutRecord.correctAnswer}</div>
                    </>
                  ) : (
                    <>
                      <div className="quiz-report-verdict quiz-err">❌ Неверно</div>
                      <div className="quiz-report-detail">Ваш ответ: {completeNumberPayoutRecord.userAnswer}</div>
                      <div className="quiz-report-detail">Правильный ответ: {completeNumberPayoutRecord.correctAnswer}</div>
                      <div className="quiz-report-calc">
                        {completeNumberPayoutRecord.lines.map((line, li) => (
                          <div key={li} style={{ marginBottom: 8 }}>
                            <strong>{line.label}</strong> (играет по {line.playPerUnit})<br/>
                            {line.uniquePositions.length === 0 ? (
                              <span>Касаний нет (все позиции ограничены максимумом)<br/></span>
                            ) : (
                              line.uniquePositions.map((pos, pi) => (
                                <span key={pi}>{pos.positionLabel} → {pos.amount}<br/></span>
                              ))
                            )}
                            {line.uniquePositions.length > 0 && (
                              <>Итого: {line.uniqueTotal}<br/></>
                            )}
                          </div>
                        ))}
                        {completeNumberPayoutRecord.cappedLines.length > 0 && (
                          <>
                            <div style={{ marginTop: 8, marginBottom: 4 }}><strong>Позиции, ограниченные максимумом (пересечение комплитов):</strong></div>
                            {completeNumberPayoutRecord.cappedLines.map((cl, ci) => (
                              <div key={ci} style={{ marginBottom: 6 }}>
                                {cl.positionLabel} — {cl.completeLabels.join(" + ")} = {cl.sumPlayPerUnit} &gt; максимум {cl.cappedAmount}<br/>
                                → используем {cl.cappedAmount}
                              </div>
                            ))}
                          </>
                        )}
                        {completeNumberPayoutRecord.lines.every(l => l.uniquePositions.length === 0) && completeNumberPayoutRecord.cappedLines.length === 0 ? (
                          <div>Выигравших позиций комплитов нет — ответ 0.</div>
                        ) : (
                          <div className="quiz-report-total">
                            Итого: {[
                              ...completeNumberPayoutRecord.lines.filter(l => l.uniqueTotal > 0).map(l => `${l.uniqueTotal}`),
                              ...completeNumberPayoutRecord.cappedLines.map(cl => `${cl.cappedAmount}`),
                            ].join(" + ")} = {completeNumberPayoutRecord.correctAnswer}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
              {seriesFieldPayoutRecord && (
                <div className={`quiz-report-item ${seriesFieldPayoutRecord.correct ? "quiz-report-item--ok" : "quiz-report-item--err"}`}>
                  <div className="quiz-report-name">{seriesFieldPayoutQuestionNum}. Какую общую сумму нужно выставить в поле с выигрышных серий?</div>
                  {seriesFieldPayoutRecord.correct ? (
                    <>
                      <div className="quiz-report-verdict quiz-ok">✅ Верно</div>
                      <div className="quiz-report-detail">Ответ: {seriesFieldPayoutRecord.correctAnswer}</div>
                    </>
                  ) : (
                    <>
                      <div className="quiz-report-verdict quiz-err">❌ Неверно</div>
                      <div className="quiz-report-detail">Ваш ответ: {seriesFieldPayoutRecord.userAnswer}</div>
                      <div className="quiz-report-detail">Правильный ответ: {seriesFieldPayoutRecord.correctAnswer}</div>
                      <div className="quiz-report-calc">
                        {seriesFieldPayoutRecord.lines.map((line, li) => (
                          <div key={li} style={{ marginBottom: 8 }}>
                            <strong>{line.seriesLabel}</strong><br/>
                            Ставка: {line.amount} / {line.divisor} = {(line.amount / line.divisor).toFixed(2)}<br/>
                            Играет по: {line.playPerUnit}<br/>
                            {line.winningPositions.map(p => (
                              <span key={p.label}>{p.label} (фишек: {p.chips}) → {line.playPerUnit} × {p.chips} = {p.positionAmount}<br/></span>
                            ))}
                            Итого по серии: {line.seriesTotal}
                          </div>
                        ))}
                        <div className="quiz-report-total">
                          Итого: {seriesFieldPayoutRecord.lines.map(l => l.seriesTotal).join(" + ")} = {seriesFieldPayoutRecord.correctAnswer}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              {neighboursPayoutRecord && (
                <div className={`quiz-report-item ${neighboursPayoutRecord.correct ? "quiz-report-item--ok" : "quiz-report-item--err"}`}>
                  <div className="quiz-report-name">{neighboursPayoutQuestionNum}. Какую общую сумму нужно выставить в поле со ставок «соседи номера»?</div>
                  {neighboursPayoutRecord.correct ? (
                    <>
                      <div className="quiz-report-verdict quiz-ok">✅ Верно</div>
                      <div className="quiz-report-detail">Ответ: {neighboursPayoutRecord.correctAnswer}</div>
                    </>
                  ) : (
                    <>
                      <div className="quiz-report-verdict quiz-err">❌ Неверно</div>
                      <div className="quiz-report-detail">Ваш ответ: {neighboursPayoutRecord.userAnswer}</div>
                      <div className="quiz-report-detail">Правильный ответ: {neighboursPayoutRecord.correctAnswer}</div>
                      <div className="quiz-report-calc">
                        <div style={{ marginBottom: 6 }}>
                          <strong>Выпавший номер: {neighboursPayoutRecord.winningNumber}</strong>
                        </div>
                        <div style={{ marginBottom: 6 }}>
                          <strong>Выигравшие соседи:</strong><br/>
                          {neighboursPayoutRecord.winningLines.map((line, li) => (
                            <span key={li}>{line.label}: {line.totalAmount} / 5 = {line.amountPerNumber}<br/></span>
                          ))}
                          Всего с соседей: {neighboursPayoutRecord.winningLines.map(l => l.amountPerNumber).join(" + ")} = {neighboursPayoutRecord.winningNeighboursAmount}
                        </div>
                        <div style={{ marginBottom: 6 }}>
                          <strong>Уже играет на Straight Up {neighboursPayoutRecord.winningNumber}:</strong><br/>
                          Серии: {neighboursPayoutRecord.seriesContrib}<br/>
                          Цветные ставки: {neighboursPayoutRecord.colorContrib}<br/>
                          Кэш: {neighboursPayoutRecord.cashContrib}<br/>
                          Комплиты номеров: {neighboursPayoutRecord.numberCompletesContrib}<br/>
                          Комплит дюжины: {neighboursPayoutRecord.dozenCompleteContrib}<br/>
                          Итого уже играет: {neighboursPayoutRecord.existingAmount}
                          {neighboursPayoutRecord.existingAmount !== neighboursPayoutRecord.effectiveExistingAmount && (
                            <> → ограничено максимумом: {neighboursPayoutRecord.effectiveExistingAmount}</>
                          )}
                        </div>
                        <div style={{ marginBottom: 6 }}>
                          Максимум Straight Up: {settings.maxBet}<br/>
                          Свободный лимит: {settings.maxBet} − {neighboursPayoutRecord.effectiveExistingAmount} = {neighboursPayoutRecord.availableAmount}
                        </div>
                        <div className="quiz-report-total">
                          С соседей нужно поставить: {neighboursPayoutRecord.winningNeighboursAmount}<br/>
                          Можно поставить: min({neighboursPayoutRecord.winningNeighboursAmount}, {neighboursPayoutRecord.availableAmount}) = {neighboursPayoutRecord.correctAnswer}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {fieldRecord && (
                <div className={`quiz-report-item ${fieldRecord.correct ? "quiz-report-item--ok" : "quiz-report-item--err"}`}>
                  <div className="quiz-report-name">{fieldQuestionNum}. Общая сумма выплаты.</div>
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
                        {fieldRecord.entries.length === 0 ? (
                          <span>Нет выигрышных ставок — выплата 0</span>
                        ) : (
                          <>
                            {fieldRecord.entries.map((e, j) => {
                              const typeLabel = ({ straight: "Straight Up", split: "Split", street: "Street", corner: "Corner", sixline: "Six-Line" } as Record<string, string>)[e.positionType] ?? e.positionType;
                              return (
                                <div key={j} style={{ marginBottom: 6 }}>
                                  <strong>{typeLabel} {e.positionNums.join("-")}</strong><br/>
                                  Итоговая ставка: {e.amount}<br/>
                                  Коэффициент: {e.payoutMultiplier}<br/>
                                  {e.amount} × {e.payoutMultiplier} = {e.amount * e.payoutMultiplier}
                                </div>
                              );
                            })}
                            <div className="quiz-report-total">
                              Итого: {fieldRecord.entries.map(e => e.amount * e.payoutMultiplier).join(" + ")} = {fieldRecord.correctAnswer}
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {colorPayoutRecord && (
                <div className={`quiz-report-item ${colorPayoutRecord.correct ? "quiz-report-item--ok" : "quiz-report-item--err"}`}>
                  <div className="quiz-report-name">
                    {colorPayoutQuestionNum}. Выплата через {colorPayoutRecord.cashPayout}. Посчитайте остаток выплаты в «цвете».
                  </div>
                  {colorPayoutRecord.correct ? (
                    <>
                      <div className="quiz-report-verdict quiz-ok">✅ Верно</div>
                      <div className="quiz-report-detail">Ответ: {colorPayoutRecord.correctAnswer} фишек</div>
                    </>
                  ) : (
                    <>
                      <div className="quiz-report-verdict quiz-err">❌ Неверно</div>
                      <div className="quiz-report-detail">Ваш ответ: {colorPayoutRecord.userAnswer}</div>
                      <div className="quiz-report-detail">Правильный ответ: {colorPayoutRecord.correctAnswer}</div>
                      <div className="quiz-report-calc">
                        <div>Общая выплата: {colorPayoutRecord.totalPayout}</div>
                        <div>Выплата через кэш: {colorPayoutRecord.cashPayout}</div>
                        <div>Остаток выплаты: {colorPayoutRecord.totalPayout} − {colorPayoutRecord.cashPayout} = {colorPayoutRecord.colorAmount}</div>
                        <div>Номинал цвета: {colorPayoutRecord.colorNominal}</div>
                        <div>Количество цветных фишек: {colorPayoutRecord.colorAmount} / {colorPayoutRecord.colorNominal} = {colorPayoutRecord.correctAnswer}</div>
                        <div className="quiz-report-total">Правильный ответ: {colorPayoutRecord.correctAnswer} фишек</div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      </div>{/* /spin-report-outer */}

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
              <button className="reset-btn" onClick={() => setEditMode(false)}
                style={{ background: "rgba(180,60,40,0.15)", borderColor: "#7b241c", color: "#c0392b" }}>
                ✕ Закрыть
              </button>
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
