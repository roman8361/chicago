import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { BASE_WIDTH, BASE_HEIGHT } from "@/data/zones";
import { DEFAULT_TRACK_PARAMS, buildTrackZones, buildSectorBands, sectorFor, type TrackParams } from "@/data/trackZones";
import ruletImage from "@assets/rul_final_1782983519184.png";
import spinSoundUrl from "@assets/spin_2sec_1784187842896.mp4";
import { GameSettings } from "@/types/gameSettings";
import type { RouletteExercise, RouletteReportSnapshot, TrainingAnswer, TrainingProgress } from "@/types/attestation";
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

function NumericKeypad({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const appendDigit = (digit: string) => onChange(`${value}${digit}`);
  const removeLastDigit = () => onChange(value.slice(0, -1));

  return (
    <div className="numeric-keypad" aria-label="Цифровая панель">
      {["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].map(digit => (
        <button
          key={digit}
          type="button"
          className="numeric-keypad-btn"
          onClick={() => appendDigit(digit)}
          aria-label={`Добавить ${digit}`}
        >
          {digit}
        </button>
      ))}
      <button
        type="button"
        className="numeric-keypad-btn numeric-keypad-btn--backspace"
        onClick={removeLastDigit}
        aria-label="Удалить последнюю цифру"
      >
        ⌫
      </button>
    </div>
  );
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
  /** Per-source capped amounts that make up normalAmountCapped */
  colorCapped: number;
  cashCapped: number;
  seriesCapped: number;
  neighboursCapped: number;
  /** Capped normal bets (color + cash + series + neighbours) on this position */
  normalAmountCapped: number;
  /** Complete payout amount added separately to Straight of drawn number (bypasses normal max); 0 on all other positions */
  completeAmountAdded: number;
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
  typeLabel: string;        // "Straight Up" | "Split" | "Street" | "Corner" | "Six-Line"
  limitMultiplier: number;  // 1 | 2 | 3 | 4 | 6
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
  // ── Field side ─────────────────────────────────────────────────────────────
  colorAmount: number;        // color chip field contribution
  cashAmount: number;         // cash chip field contribution
  completeAmount: number;     // complete bet field contribution
  fieldTotal: number;         // colorAmount + cashAmount + completeAmount
  fieldPrevChange: number;    // max(0, fieldTotal − positionLimit) — returned in field question
  acceptedField: number;      // min(fieldTotal, positionLimit) — what actually sits on position
  // ── Track side ─────────────────────────────────────────────────────────────
  trackTotal: number;         // raw sum of all track bets (series + neighbours) on this position
  trackPrevChange: number;    // max(0, trackTotal − positionLimit) — returned in track question
  acceptedTrack: number;      // min(trackTotal, positionLimit) — what actually sits on position
  // ── Intersection ───────────────────────────────────────────────────────────
  combinedTotal: number;      // acceptedField + acceptedTrack
  change: number;             // max(0, combinedTotal − positionLimit) — the only new change
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

interface CompleteNumberPayoutContrib {
  completeLabel: string;
  playPerUnit: number;
  stakeOnPos: number;  // playPerUnit × limitMultiplier
}

interface CompleteNumberPayoutWinningPos {
  positionLabel: string;
  limitMultiplier: number;
  contributions: CompleteNumberPayoutContrib[];
  totalStake: number;
  positionLimit: number;
  atMax: boolean;                // totalStake >= positionLimit
  contributionToAnswer: number;  // maxBet if atMax, else sum of playPerUnit
}

interface CompleteNumberPayoutQuizRecord {
  userAnswer: number;
  correctAnswer: number;
  correct: boolean;
  drawnNumber: number;
  winningPositions: CompleteNumberPayoutWinningPos[];
}

interface SeriesFieldPayoutPositionSummary {
  positionId: string;
  positionLabel: string;
  limitMultiplier: number;
  seriesContributions: Array<{
    seriesLabel: string;
    amount: number;       // original amount placed on the series
    playPerUnit: number;  // how much the series plays per unit
    chips: number;        // chip multiplier for this position in the series layout
    contribution: number; // playPerUnit × chips — actual stake on this position
  }>;
  totalSeriesAmount: number;  // sum of contributions across all series on this position
  colorAmount: number;
  cashAmount: number;
  completeAmount: number;
  fieldTotal: number;
  positionLimit: number;
  effectiveOccupied: number;
  freeCapacity: number;
  acceptedAmount: number;
}

interface SeriesFieldPayoutQuizRecord {
  userAnswer: number;
  correctAnswer: number;
  correct: boolean;
  positions: SeriesFieldPayoutPositionSummary[];
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
  winningNeighbours: NeighboursPayoutWinLine[];
  totalNeighboursAmount: number;    // sum of amountPerNumber across all winning neighbours
  cappedNeighboursAmount: number;   // min(totalNeighboursAmount, positionLimit)
  colorContrib: number;
  cashContrib: number;
  completeContrib: number;
  seriesContrib: number;
  fieldTotal: number;
  positionLimit: number;
  effectiveOccupied: number;
  freeCapacity: number;
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

/**
 * Return only the physical field positions that win inside active series for
 * the drawn number. A series contributes its exact configured bet position,
 * not every position containing the winning number.
 */
function getWinningSeriesPositionIds(
  activeSeries: TrackBet[],
  drawnNumber: number,
  rules: Record<string, unknown>,
): Set<string> {
  type TrackRuleT = {
    bets: Record<string, Array<{ numbers: number[]; chips: number }>>;
  };
  const blocked = new Set<string>();
  const trackRules = rules.trackBets as Record<string, TrackRuleT> | undefined;

  for (const trackBet of activeSeries) {
    const trackRule = trackRules?.[trackBet.type];
    if (!trackRule) continue;

    for (const [categoryKey, entries] of Object.entries(trackRule.bets)) {
      const category = DOZEN_COMPLETE_CATEGORY_MAP[categoryKey];
      if (!category || !Array.isArray(entries)) continue;

      for (const entry of entries) {
        if (!Array.isArray(entry.numbers) || !entry.numbers.includes(drawnNumber)) continue;
        const positionId = findPositionId(category.betType, entry.numbers);
        if (positionId) blocked.add(positionId);
      }
    }
  }

  return blocked;
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
  const hasNeighboursBetsNow = game.neighboursBets.length > 0;
  return seriesWonNow ? { kind: "seriesFieldPayout" } : hasNeighboursBetsNow ? { kind: "neighboursPayout" } : { kind: "field" };
}

function getInitialAttestationQuizPhase(savedGame: GameState): QuizPhase {
  return savedGame.numberCompleteBets.length > 0 || savedGame.dozenCompleteBet
    ? { kind: "completes" }
    : savedGame.chips.length > 0 || savedGame.cashChipStacks.length > 0
      ? { kind: "completesIntersection" }
      : savedGame.trackBets.length > 0 || savedGame.neighboursBets.length > 0
        ? { kind: "trackIntersection" }
        : { kind: "field" };
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
  /** Total from the "complete → winning number" question; placed as a single
   *  separate bet on Straight of drawnNumber, bypassing the normal position cap. */
  completePayoutAmount: number,
): WinningFieldEntry[] {
  const drawnNumber = game.drawnNumber;
  const straightId  = `su-${drawnNumber}`;

  // ── Step A: Internally spread winning completes across their physical positions ──
  // These amounts are NEVER displayed on the field. They reduce the free capacity
  // available to normal bets (color, cash, series, neighbours) on each position.
  type CompleteBetRuleT = { number: number; chipsRequired: number; bets: Record<string, Array<{ numbers: number[]; chips: number }>> };
  type DozenBetRuleT   = { dozen: number; chipsRequired: number; bets: Record<string, Array<{ numbers: number[]; chips: number }>> };

  const completeInternal = new Map<string, number>(); // positionId → summed internal complete amount
  const addInternal = (posId: string, amount: number) =>
    completeInternal.set(posId, (completeInternal.get(posId) ?? 0) + amount);

  // Number completes
  for (const ncb of game.numberCompleteBets) {
    const completeRule = (rules.completeBets as CompleteBetRuleT[])?.find(cb => cb.number === ncb.number);
    if (!completeRule) continue;
    const { playPerUnit } = calcOneCompleteChange(ncb.amount, ncb.chipsRequired, maxBet, completeMultiplicity);
    if (playPerUnit <= 0) continue;
    for (const [catKey, catInfo] of Object.entries(DOZEN_COMPLETE_CATEGORY_MAP)) {
      const entries = (completeRule.bets as Record<string, Array<{ numbers: number[]; chips: number }>>)[catKey];
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (!Array.isArray(entry.numbers) || !entry.numbers.includes(drawnNumber)) continue;
        const posId = findPositionId(catInfo.betType, entry.numbers);
        if (!posId) continue;
        addInternal(posId, playPerUnit * entry.chips);
      }
    }
  }

  // Dozen complete
  if (game.dozenCompleteBet) {
    const { amount, dozen } = game.dozenCompleteBet;
    const dozenNum = dozen === "1ST_12" ? 1 : dozen === "2ND_12" ? 2 : 3;
    const dozenRule = (rules.dozenComplete as { dozens: DozenBetRuleT[] })?.dozens?.find(d => d.dozen === dozenNum);
    if (dozenRule) {
      const { playPerUnit } = calcOneCompleteChange(amount, dozenRule.chipsRequired, maxBet, completeMultiplicity);
      if (playPerUnit > 0) {
        for (const [catKey, catInfo] of Object.entries(DOZEN_COMPLETE_CATEGORY_MAP)) {
          const entries = (dozenRule.bets as Record<string, Array<{ numbers: number[]; chips: number }>>)[catKey];
          if (!Array.isArray(entries)) continue;
          for (const entry of entries) {
            if (!Array.isArray(entry.numbers) || !entry.numbers.includes(drawnNumber)) continue;
            const posId = findPositionId(catInfo.betType, entry.numbers);
            if (!posId) continue;
            addInternal(posId, playPerUnit * entry.chips);
          }
        }
      }
    }
  }

  // ── Step B: Collect normal bets (color, cash, series, neighbours) ─────────────
  const colorAmts      = new Map<string, number>(); // color chips: count * chipValue
  const colorCnts      = new Map<string, number>(); // color chips: raw count (for display)
  const cashAmts       = new Map<string, number>(); // field cash chips
  const seriesAmts     = new Map<string, number>(); // series only
  const neighboursAmts = new Map<string, number>(); // neighbours only

  const addColor = (id: string, count: number, amount: number) => {
    colorAmts.set(id, (colorAmts.get(id) ?? 0) + amount);
    colorCnts.set(id, (colorCnts.get(id) ?? 0) + count);
  };
  const addCash       = (id: string, amount: number) => cashAmts.set(id,       (cashAmts.get(id)       ?? 0) + amount);
  const addSeries     = (id: string, amount: number) => seriesAmts.set(id,     (seriesAmts.get(id)     ?? 0) + amount);
  const addNeighbours = (id: string, amount: number) => neighboursAmts.set(id, (neighboursAmts.get(id) ?? 0) + amount);

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
        addSeries(positionId, playPerUnit * entry.chips);
      }
    }
  }

  // 4. Neighbours → Straight Up of drawnNumber
  const neighboursMap = rules.neighbours as Record<string, number[]> | undefined;
  if (neighboursMap) {
    for (const nb of game.neighboursBets) {
      const nums = neighboursMap[String(nb.number)];
      if (!Array.isArray(nums) || !nums.includes(drawnNumber)) continue;
      addNeighbours(straightId, nb.baseAmount);
    }
  }

  // ── Step C: Build result entries with complete-aware capacity ─────────────────
  const allIds = new Set([
    ...colorAmts.keys(), ...cashAmts.keys(),
    ...seriesAmts.keys(), ...neighboursAmts.keys(),
  ]);
  // Ensure Straight of drawnNumber is present when there is a complete payout to add.
  if (completePayoutAmount > 0) allIds.add(straightId);

  const result: WinningFieldEntry[] = [];

  for (const positionId of allIds) {
    const pos = BET_POSITIONS_MAP.get(positionId);
    if (!pos) continue;
    const colorAmt      = colorAmts.get(positionId)      ?? 0;
    const colorCnt      = colorCnts.get(positionId)      ?? 0;
    const cashAmt       = cashAmts.get(positionId)        ?? 0;
    const seriesAmt     = seriesAmts.get(positionId)      ?? 0;
    const neighboursAmt = neighboursAmts.get(positionId)  ?? 0;

    const limitMult     = BET_COVER_COUNT[pos.type] ?? 1;
    const positionLimit = maxBet * limitMult;

    // Internal complete occupies part of this position's limit (capped at limit).
    const completeOccupied = Math.min(completeInternal.get(positionId) ?? 0, positionLimit);
    // Free capacity remaining after the internal complete stake.
    let remaining = Math.max(0, positionLimit - completeOccupied);

    // Sequential capping: color → cash → series → neighbours, each consuming remaining capacity.
    const colorCapped      = Math.min(colorAmt,      remaining); remaining -= colorCapped;
    const cashCapped       = Math.min(cashAmt,       remaining); remaining -= cashCapped;
    const seriesCapped     = Math.min(seriesAmt,     remaining); remaining -= seriesCapped;
    const neighboursCapped = Math.min(neighboursAmt, remaining);
    const normalCapped     = colorCapped + cashCapped + seriesCapped + neighboursCapped;

    // Complete payout amount is added ONLY to Straight Up of drawnNumber and is
    // NOT subject to the normal position cap (separate, unconditional stake).
    const completeAdded = (positionId === straightId) ? completePayoutAmount : 0;

    const finalAmount = normalCapped + completeAdded;
    if (finalAmount <= 0) continue;

    // Determine display mode.
    const hasOnlyColor = colorCapped > 0 && cashCapped === 0 && seriesCapped === 0 && neighboursCapped === 0;
    const hasOnlyCash  = colorCapped === 0 && cashCapped > 0 && seriesCapped === 0 && neighboursCapped === 0;
    let displayAs: WinningFieldEntry["displayAs"];
    if (completeAdded > 0) {
      displayAs = "merged";
    } else if (hasOnlyColor) {
      displayAs = "color";
    } else if (hasOnlyCash) {
      displayAs = "cash";
    } else {
      displayAs = "merged";
    }

    result.push({
      positionId,
      amount: finalAmount,
      positionType: pos.type as WinningFieldEntry["positionType"],
      positionNums: [...pos.numbers].sort((a, b) => a - b),
      payoutMultiplier: payoutMap[pos.type] ?? 0,
      displayAs,
      colorCount: colorCnt,
      colorCapped,
      cashCapped,
      seriesCapped,
      neighboursCapped,
      normalAmountCapped: normalCapped,
      completeAmountAdded: completeAdded,
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

// ── Complete-bet helpers ──────────────────────────────────────────────────────

type CompleteBetsArray = ReturnType<typeof import("@/lib/rulesContext").useRouletteRules>["getAllRules"] extends () => infer R
  ? R extends { completeBets: infer C } ? C : never
  : never;

/** All roulette numbers covered by any position of the complete bet centred on `completeNumber`. */
function getNumbersCoveredByComplete(
  completeNumber: number,
  completeBets: { number: number; bets: { straightUp: { numbers: number[] }[]; splits: { numbers: number[] }[]; streets: { numbers: number[] }[]; corners: { numbers: number[] }[]; sixLines: { numbers: number[] }[] } }[],
): number[] {
  const rule = completeBets.find(cb => cb.number === completeNumber);
  if (!rule) return [];
  const nums = new Set<number>();
  const { straightUp, splits, streets, corners, sixLines } = rule.bets;
  for (const pos of [...straightUp, ...splits, ...streets, ...corners, ...sixLines]) {
    for (const n of pos.numbers) nums.add(n);
  }
  return Array.from(nums);
}

/** True if any bet position of the complete on `completeNumber` covers `winningNumber`. */
function completeTouchesNumber(
  completeNumber: number,
  winningNumber: number,
  completeBets: Parameters<typeof getNumbersCoveredByComplete>[1],
): boolean {
  return getNumbersCoveredByComplete(completeNumber, completeBets).includes(winningNumber);
}

// ── Component ─────────────────────────────────────────────────────────────────
interface RouletteTableProps {
  mode?: RouletteMode;
  attestationExercise?: RouletteExercise;
  readOnlyReport?: boolean;
  savedReport?: RouletteReportSnapshot;
  restoredProgress?: TrainingProgress | null;
  startWithSpinAnimation?: boolean;
  autoGenerateRound?: boolean;
  onRoundGenerated?: (game: GameState) => void;
  onBackHome?: () => void;
  onBackToAttestation?: () => void;
  onCompleteAttestation?: (answers: TrainingAnswer[], reportSnapshot: RouletteReportSnapshot) => string | null;
  onAnswerRecorded?: (answers: TrainingAnswer[], currentQuestionIndex: number) => void;
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

export type RouletteMode = "PRACTICE" | "ATTESTATION";

export default function RouletteTable({
  mode = "PRACTICE",
  attestationExercise,
  readOnlyReport = false,
  savedReport,
  restoredProgress,
  startWithSpinAnimation = false,
  autoGenerateRound = false,
  onRoundGenerated,
  onBackHome,
  onBackToAttestation,
  onCompleteAttestation,
  onAnswerRecorded,
  settings, onOpenSettings, onOpenDebug,
  showGrid, setShowGrid,
  showTrack, setShowTrack,
  showDozens, setShowDozens,
  editMode, setEditMode,
}: RouletteTableProps) {
  const isAttestationMode = mode === "ATTESTATION";
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
  const [attestationCompletionError, setAttestationCompletionError] = useState<string | null>(null);
  const progressAnswersRef = useRef<TrainingAnswer[]>([]);

  const isSpinningRef    = useRef(false);
  const spinTimeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generateRoundRef = useRef<() => void>(() => {});
  const audioRef         = useRef<HTMLAudioElement | null>(null);

  const [gridParams,   setGridParams]   = useState<GridParams>(loadGrid);
  const [trackParams,  setTrackParams]  = useState<TrackParams>(loadTrack);
  const [dozensParams, setDozensParams] = useState<DozensParams>(loadDozens);

  const { getPayouts, getTrackBetRule, getAllRules, getCompleteBetRule, getNeighboursRule } = useRouletteRules();

  const revealAttestationExercise = useCallback((savedGame: GameState) => {
    setGame(savedGame);
    setInitialRoundSnapshot(JSON.parse(JSON.stringify(savedGame)) as GameState);
    progressAnswersRef.current = (restoredProgress?.answers ?? []).map((answer) => ({ ...answer }));
    setActiveSeries(
      SERIES_QUIZ_ORDER
        .map((type) => savedGame.trackBets.find((bet) => bet.type === type))
        .filter((bet): bet is TrackBet => bet !== undefined),
    );
    setQuizPhase(getInitialAttestationQuizPhase(savedGame));
    setAttestationCompletionError(null);
    setEditMode(false);
  }, [restoredProgress, setEditMode]);

  const revealSavedReport = useCallback((savedGame: GameState, snapshot: RouletteReportSnapshot) => {
    setGame(savedGame);
    setInitialRoundSnapshot(JSON.parse(JSON.stringify(savedGame)) as GameState);
    setActiveSeries(
      SERIES_QUIZ_ORDER
        .map((type) => savedGame.trackBets.find((bet) => bet.type === type))
        .filter((bet): bet is TrackBet => bet !== undefined),
    );
    const saved = snapshot as Record<string, unknown>;
    const restore = <T,>(key: string, setter: React.Dispatch<React.SetStateAction<T | null>>) => {
      const value = saved[key];
      if (value !== undefined && value !== null) setter(value as T);
    };
    restore<CompleteQuizRecord>("completesRecord", setCompletesRecord);
    restore<IntersectionQuizRecord>("intersectionRecord", setIntersectionRecord);
    restore<SeriesQuizRecord>("seriesRecord", setSeriesRecord);
    restore<TrackIntersectionQuizRecord>("trackIntersectionRecord", setTrackIntersectionRecord);
    restore<TrackFieldIntersectionQuizRecord>("trackFieldIntersectionRecord", setTrackFieldIntersectionRecord);
    restore<CompleteTrackIntersectionQuizRecord>("completeTrackIntersectionRecord", setCompleteTrackIntersectionRecord);
    restore<CompleteNumberPayoutQuizRecord>("completeNumberPayoutRecord", setCompleteNumberPayoutRecord);
    restore<SeriesFieldPayoutQuizRecord>("seriesFieldPayoutRecord", setSeriesFieldPayoutRecord);
    restore<NeighboursPayoutQuizRecord>("neighboursPayoutRecord", setNeighboursPayoutRecord);
    restore<FieldQuizRecord>("fieldRecord", setFieldRecord);
    restore<ColorPayoutQuizRecord>("colorPayoutRecord", setColorPayoutRecord);
    setQuizPhase({ kind: "report" });
    setEditMode(false);
  }, [setEditMode]);

  const recordAttestationAnswer = useCallback((
    questionId: string,
    question: string,
    record: { userAnswer: number; correctAnswer: number; correct: boolean },
  ) => {
    if (!isAttestationMode || !onAnswerRecorded) return;
    const answer: TrainingAnswer = {
      questionId,
      question,
      answer: record.userAnswer,
      correctAnswer: record.correctAnswer,
      correct: record.correct,
    };
    const nextByQuestionId = new Map(
      progressAnswersRef.current.map((savedAnswer) => [savedAnswer.questionId, savedAnswer]),
    );
    nextByQuestionId.set(questionId, answer);
    const answers = [...nextByQuestionId.values()];
    progressAnswersRef.current = answers;
    onAnswerRecorded(answers, answers.length);
  }, [isAttestationMode, onAnswerRecorded]);

  const playSpinAnimation = useCallback((onFinished: () => void) => {
    if (isSpinningRef.current) return;
    isSpinningRef.current = true;
    setIsSpinning(true);

    const audio = audioRef.current ?? new Audio(spinSoundUrl);
    if (!audioRef.current) {
      audio.preload = "auto";
      audio.loop = false;
      audioRef.current = audio;
    }
    audio.pause();
    audio.currentTime = 0;
    void audio.play().catch(err => console.warn("Spin audio play failed:", err));

    spinTimeoutRef.current = setTimeout(() => {
      isSpinningRef.current = false;
      spinTimeoutRef.current = null;
      setIsSpinning(false);
      onFinished();
    }, 2000);
  }, []);

  // In ATTESTATION mode the exercise is an immutable, pre-generated round.
  // This effect only reads and displays it; it never calls the generator.
  useEffect(() => {
    if (!isAttestationMode || !attestationExercise) return;

    const savedGame = attestationExercise.data;
    if (readOnlyReport && savedReport) {
      isSpinningRef.current = false;
      setIsSpinning(false);
      revealSavedReport(savedGame, savedReport);
      return;
    }
    if (startWithSpinAnimation) {
      setGame(null);
      setInitialRoundSnapshot(JSON.parse(JSON.stringify(savedGame)) as GameState);
      setQuizPhase(null);
      setActiveSeries([]);
      playSpinAnimation(() => revealAttestationExercise(savedGame));
      return;
    }

    isSpinningRef.current = false;
    setIsSpinning(false);
    revealAttestationExercise(savedGame);
  }, [
    isAttestationMode,
    attestationExercise,
    startWithSpinAnimation,
    playSpinAnimation,
    revealAttestationExercise,
    readOnlyReport,
    savedReport,
    revealSavedReport,
  ]);

  // A resumed attestation uses the immutable exercise already loaded above. It
  // restores the answered question ids and the small amount of record state
  // needed by the next calculation, but never generates or spins a new round.
  useEffect(() => {
    if (!isAttestationMode || !attestationExercise || !game || startWithSpinAnimation) return;

    const savedAnswers = restoredProgress?.answers ?? [];
    progressAnswersRef.current = savedAnswers.map((answer) => ({ ...answer }));
    if (savedAnswers.length === 0) return;

    const answerById = new Map(savedAnswers.map((answer) => [answer.questionId, answer]));
    const basicRecord = (questionId: string) => {
      const answer = answerById.get(questionId);
      return answer
        ? { userAnswer: Number(answer.answer) || 0, correctAnswer: Number(answer.correctAnswer) || 0, correct: answer.correct }
        : null;
    };

    const completes = basicRecord("completes");
    if (completes) setCompletesRecord({ ...completes, lines: [] });
    const intersection = basicRecord("completes-intersection");
    if (intersection) setIntersectionRecord({ ...intersection, lines: [] });
    const series = basicRecord("series");
    if (series) setSeriesRecord({ ...series, lines: [] });
    const trackIntersection = basicRecord("track-intersection");
    if (trackIntersection) setTrackIntersectionRecord({ ...trackIntersection, lines: [] });
    const trackFieldIntersection = basicRecord("track-field-intersection");
    if (trackFieldIntersection) setTrackFieldIntersectionRecord({ ...trackFieldIntersection, lines: [] });
    const completeNumberPayout = basicRecord("complete-number-payout");
    if (completeNumberPayout) {
      setCompleteNumberPayoutRecord({
        ...completeNumberPayout,
        drawnNumber: game.drawnNumber,
        winningPositions: [],
      });
    }
    const seriesFieldPayout = basicRecord("series-field-payout");
    if (seriesFieldPayout) setSeriesFieldPayoutRecord({ ...seriesFieldPayout, positions: [] });
    const neighboursPayout = basicRecord("neighbours-payout");
    if (neighboursPayout) {
      setNeighboursPayoutRecord({
        ...neighboursPayout,
        winningNeighbours: [],
        totalNeighboursAmount: 0,
        cappedNeighboursAmount: 0,
        colorContrib: 0,
        cashContrib: 0,
        completeContrib: 0,
        seriesContrib: 0,
        fieldTotal: 0,
        positionLimit: Math.max(1, settings.maxBet),
        effectiveOccupied: 0,
        freeCapacity: Math.max(1, settings.maxBet),
        winningNumber: game.drawnNumber,
      });
    }
    const field = basicRecord("field-payout");
    if (field) setFieldRecord({ ...field, entries: [] });
    const color = basicRecord("color-payout");
    if (color) {
      setColorPayoutRecord({
        ...color,
        cashPayout: 0,
        totalPayout: Number(answerById.get("field-payout")?.correctAnswer) || 0,
        colorAmount: (Number(answerById.get("color-payout")?.correctAnswer) || 0) * (settings.chipValue ?? 10),
        colorNominal: settings.chipValue ?? 10,
      });
    }

    const hasAnswer = (questionId: string) => answerById.has(questionId);
    const hasCompletesQuestion = settings.completeField === "yes" || settings.completeDozen === "yes";
    const hasFieldBets = game.chips.length > 0 || game.cashChipStacks.length > 0;
    const hasTrackBets = activeSeries.length > 0 || game.neighboursBets.length > 0;
    const hasTrackFieldBets = hasTrackBets && (
      game.chips.length > 0
      || game.cashChipStacks.length > 0
      || !!game.dozenCompleteBet
      || game.numberCompleteBets.length > 0
    );
    const anyComplete = !!game.dozenCompleteBet || game.numberCompleteBets.length > 0;
    const rules = getAllRules();
    const anySeriesWon = activeSeries.some((trackBet) => {
      const rule = (rules.trackBets as Record<string, { bets: Record<string, Array<{ numbers: number[] }>> }>)[trackBet.type];
      return !!rule && Object.values(rule.bets).some((entries) =>
        Array.isArray(entries) && entries.some((entry) => entry.numbers.includes(game.drawnNumber)),
      );
    });

    const nextPhase: QuizPhase =
      (hasCompletesQuestion && !hasAnswer("completes")) ? { kind: "completes" } :
      (hasFieldBets && !hasAnswer("completes-intersection")) ? { kind: "completesIntersection" } :
      (activeSeries.length > 0 && !hasAnswer("series")) ? { kind: "series" } :
      (hasTrackBets && !hasAnswer("track-intersection")) ? { kind: "trackIntersection" } :
      (hasTrackFieldBets && !hasAnswer("track-field-intersection")) ? { kind: "trackFieldIntersection" } :
      (anyComplete && !hasAnswer("complete-number-payout")) ? { kind: "completeNumberPayout" } :
      (anySeriesWon && !hasAnswer("series-field-payout")) ? { kind: "seriesFieldPayout" } :
      (game.neighboursBets.length > 0 && !hasAnswer("neighbours-payout")) ? { kind: "neighboursPayout" } :
      !hasAnswer("field-payout") ? { kind: "field" } :
      (!hasAnswer("color-payout") && generateColorPayout(
        Number(answerById.get("field-payout")?.correctAnswer) || 0,
        settings.chipValue ?? 10,
      )) ? { kind: "colorPayout" } :
      { kind: "report" };

    setQuizPhase(nextPhase);
  }, [
    isAttestationMode,
    attestationExercise,
    game,
    restoredProgress,
    startWithSpinAnimation,
    activeSeries,
    settings.completeField,
    settings.completeDozen,
    settings.maxBet,
    settings.chipValue,
    getAllRules,
  ]);

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
  // Completes: show acceptedAmount immediately after the first (completes) question is answered.
  // Do NOT wait for the completesIntersection (field change) question.
  const completesDisplayAmounts = useMemo(() => {
    if (!settings.showBetBeforeChange || !completesRecord) return null;
    const map = new Map<string, number>();
    for (const l of completesRecord.lines) {
      if (l.change > 0) map.set(l.label, l.acceptedAmount);
    }
    return map;
  }, [settings.showBetBeforeChange, completesRecord]);

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
    if (quizPhase.kind !== "field" && quizPhase.kind !== "colorPayout") return null;
    const maxBet = Math.max(1, settings.maxBet);
    const mult   = Math.max(10, Math.min(1000, settings.multiplicity ?? 10));
    const chipValue = settings.chipValue ?? 10;
    const completeMultiplicity = Math.max(1, settings.completeMultiplicity ?? 10);
    const completePayoutAmount = completeNumberPayoutRecord?.correctAnswer ?? 0;
    return computeWinningField(game, activeSeries, maxBet, mult, chipValue, completeMultiplicity, getAllRules(), payoutMap, completePayoutAmount);
  }, [game, quizPhase, activeSeries, settings.maxBet, settings.multiplicity, settings.chipValue, settings.completeMultiplicity, getAllRules, payoutMap, completeNumberPayoutRecord]);

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

    const getCompletePhysicalPositions = (num: number): Set<string> => {
      const positions = new Set<string>();
      const rule = getCompleteBetRule(num);
      if (!rule) return positions;
      for (const [category, entries] of Object.entries(rule.bets)) {
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
          const positionId = findPositionId(
            DOZEN_COMPLETE_CATEGORY_MAP[category]?.betType ?? "straight",
            entry.numbers,
          );
          if (positionId) positions.add(positionId);
        }
      }
      return positions;
    };

    const completeNumberPool = Array.from({ length: 37 }, (_, i) => i)
      .filter((num) => !!getCompleteBetRule(num) && currentChipPosMap.has(`su-${num}`));

    if (count === 2 || count === 3) {
      // The first two completes keep the existing pair constraints. For three
      // completes the third is selected after the winning number is known.
      const dozenForNumber = (num: number): "1ST_12" | "2ND_12" | "3RD_12" =>
        num <= 12 ? "1ST_12" : num <= 24 ? "2ND_12" : "3RD_12";
      const allowedFirst = settings.completeDozen === "yes" && dozenCompleteBet
        ? completeNumberPool.filter((num) => dozenForNumber(num) === dozenCompleteBet.dozen)
        : completeNumberPool;
      const allowedSecond = settings.completeDozen === "yes" && dozenCompleteBet
        ? completeNumberPool.filter((num) => dozenForNumber(num) !== dozenCompleteBet.dozen)
        : completeNumberPool;

      const pairs: Array<[number, number]> = [];
      for (const first of allowedFirst) {
        const firstPositions = getCompletePhysicalPositions(first);
        for (const second of allowedSecond) {
          if (first === second) continue;
          const secondPositions = getCompletePhysicalPositions(second);
          if ([...firstPositions].some((positionId) => secondPositions.has(positionId))) {
            pairs.push([first, second]);
          }
        }
      }

      if (pairs.length === 0) return { bets: [], excludedIds };
      const [firstNumber, secondNumber] = pairs[Math.floor(Math.random() * pairs.length)];
      selectedNumbers = [firstNumber, secondNumber];

      if (count === 3) {
        const remainingPool = completeNumberPool.filter(
          (num) => num !== firstNumber && num !== secondNumber,
        );
        let thirdPool = remainingPool;
        if (settings.completeDozen === "yes" && dozenCompleteBet) {
          const usedDozens = new Set([dozenForNumber(firstNumber), dozenForNumber(secondNumber)]);
          const remainingDozen = (["1ST_12", "2ND_12", "3RD_12"] as const)
            .find((dozen) => !usedDozens.has(dozen));
          if (remainingDozen) {
            const inRemainingDozen = remainingPool.filter(
              (num) => dozenForNumber(num) === remainingDozen,
            );
            if (inRemainingDozen.length > 0) thirdPool = inRemainingDozen;
          }
        }
        if (thirdPool.length === 0) return { bets: [], excludedIds };
        selectedNumbers.push(thirdPool[Math.floor(Math.random() * thirdPool.length)]);
      }
    } else if (settings.completeDozen === "yes" && dozenCompleteBet) {
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
    const allowedPlayUnits = (rule: { chipsRequired: number }): number[] => {
      const minPlayUnit = Math.ceil(minBet / multiplicity) * multiplicity;
      const maxPlayUnit = Math.floor(maxBet / multiplicity) * multiplicity;
      const values: number[] = [];
      for (let value = minPlayUnit; value <= maxPlayUnit; value += multiplicity) {
        // A value is represented by an amount inside the same range used by
        // the existing generator, after its multiplicity rounding.
        if (value * rule.chipsRequired >= minPlayUnit * rule.chipsRequired
          && value * rule.chipsRequired <= maxBet * rule.chipsRequired) {
          values.push(value);
        }
      }
      return values;
    };

    const selectedPlayUnits = new Map<number, number>();
    if ((count === 2 || count === 3) && selectedNumbers.length >= 2) {
      const firstRule = getCompleteBetRule(selectedNumbers[0]);
      const secondRule = getCompleteBetRule(selectedNumbers[1]);
      if (!firstRule || !secondRule) return { bets: [], excludedIds };
      const firstValues = allowedPlayUnits(firstRule);
      const secondValues = allowedPlayUnits(secondRule);
      const distinctPairs: Array<[number, number]> = [];
      const allPairs: Array<[number, number]> = [];
      for (const firstValue of firstValues) {
        for (const secondValue of secondValues) {
          allPairs.push([firstValue, secondValue]);
          if (firstValue !== secondValue) distinctPairs.push([firstValue, secondValue]);
        }
      }
      const valuePairs = distinctPairs.length > 0 ? distinctPairs : allPairs;
      if (valuePairs.length === 0) return { bets: [], excludedIds };
      const [firstValue, secondValue] = valuePairs[Math.floor(Math.random() * valuePairs.length)];
      selectedPlayUnits.set(selectedNumbers[0], firstValue);
      selectedPlayUnits.set(selectedNumbers[1], secondValue);

      if (count === 3) {
        const thirdRule = getCompleteBetRule(selectedNumbers[2]);
        if (!thirdRule) return { bets: [], excludedIds };
        const thirdValues = allowedPlayUnits(thirdRule);
        if (thirdValues.length === 0) return { bets: [], excludedIds };
        const distinctThirdValues = thirdValues.filter(
          (value) => value !== firstValue && value !== secondValue,
        );
        const values = distinctThirdValues.length > 0 ? distinctThirdValues : thirdValues;
        selectedPlayUnits.set(
          selectedNumbers[2],
          values[Math.floor(Math.random() * values.length)],
        );
      }
    }

    for (const num of selectedNumbers) {
      const rule = getCompleteBetRule(num);
      if (!rule) continue;
      const pos = currentChipPosMap.get(`su-${num}`);
      if (!pos) continue;
      const selectedPlayUnit = selectedPlayUnits.get(num);
      if (selectedPlayUnit !== undefined) {
        const amount = selectedPlayUnit * rule.chipsRequired;
        bets.push({ number: num, chipsRequired: rule.chipsRequired, amount, position: pos });
        excludedIds.add(`su-${num}`);
        continue;
      }
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
  const generateRound = useCallback((retryAttempt = 0) => {
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

    // ── Series covered set (for winning-number constraint) ────────────────────
    // Use the UNION of every active series. The winning number may therefore
    // make several series win at once; it must not be limited to one randomly
    // selected series.
    const trackRules = getAllRules().trackBets as Record<string, { numbers: number[] }>;
    let seriesCoveredSet: Set<number> | null = null;
    if (trackBets.length > 0) {
      seriesCoveredSet = new Set<number>();
      for (const trackBet of trackBets) {
        for (const number of trackRules[trackBet.type]?.numbers ?? []) {
          seriesCoveredSet.add(number);
        }
      }
    }

    // ── Dozen complete bet ──────────────────────────────────────────────────────
    let dozenCompleteBet: DozenCompleteBet | undefined;
    if (settings.completeDozen === "yes") {
      const DOZEN_IDS = ["1ST_12", "2ND_12", "3RD_12"] as const;
      const idx = Math.floor(Math.random() * 3);
      const { x, y1, y2 } = dozensParams;
      const cx = (x[idx] + x[idx + 1]) / 2;
      const cy = (y1 + y2) / 2;
      const maxBet = Math.max(1, settings.maxBet);
      const multiplicity = Math.max(1, settings.completeMultiplicity);
      const dozenNum = idx + 1;
      const dozenRules = getAllRules().dozenComplete as {
        minCoeff: number; maxCoeff: number;
        dozens: Array<{ dozen: number; chipsRequired: number }>;
      };
      const dozenRuleEntry = dozenRules.dozens.find(d => d.dozen === dozenNum);
      // chipsRequired, minCoeff, maxCoeff come from config — not hardcoded here
      const chipsRequired = dozenRuleEntry?.chipsRequired ?? 100;
      const minCoeff = dozenRules.minCoeff ?? 0.1;
      const maxCoeff = dozenRules.maxCoeff ?? 0.6;
      // Minimum valid total: every chip must play at least one multiplicity unit
      const minAmount = multiplicity * chipsRequired;

      let dozenAmount: number;
      if (multiplicity >= maxBet) {
        // Branch 1: multiplicity ≥ maxBet — use minimum directly, no random generation
        dozenAmount = minAmount;
      } else {
        // Branch 2: multiplicity < maxBet — random generation with up to 5 attempts (hardcoded)
        const loBound = maxBet * minCoeff;
        const hiBound = maxBet * maxCoeff;
        dozenAmount = minAmount; // fallback used if all 5 attempts fail
        for (let attempt = 0; attempt < 5; attempt++) {
          // Step 1: random value per chip in [loBound, hiBound]
          const perChip = loBound + Math.random() * (hiBound - loBound);
          // Step 2: preliminary total = perChip × chipsRequired
          const preliminary = perChip * chipsRequired;
          // Step 3: reject if below minimum
          if (preliminary < minAmount) continue;
          // Step 4: floor down to nearest multiple of multiplicity
          const floored = Math.floor(preliminary / multiplicity) * multiplicity;
          // Step 5: accept only if still ≥ minimum after rounding
          if (floored >= minAmount) {
            dozenAmount = floored;
            break;
          }
          // floored < minAmount after rounding → try next attempt
        }
        // After 5 failures the fallback minAmount is already set above
      }

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

    // ── Complete-based candidate set (used by neighbours and final draw) ───────
    // Completes are part of the same mandatory intersection as series and
    // neighbours. Never fall back to a dozen-only/number-only set when both
    // complete sources are enabled.
    const allCompleteBetsPrecheck = getAllRules().completeBets;
    const hasDozenComplete = !!dozenCompleteBet;
    let dozenCoveredSetForWin: Set<number> | null = null;

    if (hasDozenComplete) {
      const dcDozenNum = dozenCompleteBet!.dozen === "1ST_12" ? 1
                       : dozenCompleteBet!.dozen === "2ND_12" ? 2 : 3;
      const dcRule = (getAllRules().dozenComplete as {
        dozens: Array<{ dozen: number; bets: Record<string, Array<{ numbers: number[] }>> }>;
      })?.dozens?.find(d => d.dozen === dcDozenNum);
      dozenCoveredSetForWin = new Set<number>();
      if (dcRule) {
        for (const entries of Object.values(dcRule.bets)) {
          if (!Array.isArray(entries)) continue;
          for (const entry of entries) {
            if (!Array.isArray(entry.numbers)) continue;
            for (const n of entry.numbers) dozenCoveredSetForWin.add(n);
          }
        }
      }
    }

    const currentChipPosMap = buildDynamicPositions(gridParams);
    let numberCompleteBets: NumberCompleteBet[] = [];
    let excludedIds = new Set<string>();
    let completeCandidateSet: Set<number> | null = null;
    let numberCoveredSetForWin: Set<number> | null = null;

    const buildNumberCoverage = (bets: NumberCompleteBet[]) => {
      const covered = new Set<number>();
      for (const bet of bets) {
        for (const n of getNumbersCoveredByComplete(bet.number, allCompleteBetsPrecheck)) {
          covered.add(n);
        }
      }
      return covered;
    };

    const buildCompleteCandidate = (numberCoverage: Set<number> | null) => {
      if (dozenCoveredSetForWin && numberCoverage) {
        return new Set([...dozenCoveredSetForWin].filter(n => numberCoverage.has(n)));
      }
      return dozenCoveredSetForWin ?? numberCoverage;
    };

    const completeGenerationAttempts = seriesCoveredSet ? 12 : 1;
    for (let attempt = 0; attempt < completeGenerationAttempts; attempt++) {
      const generated = generateNumberCompletes(
        dozenCompleteBet,
        currentChipPosMap,
      );
      numberCompleteBets = generated.bets;
      excludedIds = generated.excludedIds;
       numberCoveredSetForWin = numberCompleteBets.length > 0
         ? (numberCompleteBets.length === 2 || (
             Math.min(3, Math.max(1, settings.completeCount ?? 1)) === 3
             && numberCompleteBets.length >= 2
           ))
          ? new Set(
              [...buildNumberCoverage([numberCompleteBets[0]])]
                .filter((number) => buildNumberCoverage([numberCompleteBets[1]]).has(number)),
            )
          : buildNumberCoverage(numberCompleteBets)
        : null;
      completeCandidateSet = buildCompleteCandidate(numberCoveredSetForWin);

      const commonWithSeries = completeCandidateSet && seriesCoveredSet
        ? [...completeCandidateSet].filter(n => seriesCoveredSet!.has(n))
        : null;
      if (!seriesCoveredSet || !completeCandidateSet || (commonWithSeries && commonWithSeries.length > 0)) {
        break;
      }
    }

    // With two number completes, silently continuing with fewer than two
    // would violate the settings and the mandatory pair constraints. Retry
    // the whole round a finite number of times for custom rulesets where a
    // compatible pair may be available only for another generated setup.
    if (
      settings.completeField === "yes"
      && Math.min(3, Math.max(1, settings.completeCount ?? 1)) === 2
      && numberCompleteBets.length !== 2
    ) {
      if (retryAttempt < 20) {
        generateRound(retryAttempt + 1);
      }
      return;
    }

    // ── Neighbours bets ("Соседи номера") ───────────────────────────────────────
    // Generated BEFORE the winning number so their coverage can constrain it.
    // When series and/or completes are active, the centres are retried until
    // their union has a number in the same mandatory candidate set. This keeps
    // the later draw from having to choose one constraint over another.
    const neighboursRule = getNeighboursRule();
    const neighboursCountRaw = settings.neighborsCount ?? 0;
    const neighboursCount = Math.max(0, Math.min(37, Math.floor(neighboursCountRaw)));
    let neighboursBets: NeighboursBet[] = [];
    let neighboursCoveredSet: Set<number> | null = null;

    if (neighboursCount > 0) {
      const minBet = Math.max(1, settings.minBet);
      const maxBet = Math.max(minBet, settings.maxBet);
      const lowerBoundRaw = Math.round(maxBet / 3);
      const lowerBound = Math.min(Math.max(1, lowerBoundRaw), maxBet);
      const neighMult = Math.max(1, settings.neighboursMultiplicity ?? 10);
      const MAX_NEIGH_ATTEMPTS = 20;

      const mandatoryTrackCompleteSet = (() => {
        if (seriesCoveredSet && completeCandidateSet) {
          return new Set(
            [...seriesCoveredSet].filter(n => completeCandidateSet!.has(n)),
          );
        }
        return seriesCoveredSet ?? completeCandidateSet;
      })();

      const coverageFor = (num: number) =>
        (neighboursRule as Record<string, number[]>)[String(num)] ?? [];
      const centrePoolFor = (required: Set<number> | null) => {
        const allNums = Array.from({ length: 37 }, (_, i) => i);
        if (!required || required.size === 0) return allNums;
        return allNums.filter(num => coverageFor(num).some(n => required.has(n)));
      };

      for (let attempt = 0; attempt < MAX_NEIGH_ATTEMPTS; attempt++) {
        const allNums = Array.from({ length: 37 }, (_, i) => i);
        let selectedNumbers: number[];
        const compatibleCentres = centrePoolFor(mandatoryTrackCompleteSet);
        const firstPool = compatibleCentres.length > 0 ? compatibleCentres : allNums;
        if (neighboursCount === 1) {
          selectedNumbers = [firstPool[Math.floor(Math.random() * firstPool.length)]];
        } else {
          const center1 = firstPool[Math.floor(Math.random() * firstPool.length)];
          const center1Set = coverageFor(center1);
          const cands = center1Set.filter(n => n !== center1);
          const center2Pool = cands.length > 0 ? cands : allNums.filter(n => n !== center1);
          const center2 = center2Pool[Math.floor(Math.random() * center2Pool.length)];
          selectedNumbers = [center1, center2];
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

        // Build the union of 5-number coverages for this attempt's centres.
        const trialCoveredSet = new Set<number>();
        for (const num of selectedNumbers) {
          for (const n of coverageFor(num)) trialCoveredSet.add(n);
        }

        const intersects = !mandatoryTrackCompleteSet ||
          [...mandatoryTrackCompleteSet].some(n => trialCoveredSet.has(n));

        if (intersects) {
          neighboursCoveredSet = trialCoveredSet;
          neighboursBets = selectedNumbers.map(num => {
            const rawBase = lowerBound + Math.floor(Math.random() * (maxBet - lowerBound + 1));
            const baseAmount = Math.max(neighMult, Math.floor(rawBase / neighMult) * neighMult);
            const amount = baseAmount * 5;
            let pos = trackNumberPosMap.get(num) ?? { x: 0, y: 0 };
            if (num === 30) {
              const cellW = Math.abs(trackParams.arcLX2 - trackParams.arcLX1);
              const cellH = Math.abs(trackParams.arcLY[3] - trackParams.arcLY[2]);
              pos = {
                x: trackParams.arcLX2 - 0.2 * cellW,
                y: trackParams.arcLY[2] + (-0.0232) * cellH,
              };
            }
            if (num === 8) {
              const cellH = Math.abs(trackParams.arcLY[2] - trackParams.arcLY[1]);
              pos = { x: pos.x, y: trackParams.arcLY[1] + 0.4875 * cellH };
            }
            if (num === 23) {
              const cellH = Math.abs(trackParams.arcLY[1] - trackParams.arcLY[0]);
              pos = { x: pos.x, y: trackParams.arcLY[0] + 0.6375 * cellH };
            }
            if (num === 10) {
              const cellH = Math.abs(trackParams.topY2 - trackParams.topY1);
              pos = { x: pos.x, y: pos.y + 0.10 * cellH };
            }
            if (num === 3) {
              const cellW = Math.abs(trackParams.arcRX2 - trackParams.arcRX1);
              const cellH = Math.abs(trackParams.arcRY[1] - trackParams.arcRY[0]);
              pos = { x: pos.x - 0.3 * cellW, y: pos.y + 0.2 * cellH };
            }
            if (num === 26) {
              const cellW = Math.abs(trackParams.arcRX2 - trackParams.arcRX1);
              pos = { x: pos.x + 0.1 * cellW, y: pos.y };
            }
            if (num === 0) {
              const cellW = Math.abs(trackParams.arcRX2 - trackParams.arcRX1);
              const neighbourChipHorizontalAdjustments: Record<number, number> = { 0: -0.10 };
              const horizontalAdjustment = neighbourChipHorizontalAdjustments[num] ?? 0;
              const baseChipX = pos.x - 0.2 * cellW;
              pos = { x: baseChipX + cellW * horizontalAdjustment, y: pos.y };
            }
            void neighboursRule;
            return { number: num, baseAmount, amount, position: pos, source: "NEIGHBOURS" as const };
          });
          break;
        }
      }

      // The deterministic centre pool above makes this fallback finite and
      // compatible whenever a compatible number exists. It is only a guard
      // against malformed/custom neighbour rules.
      if (!neighboursCoveredSet) {
        const fallbackCentre = centrePoolFor(mandatoryTrackCompleteSet)[0];
        if (fallbackCentre !== undefined) {
          neighboursCoveredSet = new Set(coverageFor(fallbackCentre));
          neighboursBets = [{
            number: fallbackCentre,
            baseAmount: Math.max(neighMult, Math.floor(lowerBound / neighMult) * neighMult),
            amount: Math.max(neighMult, Math.floor(lowerBound / neighMult) * neighMult) * 5,
            position: trackNumberPosMap.get(fallbackCentre) ?? { x: 0, y: 0 },
            source: "NEIGHBOURS",
          }];
        }
      }
    }

    // ── Choose winning number ──────────────────────────────────────────────────
    // Rules:
    //   • If a dozen complete exists, the drawn number MUST be covered by it.
    //   • If number completes exist, at least one MUST cover the drawn number.
    //   • If neighbours bets exist, the drawn number MUST be in the union of
    //     all 5-number coverages (guaranteeing at least one bet wins).
    //   • If series (track) bets exist, the drawn number MUST be in the union
    //     of all active series (guaranteeing at least one series wins).
    //   • All active constraints are intersected; the drawn number is chosen
    //     randomly from that intersection.
    //   • When no constraints exist, draw is fully random (0–36).
    let drawnNumber: number;

    const hasNeighbours  = neighboursBets.length > 0;
    const hasTrackBets   = trackBets.length > 0;

    if (hasDozenComplete || completeCandidateSet || hasNeighbours || hasTrackBets) {
      // Build one strict intersection. Never preserve an earlier candidate set
      // when a later mandatory constraint has no overlap.
      let candidates: number[] = Array.from({ length: 37 }, (_, i) => i);

      if (completeCandidateSet) {
        candidates = [...completeCandidateSet];
      }

      if (neighboursCoveredSet) {
        candidates = candidates.filter(n => neighboursCoveredSet!.has(n));
      }

      if (seriesCoveredSet) {
        candidates = candidates.filter(n => seriesCoveredSet!.has(n));
      }

      if (candidates.length === 0) {
        // A custom ruleset can make the mandatory intersection impossible.
        // Retry the whole round with a bounded limit instead of dropping a
        // series/neighbour/complete constraint or recursing forever.
        if (retryAttempt < 20) {
          generateRound(retryAttempt + 1);
        }
        return;
      }
      drawnNumber = candidates[Math.floor(Math.random() * candidates.length)];
    } else {
      drawnNumber = Math.floor(Math.random() * 37);
    }

    // With three completes, the first two remain the winning pair. Replace
    // the third after the draw so it can never contain a winning physical
    // position. Prefer a complete belonging to an active losing series when
    // there is more than one active series and such a candidate exists.
    if (
      Math.min(3, Math.max(1, settings.completeCount ?? 1)) === 3
      && numberCompleteBets.length === 3
    ) {
      const firstTwo = numberCompleteBets.slice(0, 2);
      const currentThird = numberCompleteBets[2];
      const coverageOf = (num: number) =>
        getNumbersCoveredByComplete(num, allCompleteBetsPrecheck);
      const safeCandidates = allCompleteBetsPrecheck
        .map((rule) => rule.number)
        .filter((num) =>
          !firstTwo.some((bet) => bet.number === num)
          && !coverageOf(num).includes(drawnNumber)
          && currentChipPosMap.has(`su-${num}`),
        );

      const activeSeries = trackBets.length > 1 ? trackBets : [];
      const trackRulesForSelection = getAllRules().trackBets as Record<string, { numbers: number[] }>;
      const losingSeriesNumbers = new Set<number>();
      if (activeSeries.length > 1) {
        for (const series of activeSeries) {
          const seriesNumbers = trackRulesForSelection[series.type]?.numbers ?? [];
          if (!seriesNumbers.includes(drawnNumber)) {
            for (const number of seriesNumbers) losingSeriesNumbers.add(number);
          }
        }
      }
      const losingCandidates = safeCandidates.filter((num) => losingSeriesNumbers.has(num));
      const thirdPool = losingCandidates.length > 0 ? losingCandidates : safeCandidates;

      if (thirdPool.length === 0) {
        if (retryAttempt < 20) generateRound(retryAttempt + 1);
        return;
      }

      {
        const thirdNumber = thirdPool[Math.floor(Math.random() * thirdPool.length)];
        const thirdRule = getCompleteBetRule(thirdNumber);
        if (!thirdRule) {
          if (retryAttempt < 20) generateRound(retryAttempt + 1);
          return;
        }
        const multiplicity = Math.max(1, settings.completeMultiplicity);
        const minPlayUnit = Math.ceil(Math.max(1, settings.minBet) / multiplicity) * multiplicity;
        const maxPlayUnit = Math.floor(
          Math.max(Math.max(1, settings.minBet), settings.maxBet) / multiplicity,
        ) * multiplicity;
        const allowedValues: number[] = [];
        for (let value = minPlayUnit; value <= maxPlayUnit; value += multiplicity) {
          allowedValues.push(value);
        }
        const firstValues = firstTwo.map((bet) => {
          const rule = getCompleteBetRule(bet.number);
          return rule ? bet.amount / rule.chipsRequired : undefined;
        });
        const distinctValues = allowedValues.filter((value) => !firstValues.includes(value));
        const valuePool = distinctValues.length > 0 ? distinctValues : allowedValues;
        const playUnit = valuePool.length > 0
          ? valuePool[Math.floor(Math.random() * valuePool.length)]
          : Math.max(multiplicity, minPlayUnit);

        excludedIds.delete(`su-${currentThird.number}`);
        excludedIds.add(`su-${thirdNumber}`);
        numberCompleteBets = [
          ...firstTwo,
          {
            number: thirdNumber,
            chipsRequired: thirdRule.chipsRequired,
            amount: playUnit * thirdRule.chipsRequired,
            position: currentChipPosMap.get(`su-${thirdNumber}`)!,
          },
        ];
      }
    }

    // Generate cash first. Cash owns physical positions, while color is
    // generated afterwards and excludes those positions.
    const cashOnField = settings.cashOnField ?? 0;
    const cashChipValues = settings.cashChipValues?.length ? settings.cashChipValues : ["100"];
    const colorNumbersCount = Math.max(0, Math.floor(settings.colorNumbersCount ?? 1));
    const colorEnabled = chipCount > 0 && colorNumbersCount > 0;
    const cashChipStacks = generateCashChips(
      drawnNumber,
      cashOnField,
      cashChipValues,
      settings.minBet,
      settings.maxBet,
      settings.colorNumbersCount,
      colorEnabled,
    );
    const cashPositionIds = new Set(cashChipStacks.map(c => c.positionId));
    const winningSeriesPositionIds = getWinningSeriesPositionIds(
      trackBets,
      drawnNumber,
      getAllRules(),
    );
    const blockedColorPositions = new Set([
      ...excludedIds,
      ...cashPositionIds,
      ...winningSeriesPositionIds,
    ]);

    // Generate color chips using the existing number-center algorithm.
    // Only the combined blocked physical positions are excluded; other
    // positions for the same center number remain available.
    const colorChips = generateColorChips(
      drawnNumber,
      colorNumbersCount,
      chipCount,
      blockedColorPositions,
    );

    const base = spinGame(
      chipCount,
      chipValue,
      payoutMap,
      excludedIds.size > 0 ? excludedIds : undefined,
      drawnNumber,
      colorChips,
    );

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
    onRoundGenerated?.(newGameState);

    // Build quiz queue from active series in fixed order
    const ordered = SERIES_QUIZ_ORDER
      .map(t => trackBets.find(tb => tb.type === t))
      .filter((tb): tb is TrackBet => tb !== undefined);
    const hasCompletes = settings.completeField === "yes" || settings.completeDozen === "yes";
    // Field bets = color chips or cash chips on the field (track bets excluded).
    // The completesIntersection question is asked whenever field bets are present,
    // regardless of whether completes are present.
    const hasFieldBets = newGameState.chips.length > 0 || (newGameState.cashChipStacks ?? []).length > 0;
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
    // trackIntersection only needs track bets (series or neighbours) — field bets are not required.
    // trackFieldIntersection (the next question) is the one that requires field bets.
    const hasTrackBetsAtStart = ordered.length > 0 || neighboursBets.length > 0;
    setQuizPhase(
      hasCompletes ? { kind: "completes" } :
      hasFieldBets  ? { kind: "completesIntersection" } :
      ordered.length > 0 ? { kind: "series" } :
      hasTrackBetsAtStart ? { kind: "trackIntersection" } :
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
    onRoundGenerated,
  ]);

  // Keep ref always pointing to latest generateRound
  useEffect(() => { generateRoundRef.current = generateRound; }, [generateRound]);

  useEffect(() => {
    if (!isAttestationMode && autoGenerateRound) {
      generateRoundRef.current();
    }
  }, [autoGenerateRound, isAttestationMode]);

  // Preload spin audio on mount so it's ready on first click
  useEffect(() => {
    if (readOnlyReport) return;
    if (!audioRef.current) {
      const audio = new Audio(spinSoundUrl);
      audio.preload = "auto";
      audio.loop = false;
      audioRef.current = audio;
    }
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, [readOnlyReport]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current);
    };
  }, []);

  const handleSpin = useCallback(() => {
    if (isAttestationMode) return;

    // Immediately exit report/quiz layout so the full-size field shows at once
    setQuizPhase(null);
    setGame(null);
    playSpinAnimation(() => generateRoundRef.current());
  }, [isAttestationMode, playSpinAnimation]);

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
    recordAttestationAnswer("series", "Посчитайте общую сдачу с кратности приема серий.", {
      userAnswer, correctAnswer, correct: userAnswer === correctAnswer,
    });
    setSeriesInput("");
    // trackIntersection only needs track bets — always show it after series.
    setQuizPhase({ kind: "trackIntersection" });
  }, [game, quizPhase, activeSeries, seriesInput, settings.multiplicity, seriesDivisors, recordAttestationAnswer]);

  const handleCheckField = useCallback(() => {
    if (!game || !quizPhase || quizPhase.kind !== "field") return;
    const userAnswer = parseInt(fieldInput || "0", 10) || 0;
    const maxBet = Math.max(1, settings.maxBet);
    const mult   = Math.max(10, Math.min(1000, settings.multiplicity ?? 10));
    const chipValue = settings.chipValue ?? 10;
    const completeMultiplicity = Math.max(1, settings.completeMultiplicity ?? 10);
    const completePayoutAmount = completeNumberPayoutRecord?.correctAnswer ?? 0;
    const entries = computeWinningField(game, activeSeries, maxBet, mult, chipValue, completeMultiplicity, getAllRules(), payoutMap, completePayoutAmount);
    const correctAnswer = entries.reduce((sum, e) => sum + e.amount * e.payoutMultiplier, 0);
    setFieldRecord({ userAnswer, correctAnswer, correct: userAnswer === correctAnswer, entries });
    recordAttestationAnswer("field-payout", "Посчитайте общую сумму выплаты.", {
      userAnswer, correctAnswer, correct: userAnswer === correctAnswer,
    });
    const generated = generateColorPayout(correctAnswer, chipValue);
    if (generated) {
      setColorPayoutData({ ...generated, totalPayout: correctAnswer, colorNominal: chipValue });
      setColorPayoutInput("");
      setQuizPhase({ kind: "colorPayout" });
    } else {
      setColorPayoutData(null);
      setQuizPhase({ kind: "report" });
    }
  }, [game, quizPhase, fieldInput, activeSeries, settings.maxBet, settings.multiplicity, settings.chipValue, settings.completeMultiplicity, getAllRules, payoutMap, completeNumberPayoutRecord, recordAttestationAnswer]);

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
    recordAttestationAnswer(
      "color-payout",
      colorPayoutData.cashPayout
        ? `Выплата через ${colorPayoutData.cashPayout}. Посчитайте остаток выплаты в «цвете».`
        : "Посчитайте остаток выплаты в «цвете».",
      {
        userAnswer,
        correctAnswer: colorPayoutData.colorChips,
        correct: userAnswer === colorPayoutData.colorChips,
      },
    );
    setColorPayoutInput("");
    setQuizPhase({ kind: "report" });
  }, [colorPayoutData, quizPhase, colorPayoutInput, recordAttestationAnswer]);

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
    // Go to completesIntersection only when field bets (color/cash chips) are present.
    // If there are no field bets, skip to the next phase.
    // trackIntersection only needs track bets, so it can follow even without field bets.
    const hasFieldBets = game.chips.length > 0 || (game.cashChipStacks ?? []).length > 0;
    // When there are no color/cash field bets, completesIntersection is skipped.
    // Still route to completeNumberPayout before field if any complete bet exists and there
    // are no track bets (track paths handle the routing themselves via trackFieldIntersection).
    const hasAnyCompleteBet = !!game.dozenCompleteBet || game.numberCompleteBets.length > 0;
    setQuizPhase(hasFieldBets
      ? { kind: "completesIntersection" }
      : activeSeries.length > 0 ? { kind: "series" }
      : game.neighboursBets.length > 0 ? { kind: "trackIntersection" }
      : hasAnyCompleteBet ? { kind: "completeNumberPayout" }
      : { kind: "field" }
    );
  }, [game, quizPhase, completesInput, activeSeries, settings.maxBet, settings.completeMultiplicity, getAllRules]);

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

    // --- Standalone color / cash positions (not part of any complete) ---
    // Include every field position that has color chips or cash, even when it
    // has no complete contribution. Track positions are excluded because
    // game.chips / game.cashChipStacks only hold field bets.
    for (const positionId of new Set([...chipCountByPos.keys(), ...cashByPos.keys()])) {
      if (posMap.has(positionId)) continue; // already seeded by a complete
      const betPos = BET_POSITIONS_MAP.get(positionId);
      if (!betPos) continue;
      const limitMultiplier = BET_COVER_COUNT[betPos.type];
      const typeLabel: Record<string, string> = {
        straight: "Straight Up", split: "Split", street: "Street",
        corner: "Corner", sixline: "Six-Line",
      };
      const sortedNums = [...betPos.numbers].sort((a, b) => a - b).join("-");
      const betLabel = `${typeLabel[betPos.type] ?? betPos.type} ${sortedNums}`;
      ensurePos(positionId, limitMultiplier, betLabel);
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
    // Route to completeNumberPayout before field when any complete bet exists and there are
    // no track bets (track paths handle the routing themselves via trackFieldIntersection).
    const hasAnyCompleteBetHere = !!game.dozenCompleteBet || game.numberCompleteBets.length > 0;
    setQuizPhase(
      activeSeries.length > 0 ? { kind: "series" } :
      game.neighboursBets.length > 0 ? { kind: "trackIntersection" } :
      hasAnyCompleteBetHere ? { kind: "completeNumberPayout" } :
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

    // positionId → { betLabel, typeLabel, limitMultiplier, contributions: source → amount }
    // typeLabel is the display name for this position type (e.g. "Split", "Straight Up").
    type PosEntry = {
      betLabel: string;
      typeLabel: string;
      limitMultiplier: number;
      contributions: Map<string, number>;
    };
    const posMap = new Map<string, PosEntry>();

    const addContrib = (
      positionId: string,
      limitMultiplier: number,
      betLabel: string,
      typeLabel: string,
      source: string,
      amount: number,
    ) => {
      let entry = posMap.get(positionId);
      if (!entry) {
        entry = { betLabel, typeLabel, limitMultiplier, contributions: new Map() };
        posMap.set(positionId, entry);
      }
      // Accumulate per-source contribution (handles multiple neighbours covering
      // the same number, and multiple series covering the same position).
      entry.contributions.set(source, (entry.contributions.get(source) ?? 0) + amount);
    };

    // --- Neighbours: expand each bet into 5 straight-up positions ---
    // Each NeighboursBet covers 5 numbers; every number gets baseAmount as its
    // Straight contribution. Identical Straight positions from different
    // neighbours bets accumulate in the same posMap entry.
    const neighboursMap = rules.neighbours as Record<string, number[]>;
    for (const nb of game.neighboursBets) {
      const nums = neighboursMap[String(nb.number)];
      if (!Array.isArray(nums)) continue;
      const sourceLabel = `Соседи №${nb.number}`;
      for (const n of nums) {
        addContrib(`su-${n}`, BET_COVER_COUNT.straight, `Straight Up ${n}`, "Straight Up", sourceLabel, nb.baseAmount);
      }
    }

    // --- Series: expand each active series into its individual bet positions ---
    // playPerUnit is the accepted amount per one unit of the series.
    // Each position in the series gets: playPerUnit × chips_for_that_position.
    // Positions shared between multiple series (e.g. Split 12-15 in both
    // Serie 0/2/3 and Zero Spiel) are identified by the canonical positionId
    // from ALL_BET_POSITIONS and their contributions are summed.
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
          // Normalize: findPositionId sorts numbers internally, so [15,12] and [12,15]
          // both resolve to the same canonical position id (sp-h-12).
          const positionId = findPositionId(catInfo.betType, entry.numbers);
          if (!positionId) continue;
          const sortedNums = [...entry.numbers].sort((a, b) => a - b).join("-");
          const betLabel = `${catInfo.label} ${sortedNums}`;
          addContrib(positionId, catInfo.limitMultiplier, betLabel, catInfo.label, tb.label, playPerUnit * entry.chips);
        }
      }
    }

    // --- Collect positions where the combined total exceeds the limit ---
    // Only track-source contributions (series + neighbours) are summed here.
    // Field bets (color chips, cash, completes) are excluded per spec.
    const lines: TrackIntersectionLineSummary[] = [];
    for (const acc of posMap.values()) {
      const totalAmount = Array.from(acc.contributions.values()).reduce((s, v) => s + v, 0);
      const positionLimit = maxBet * acc.limitMultiplier;
      if (totalAmount > positionLimit) {
        lines.push({
          label: acc.betLabel,
          typeLabel: acc.typeLabel,
          limitMultiplier: acc.limitMultiplier,
          positionLimit,
          contributions: Array.from(acc.contributions.entries())
            .map(([source, amount]) => ({ source, amount }))
            .sort((a, b) => a.source.localeCompare(b.source)),
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
    // trackFieldIntersection requires BOTH track bets AND field bets (color/cash/completes).
    // If no field bets are present, skip trackFieldIntersection and go directly to the post-track phase.
    const hasFieldBetsForTrackField = game.chips.length > 0
      || (game.cashChipStacks ?? []).length > 0
      || !!game.dozenCompleteBet
      || game.numberCompleteBets.length > 0;
    if (hasFieldBetsForTrackField) {
      setQuizPhase({ kind: "trackFieldIntersection" });
    } else {
      // No field bets → no completes → skip straight to post-track-field phase
      const rules = getAllRules() as Record<string, unknown>;
      setQuizPhase(decidePostTrackFieldPhase(game, activeSeries, rules));
    }
  }, [game, quizPhase, trackIntersectionInput, activeSeries, settings.maxBet, settings.multiplicity, getAllRules]);

  // ── Track + Field Intersection (трек × поле, без комплитов) ─────────────────
  const handleCheckTrackFieldIntersection = useCallback(() => {
    if (!game || !quizPhase || quizPhase.kind !== "trackFieldIntersection") return;
    const userAnswer = parseInt(trackFieldIntersectionInput || "0", 10) || 0;
    const maxBet = Math.max(1, settings.maxBet);
    const mult = Math.max(10, Math.min(1000, settings.multiplicity ?? 10));
    const completeMultiplicity = Math.max(1, settings.completeMultiplicity);
    const chipValue = settings.chipValue ?? 10;
    const rules = getAllRules();

    // ── Steps 1–2: Build track position map (series + neighbours → physical positions, summed) ──
    // All contributions to the same positionId are accumulated before any cap is applied.
    type TrackEntry = { betLabel: string; limitMultiplier: number; trackTotal: number };
    const trackMap = new Map<string, TrackEntry>();
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

    // ── Step 5: Build field position maps (color + cash + completes → physical positions) ──
    // Track color, cash, and complete amounts separately so the report can break them down.
    const colorAmtByPos  = new Map<string, number>(); // positionId → color chip amount
    const cashAmtByPos   = new Map<string, number>(); // positionId → cash chip amount
    const completeAmtByPos = new Map<string, number>(); // positionId → complete contribution

    const addComplete = (positionId: string, amount: number) =>
      completeAmtByPos.set(positionId, (completeAmtByPos.get(positionId) ?? 0) + amount);

    // Color chips
    for (const c of game.chips) {
      colorAmtByPos.set(c.positionId, (colorAmtByPos.get(c.positionId) ?? 0) + c.count * chipValue);
    }
    // Cash chips
    for (const cc of game.cashChipStacks) {
      cashAmtByPos.set(cc.positionId, (cashAmtByPos.get(cc.positionId) ?? 0) + cc.denomination);
    }
    // Dozen complete → expand to real positions
    if (game.dozenCompleteBet) {
      const { amount, dozen } = game.dozenCompleteBet;
      const dozenNum = dozen === "1ST_12" ? 1 : dozen === "2ND_12" ? 2 : 3;
      const dozenRule = (rules.dozenComplete as { dozens: Array<{ dozen: number; chipsRequired: number; bets: Record<string, unknown> }> }).dozens.find(d => d.dozen === dozenNum);
      if (dozenRule) {
        const { playPerUnit } = calcOneCompleteChange(amount, dozenRule.chipsRequired, maxBet, completeMultiplicity);
        for (const [catKey, { betType }] of Object.entries(DOZEN_COMPLETE_CATEGORY_MAP)) {
          const rawEntries = (dozenRule.bets as Record<string, unknown>)[catKey];
          if (!Array.isArray(rawEntries)) continue;
          for (const e of rawEntries) {
            if (!e || !Array.isArray(e.numbers) || typeof e.chips !== "number") continue;
            const posId = findPositionId(betType, e.numbers as number[]);
            if (posId) addComplete(posId, playPerUnit * e.chips);
          }
        }
      }
    }
    // Number completes → expand to real positions
    for (const ncb of game.numberCompleteBets) {
      const completeRule = (rules.completeBets as Array<{ number: number; chipsRequired: number; bets: Record<string, unknown> }>).find(cb => cb.number === ncb.number);
      if (!completeRule) continue;
      const { playPerUnit } = calcOneCompleteChange(ncb.amount, ncb.chipsRequired, maxBet, completeMultiplicity);
      for (const [catKey, { betType }] of Object.entries(DOZEN_COMPLETE_CATEGORY_MAP)) {
        const rawEntries = (completeRule.bets as Record<string, unknown>)[catKey];
        if (!Array.isArray(rawEntries)) continue;
        for (const e of rawEntries) {
          if (!e || !Array.isArray(e.numbers) || typeof e.chips !== "number") continue;
          const posId = findPositionId(betType, e.numbers as number[]);
          if (posId) addComplete(posId, playPerUnit * e.chips);
        }
      }
    }

    // ── Steps 3–6: For each position with track bets, compute intersection change ──
    //
    // Step 3: acceptedField = min(fieldTotal, positionLimit)
    //         The field question already returned max(0, fieldTotal − limit), so the
    //         position effectively holds only min(fieldTotal, limit) after that question.
    //
    // Step 4: acceptedTrack = min(trackTotal, positionLimit)
    //         The track question already returned max(0, trackTotal − limit), so the
    //         position effectively holds only min(trackTotal, limit) after that question.
    //
    // Step 5: Only count positions where BOTH acceptedField > 0 AND acceptedTrack > 0.
    //
    // Step 6: change = max(0, acceptedField + acceptedTrack − positionLimit)
    //         This is the NEW overflow that arises only because the two capped sums
    //         are combined. Neither the field-only overflow nor the track-only overflow
    //         is added here — they were already returned in their respective questions.
    const lines: TrackFieldIntersectionLineSummary[] = [];
    for (const [positionId, entry] of trackMap.entries()) {
      const positionLimit  = maxBet * entry.limitMultiplier;

      // Track side — cap at limit; the excess was already returned in the previous question
      const trackTotal        = entry.trackTotal;
      const trackPrevChange   = Math.max(0, trackTotal - positionLimit);
      const acceptedTrack     = trackTotal - trackPrevChange; // = min(trackTotal, positionLimit)

      // Field side — cap at limit; the excess was already returned in the field question
      const colorAmount       = colorAmtByPos.get(positionId) ?? 0;
      const cashAmount        = cashAmtByPos.get(positionId) ?? 0;
      const completeAmount    = completeAmtByPos.get(positionId) ?? 0;
      const fieldTotal        = colorAmount + cashAmount + completeAmount;
      const fieldPrevChange   = Math.max(0, fieldTotal - positionLimit);
      const acceptedField     = fieldTotal - fieldPrevChange; // = min(fieldTotal, positionLimit)

      // Only real intersections
      if (acceptedField <= 0 || acceptedTrack <= 0) continue;

      // New change from combining both capped sums
      const combinedTotal     = acceptedField + acceptedTrack;
      const change            = Math.max(0, combinedTotal - positionLimit);
      if (change > 0) {
        lines.push({
          label: entry.betLabel,
          positionLimit,
          colorAmount,
          cashAmount,
          completeAmount,
          fieldTotal,
          fieldPrevChange,
          acceptedField,
          trackTotal,
          trackPrevChange,
          acceptedTrack,
          combinedTotal,
          change,
        });
      }
    }

    const correctAnswer = lines.reduce((s, l) => s + l.change, 0);
    setTrackFieldIntersectionRecord({ userAnswer, correctAnswer, correct: userAnswer === correctAnswer, lines });
    setTrackFieldIntersectionInput("");
    // completeTrackIntersection question is excluded. Go to completeNumberPayout
    // whenever at least one complete bet exists in the round (regardless of whether it won).
    const anyCompleteExistsNow = !!game.dozenCompleteBet || game.numberCompleteBets.length > 0;
    setQuizPhase(anyCompleteExistsNow ? { kind: "completeNumberPayout" } : decidePostTrackFieldPhase(game, activeSeries, rules));
  }, [game, quizPhase, trackFieldIntersectionInput, activeSeries, settings.maxBet, settings.multiplicity, settings.completeMultiplicity, settings.chipValue, getAllRules]);

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
    // Ask completeNumberPayout whenever at least one complete bet exists in the round (regardless of whether it won).
    const anyCompleteExists = !!game.dozenCompleteBet || game.numberCompleteBets.length > 0;
    setQuizPhase(anyCompleteExists ? { kind: "completeNumberPayout" } : decidePostTrackFieldPhase(game, activeSeries, rules));
  }, [game, quizPhase, completeTrackIntersectionInput, activeSeries, settings.maxBet, settings.multiplicity, settings.completeMultiplicity, getAllRules]);

  // ── Complete Number Payout (касания комплитов → сумма в выпавший номер) ──────
  const handleCheckCompleteNumberPayout = useCallback(() => {
    if (!game || !quizPhase || quizPhase.kind !== "completeNumberPayout") return;
    const userAnswer = parseInt(completeNumberPayoutInput || "0", 10) || 0;
    const maxBet = Math.max(1, settings.maxBet);
    const completeMultiplicity = Math.max(1, settings.completeMultiplicity);
    const rules = getAllRules();
    const drawnNumber = game.drawnNumber;

    // positionId → accumulated contributions from all completes
    type PosAcc = {
      positionLabel: string;
      limitMultiplier: number;
      contributions: Array<{ completeLabel: string; playPerUnit: number; stakeOnPos: number }>;
      totalStake: number;
    };
    const posMap = new Map<string, PosAcc>();

    const addCompleteWinningPositions = (
      completeLabel: string,
      amount: number,
      chipsRequired: number,
      betsRule: Record<string, Array<{ numbers: number[]; chips: number }>>,
    ) => {
      const { playPerUnit } = calcOneCompleteChange(amount, chipsRequired, maxBet, completeMultiplicity);
      if (playPerUnit <= 0) return;
      for (const [catKey, entries] of Object.entries(betsRule)) {
        const catInfo = DOZEN_COMPLETE_CATEGORY_MAP[catKey];
        if (!catInfo || !Array.isArray(entries)) continue;
        for (const entry of entries) {
          if (!Array.isArray(entry.numbers) || !entry.numbers.includes(drawnNumber)) continue;
          const positionId = findPositionId(catInfo.betType, entry.numbers);
          if (!positionId) continue;
          const sortedNums = [...entry.numbers].sort((a, b) => a - b).join("-");
          const positionLabel = `${catInfo.label} ${sortedNums}`;
          const limitMultiplier = catInfo.limitMultiplier;
          const stakeOnPos = playPerUnit * limitMultiplier;
          let acc = posMap.get(positionId);
          if (!acc) {
            acc = { positionLabel, limitMultiplier, contributions: [], totalStake: 0 };
            posMap.set(positionId, acc);
          }
          acc.contributions.push({ completeLabel, playPerUnit, stakeOnPos });
          acc.totalStake += stakeOnPos;
        }
      }
    };

    // Dozen complete
    if (game.dozenCompleteBet) {
      const { amount, dozen } = game.dozenCompleteBet;
      const dozenNum = dozen === "1ST_12" ? 1 : dozen === "2ND_12" ? 2 : 3;
      const dozenRule = (rules.dozenComplete as { dozens: Array<{ dozen: number; chipsRequired: number; bets: Record<string, Array<{ numbers: number[]; chips: number }>> }> }).dozens.find(d => d.dozen === dozenNum);
      if (dozenRule) addCompleteWinningPositions("Комплит дюжины", amount, dozenRule.chipsRequired, dozenRule.bets as Record<string, Array<{ numbers: number[]; chips: number }>>);
    }

    // Number completes
    for (const ncb of game.numberCompleteBets) {
      const completeRule = (rules.completeBets as Array<{ number: number; chipsRequired: number; bets: Record<string, Array<{ numbers: number[]; chips: number }>> }>).find(cb => cb.number === ncb.number);
      if (!completeRule) continue;
      addCompleteWinningPositions(`Комплит №${ncb.number}`, ncb.amount, ncb.chipsRequired, completeRule.bets as Record<string, Array<{ numbers: number[]; chips: number }>>);
    }

    // Build final winning positions with limit check
    const winningPositions: CompleteNumberPayoutWinningPos[] = [];
    let correctAnswer = 0;
    for (const acc of posMap.values()) {
      const positionLimit = maxBet * acc.limitMultiplier;
      const atMax = acc.totalStake >= positionLimit;
      const contributionToAnswer = atMax
        ? maxBet
        : acc.contributions.reduce((s, c) => s + c.playPerUnit, 0);
      winningPositions.push({
        positionLabel: acc.positionLabel,
        limitMultiplier: acc.limitMultiplier,
        contributions: acc.contributions,
        totalStake: acc.totalStake,
        positionLimit,
        atMax,
        contributionToAnswer,
      });
      correctAnswer += contributionToAnswer;
    }

    setCompleteNumberPayoutRecord({ userAnswer, correctAnswer, correct: userAnswer === correctAnswer, drawnNumber, winningPositions });
    setCompleteNumberPayoutInput("");
    setQuizPhase(decidePostTrackFieldPhase(game, activeSeries, rules));
  }, [game, quizPhase, completeNumberPayoutInput, activeSeries, settings.maxBet, settings.completeMultiplicity, getAllRules]);

  // ── Series Field Payout (выигравшие серии → сумма в поле) ───────────────────
  const handleCheckSeriesFieldPayout = useCallback(() => {
    if (!game || !quizPhase || quizPhase.kind !== "seriesFieldPayout") return;
    const userAnswer = parseInt(seriesFieldPayoutInput || "0", 10) || 0;
    const mult = Math.max(10, Math.min(1000, settings.multiplicity ?? 10));
    const maxBet = Math.max(1, settings.maxBet);
    const chipValue = settings.chipValue ?? 10;
    const completeMultiplicity = Math.max(1, settings.completeMultiplicity);
    const rules = getAllRules();

    type TrackRuleT = { divisor: number; bets: Record<string, Array<{ numbers: number[]; chips: number }>> };
    type CompleteBetRule = { number: number; chipsRequired: number; bets: Record<string, Array<{ numbers: number[]; chips: number }>> };
    type DozenBetRule = { dozen: number; chipsRequired: number; bets: Record<string, Array<{ numbers: number[]; chips: number }>> };

    // Steps 1–4: For each winning series, find its winning physical positions
    // and group them by positionId (normalised). Accumulate series amounts per position.
    const posAccMap = new Map<string, {
      positionLabel: string;
      limitMultiplier: number;
      seriesContributions: Array<{ seriesLabel: string; amount: number; playPerUnit: number; chips: number; contribution: number }>;
      totalSeriesAmount: number;
    }>();

    for (const tb of activeSeries) {
      const trackRule = (rules.trackBets as Record<string, TrackRuleT>)[tb.type];
      if (!trackRule) continue;
      const { playPerUnit } = calcSeriesResult(tb.amount, trackRule.divisor, mult);
      if (playPerUnit <= 0) continue;

      // Skip series that don't win on the drawn number
      let seriesWins = false;
      for (const entries of Object.values(trackRule.bets)) {
        if (Array.isArray(entries) && entries.some(e => Array.isArray(e.numbers) && e.numbers.includes(game.drawnNumber))) {
          seriesWins = true;
          break;
        }
      }
      if (!seriesWins) continue;

      for (const [catKey, entries] of Object.entries(trackRule.bets)) {
        if (!Array.isArray(entries)) continue;
        const catInfo = DOZEN_COMPLETE_CATEGORY_MAP[catKey];
        if (!catInfo) continue;
        for (const entry of entries) {
          if (!Array.isArray(entry.numbers) || !entry.numbers.includes(game.drawnNumber)) continue;
          const positionId = findPositionId(catInfo.betType, entry.numbers);
          if (!positionId) continue;
          const sortedNums = [...entry.numbers].sort((a, b) => a - b).join("-");
          const positionLabel = `${catInfo.label} ${sortedNums}`;

          const contribution = playPerUnit * entry.chips;
          let acc = posAccMap.get(positionId);
          if (!acc) {
            acc = { positionLabel, limitMultiplier: catInfo.limitMultiplier, seriesContributions: [], totalSeriesAmount: 0 };
            posAccMap.set(positionId, acc);
          }
          acc.seriesContributions.push({ seriesLabel: tb.label, amount: tb.amount, playPerUnit, chips: entry.chips, contribution });
          acc.totalSeriesAmount += contribution;
        }
      }
    }

    // Step 5: Compute existing field amounts per position (color + cash + completes)
    const colorByPos = new Map<string, number>();
    for (const stack of game.chips) {
      colorByPos.set(stack.positionId, (colorByPos.get(stack.positionId) ?? 0) + stack.count * chipValue);
    }
    const cashByPos = new Map<string, number>();
    for (const cc of game.cashChipStacks) {
      cashByPos.set(cc.positionId, (cashByPos.get(cc.positionId) ?? 0) + cc.denomination);
    }
    const completeByPos = new Map<string, number>();
    const addCompleteContribToPos = (
      betsRule: Record<string, Array<{ numbers: number[]; chips: number }>>,
      playPerUnit: number,
    ) => {
      for (const [catKey, entries] of Object.entries(betsRule)) {
        const catInfo = DOZEN_COMPLETE_CATEGORY_MAP[catKey];
        if (!catInfo || !Array.isArray(entries)) continue;
        for (const entry of entries) {
          if (!Array.isArray(entry.numbers)) continue;
          const positionId = findPositionId(catInfo.betType, entry.numbers);
          if (!positionId) continue;
          completeByPos.set(positionId, (completeByPos.get(positionId) ?? 0) + playPerUnit * entry.chips);
        }
      }
    };

    if (game.dozenCompleteBet) {
      const { amount, dozen } = game.dozenCompleteBet;
      const dozenNum = dozen === "1ST_12" ? 1 : dozen === "2ND_12" ? 2 : 3;
      const dozenRule = (rules.dozenComplete as { dozens: DozenBetRule[] }).dozens.find(d => d.dozen === dozenNum);
      if (dozenRule) {
        const { playPerUnit: ppu } = calcOneCompleteChange(amount, dozenRule.chipsRequired, maxBet, completeMultiplicity);
        if (ppu > 0) addCompleteContribToPos(dozenRule.bets as Record<string, Array<{ numbers: number[]; chips: number }>>, ppu);
      }
    }
    for (const ncb of game.numberCompleteBets) {
      const completeRule = (rules.completeBets as CompleteBetRule[]).find(cb => cb.number === ncb.number);
      if (!completeRule) continue;
      const { playPerUnit: ppu } = calcOneCompleteChange(ncb.amount, ncb.chipsRequired, maxBet, completeMultiplicity);
      if (ppu > 0) addCompleteContribToPos(completeRule.bets as Record<string, Array<{ numbers: number[]; chips: number }>>, ppu);
    }

    // Steps 6–10: For each unique winning position, determine free capacity and accepted amount
    const positions: SeriesFieldPayoutPositionSummary[] = [];
    let correctAnswer = 0;

    for (const [positionId, acc] of posAccMap.entries()) {
      const colorAmount   = colorByPos.get(positionId) ?? 0;
      const cashAmount    = cashByPos.get(positionId) ?? 0;
      const completeAmount = completeByPos.get(positionId) ?? 0;
      const fieldTotal    = colorAmount + cashAmount + completeAmount;
      const positionLimit = maxBet * acc.limitMultiplier;
      // Step 6: cap field at position limit (already-given field change excluded)
      const effectiveOccupied = Math.min(fieldTotal, positionLimit);
      const freeCapacity  = Math.max(0, positionLimit - effectiveOccupied);
      const acceptedAmount = Math.min(acc.totalSeriesAmount, freeCapacity);

      positions.push({
        positionId,
        positionLabel: acc.positionLabel,
        limitMultiplier: acc.limitMultiplier,
        seriesContributions: acc.seriesContributions,
        totalSeriesAmount: acc.totalSeriesAmount,
        colorAmount,
        cashAmount,
        completeAmount,
        fieldTotal,
        positionLimit,
        effectiveOccupied,
        freeCapacity,
        acceptedAmount,
      });
      correctAnswer += acceptedAmount;
    }

    setSeriesFieldPayoutRecord({ userAnswer, correctAnswer, correct: userAnswer === correctAnswer, positions });
    setSeriesFieldPayoutInput("");
    const rulesNow = getAllRules();
    const neighboursMapAfterSeries = rulesNow.neighbours as Record<string, number[]>;
    const hasNeighboursBetsAfterSeries = game.neighboursBets.length > 0;
    setQuizPhase(hasNeighboursBetsAfterSeries ? { kind: "neighboursPayout" } : { kind: "field" });
  }, [game, quizPhase, seriesFieldPayoutInput, activeSeries, settings.multiplicity, settings.maxBet, settings.chipValue, settings.completeMultiplicity, getAllRules]);

  // ── Neighbours Payout (выигравшие соседи → сумма в номер) ───────────────────
  const handleCheckNeighboursPayout = useCallback(() => {
    if (!game || !quizPhase || quizPhase.kind !== "neighboursPayout") return;
    const userAnswer = parseInt(neighboursPayoutInput || "0", 10) || 0;
    const maxBet = Math.max(1, settings.maxBet);
    const chipValue = settings.chipValue ?? 10;
    const completeMultiplicity = Math.max(1, settings.completeMultiplicity);
    const rules = getAllRules();
    const neighboursMap = rules.neighbours as Record<string, number[]>;
    const winningNumber = game.drawnNumber;
    const suPositionId = `su-${winningNumber}`;

    // Steps 1 & 2: Find winning neighbours and their per-number amounts
    const winningNeighbours: NeighboursPayoutWinLine[] = [];
    let totalNeighboursAmount = 0;
    for (const nb of game.neighboursBets) {
      const nums = neighboursMap[String(nb.number)];
      if (!Array.isArray(nums) || !nums.includes(winningNumber)) continue;
      totalNeighboursAmount += nb.baseAmount;
      winningNeighbours.push({ label: `Соседи ${nb.number}`, totalAmount: nb.amount, amountPerNumber: nb.baseAmount });
    }

    // Neighbours always play on Straight Up of the winning number; positionLimit = maxBet × 1
    const positionLimit = maxBet;

    // Step 3: Cap total neighbours amount by position limit
    const cappedNeighboursAmount = Math.min(totalNeighboursAmount, positionLimit);

    // Step 5: Calculate already-occupied sum on Straight Up {winningNumber}

    // Color chips
    const colorContrib = game.chips
      .filter(s => s.positionId === suPositionId)
      .reduce((sum, s) => sum + s.count * chipValue, 0);

    // Cash chips
    const cashContrib = game.cashChipStacks
      .filter(cc => cc.positionId === suPositionId)
      .reduce((sum, cc) => sum + cc.denomination, 0);

    // Completes — only their straightUp contribution to the winning number
    type CompleteBetRule = { number: number; chipsRequired: number; bets: Record<string, Array<{ numbers: number[]; chips: number }>> };
    type DozenBetRule = { dozen: number; chipsRequired: number; bets: Record<string, Array<{ numbers: number[]; chips: number }>> };
    let completeContrib = 0;
    for (const ncb of game.numberCompleteBets) {
      const completeRule = (rules.completeBets as CompleteBetRule[]).find(cb => cb.number === ncb.number);
      if (!completeRule) continue;
      const { playPerUnit } = calcOneCompleteChange(ncb.amount, ncb.chipsRequired, maxBet, completeMultiplicity);
      const suEntries = completeRule.bets["straightUp"];
      if (!Array.isArray(suEntries)) continue;
      for (const entry of suEntries) {
        if (!Array.isArray(entry.numbers) || !entry.numbers.includes(winningNumber)) continue;
        completeContrib += playPerUnit * entry.chips;
      }
    }
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
            completeContrib += playPerUnit * entry.chips;
          }
        }
      }
    }

    // Winning series — use the ACCEPTED amount from the previous seriesFieldPayout question,
    // not a fresh recalculation, so the limit already applied there is respected.
    let seriesContrib = 0;
    if (seriesFieldPayoutRecord) {
      const seriesPos = seriesFieldPayoutRecord.positions.find(p => p.positionId === suPositionId);
      if (seriesPos) seriesContrib = seriesPos.acceptedAmount;
    }

    // Step 6: fieldTotal, cap at positionLimit to account for previously returned field change
    const fieldTotal = colorContrib + cashContrib + completeContrib + seriesContrib;
    const effectiveOccupied = Math.min(fieldTotal, positionLimit);

    // Steps 8–9: Free capacity and accepted amount
    const freeCapacity = Math.max(0, positionLimit - effectiveOccupied);
    const correctAnswer = Math.min(cappedNeighboursAmount, freeCapacity);

    setNeighboursPayoutRecord({
      userAnswer,
      correctAnswer,
      correct: userAnswer === correctAnswer,
      winningNeighbours,
      totalNeighboursAmount,
      cappedNeighboursAmount,
      colorContrib,
      cashContrib,
      completeContrib,
      seriesContrib,
      fieldTotal,
      positionLimit,
      effectiveOccupied,
      freeCapacity,
      winningNumber,
    });
    setNeighboursPayoutInput("");
    setQuizPhase({ kind: "field" });
  }, [game, quizPhase, neighboursPayoutInput, seriesFieldPayoutRecord, settings.maxBet, settings.chipValue, settings.completeMultiplicity, getAllRules]);

  function buildAttestationAnswers(): TrainingAnswer[] {
    const answers: TrainingAnswer[] = [];
    const add = (
      questionId: string,
      question: string,
      record: { userAnswer: number; correctAnswer: number; correct: boolean } | null,
    ) => {
      if (!record) return;
      answers.push({
        questionId,
        question,
        answer: record.userAnswer,
        correctAnswer: record.correctAnswer,
        correct: record.correct,
      });
    };

    add("completes", "Посчитайте сдачу с кратности приема ставок «комплит».", completesRecord);
    add("completes-intersection", "Посчитайте общую сдачу с поля, без учета трека.", intersectionRecord);
    add("series", "Посчитайте общую сдачу с кратности приема серий.", seriesRecord);
    add(
      "track-intersection",
      "Посчитайте общую сдачу с трека, без учета ставок на поле",
      trackIntersectionRecord,
    );
    add(
      "track-field-intersection",
      "Посчитайте сдачу с пересечений ставок на треке со ставками на поле.",
      trackFieldIntersectionRecord,
    );
    add(
      "complete-number-payout",
      "Какую общую сумму нужно поставить в номер с выигрышных ставок «комплит»?",
      completeNumberPayoutRecord,
    );
    add(
      "series-field-payout",
      "Какую общую сумму нужно выставить в поле с выигрышных серий?",
      seriesFieldPayoutRecord,
    );
    add(
      "neighbours-payout",
      "Какую общую сумму нужно выставить в поле со ставок «соседи номера»?",
      neighboursPayoutRecord,
    );
    add("field-payout", "Посчитайте общую сумму выплаты.", fieldRecord);
    add(
      "color-payout",
      colorPayoutRecord
        ? `Выплата через ${colorPayoutRecord.cashPayout}. Посчитайте остаток выплаты в «цвете».`
        : "Посчитайте остаток выплаты в «цвете».",
      colorPayoutRecord,
    );
    return answers;
  }

  function getMissingAttestationQuestionIds(): string[] {
    if (!game) return ["game"];
    const expected = new Set<string>();
    if (hasCompletesQuestion) expected.add("completes");
    if (game.chips.length > 0 || game.cashChipStacks.length > 0) expected.add("completes-intersection");
    if (activeSeries.length > 0) expected.add("series");
    if (hasTrackIntersectionQuestion) expected.add("track-intersection");
    if (hasTrackFieldIntersectionQuestion) expected.add("track-field-intersection");
    if (anyCompletePositionWon) expected.add("complete-number-payout");
    if (anySeriesWon) expected.add("series-field-payout");
    if (game.neighboursBets.length > 0) expected.add("neighbours-payout");
    expected.add("field-payout");
    if (colorPayoutData) expected.add("color-payout");

    const answered = new Set(buildAttestationAnswers().map((answer) => answer.questionId));
    return [...expected].filter((questionId) => !answered.has(questionId));
  }

  function buildReportSnapshot(): RouletteReportSnapshot {
    return {
      completesRecord: completesRecord ?? undefined,
      intersectionRecord: intersectionRecord ?? undefined,
      seriesRecord: seriesRecord ?? undefined,
      trackIntersectionRecord: trackIntersectionRecord ?? undefined,
      trackFieldIntersectionRecord: trackFieldIntersectionRecord ?? undefined,
      completeTrackIntersectionRecord: completeTrackIntersectionRecord ?? undefined,
      completeNumberPayoutRecord: completeNumberPayoutRecord ?? undefined,
      seriesFieldPayoutRecord: seriesFieldPayoutRecord ?? undefined,
      neighboursPayoutRecord: neighboursPayoutRecord ?? undefined,
      fieldRecord: fieldRecord ?? undefined,
      colorPayoutRecord: colorPayoutRecord ?? undefined,
    };
  }

  function handleCompleteAttestation() {
    if (!isAttestationMode || quizPhase?.kind !== "report" || !onCompleteAttestation) return;
    const missing = getMissingAttestationQuestionIds();
    if (missing.length > 0) {
      setAttestationCompletionError("Не все обязательные вопросы имеют ответы.");
      return;
    }
    const error = onCompleteAttestation(buildAttestationAnswers(), buildReportSnapshot());
    setAttestationCompletionError(error);
  }

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
  const showReportField  = quizPhase?.kind === "report" || readOnlyReport;

  // ── Focus Mode ───────────────────────────────────────────────────────────────
  // "complete-multiplicity"       : dims the whole field+track; complete bets
  //                                 float above with a pulsing cyan glow.
  // "complete-field-intersections": dims only the track; field + completes stay
  //                                 at full brightness, no glow/animation.
  // "complete-track-intersections":        dims field only (same overlay as Q3); complete bets
  //                                        float above because they render after this overlay.
  // "winning-number-and-complete-only":    dims entire table (field + track); only the winning
  //                                        number cell and winning complete float above.
  type FocusMode = "none" | "complete-multiplicity" | "complete-field-intersections" | "track-series-neighbours-intersections" | "dim-complete-bets-only" | "complete-track-intersections" | "winning-number-and-complete-only";
  const focusMode: FocusMode =
    quizPhase?.kind === "completes"                    ? "complete-multiplicity" :
    quizPhase?.kind === "completesIntersection"        ? "complete-field-intersections" :
    quizPhase?.kind === "series"                       ? "track-series-neighbours-intersections" :
    quizPhase?.kind === "seriesFieldPayout"            ? "track-series-neighbours-intersections" :
    quizPhase?.kind === "trackIntersection"            ? "track-series-neighbours-intersections" :
    quizPhase?.kind === "trackFieldIntersection"       ? "none" :
    quizPhase?.kind === "neighboursPayout"             ? "dim-complete-bets-only" :
    quizPhase?.kind === "completeTrackIntersection"    ? "complete-track-intersections" :
    quizPhase?.kind === "completeNumberPayout"         ? "winning-number-and-complete-only" :
    "none";

  // In report mode use the immutable snapshot; otherwise use live game (hidden when winning field active)
  const fieldSource = showReportField
    ? initialRoundSnapshot
    : (showWinningField ? null : game);
  // The generator keeps individual denominations for payout/report logic, but
  // the initial field shows one cash chip per physical position with the
  // summed amount.
  const cashDisplayStacks = (() => {
    const totals = new Map<string, number>();
    for (const stack of fieldSource?.cashChipStacks ?? []) {
      totals.set(stack.positionId, (totals.get(stack.positionId) ?? 0) + stack.denomination);
    }
    return [...totals.entries()].map(([positionId, denomination]) => ({ positionId, denomination }));
  })();

  const hasCompletesQuestion = settings.completeField === "yes" || settings.completeDozen === "yes";
  // trackIntersection: shown when ANY track bet present (series or neighbours), regardless of field bets.
  const hasTrackBets = activeSeries.length > 0 || (game?.neighboursBets?.length ?? 0) > 0;
  const hasTrackIntersectionQuestion = hasTrackBets;
  // trackFieldIntersection: shown only when BOTH track bets AND field bets (color/cash/completes) present.
  const hasTrackFieldBets = (game?.chips?.length ?? 0) > 0
    || (game?.cashChipStacks?.length ?? 0) > 0
    || !!game?.dozenCompleteBet
    || (game?.numberCompleteBets?.length ?? 0) > 0;
  const hasTrackFieldIntersectionQuestion = hasTrackBets && hasTrackFieldBets;
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
  // True when at least one complete bet exists in the round — determines whether the completeNumberPayout question is shown.
  // The question appears regardless of whether the complete bet covers the winning number.
  const anyCompletePositionWon = !!game && (!!game.dozenCompleteBet || game.numberCompleteBets.length > 0);
  const hasCompleteTrackQuestion = hasCompletesQuestion && hasTrackIntersectionQuestion;
  const seriesBaseNum = hasCompletesQuestion ? 3 : 1;
  const trackIntQuestionNum = seriesBaseNum + (activeSeries.length > 0 ? 1 : 0);
  const trackFieldIntQuestionNum = trackIntQuestionNum + (hasTrackIntersectionQuestion ? 1 : 0);
  const completeTrackIntQuestionNum = trackFieldIntQuestionNum + (hasTrackFieldIntersectionQuestion ? 1 : 0);
  const completeNumberPayoutQuestionNum = completeTrackIntQuestionNum; // completeTrackIntersection question excluded
  const seriesFieldPayoutQuestionNum = completeNumberPayoutQuestionNum + (anyCompletePositionWon ? 1 : 0);
  const neighboursPayoutQuestionNum = seriesFieldPayoutQuestionNum + (anySeriesWon ? 1 : 0);
  const fieldQuestionNum = (hasCompletesQuestion ? 2 : 0) + (activeSeries.length > 0 ? 1 : 0) + (hasTrackIntersectionQuestion ? 1 : 0) + (hasTrackFieldIntersectionQuestion ? 1 : 0) + (anyCompletePositionWon ? 1 : 0) + (anySeriesWon ? 1 : 0) + ((game?.neighboursBets?.length ?? 0) > 0 ? 1 : 0) + 1; // completeTrackIntersection question excluded
  const colorPayoutQuestionNum = fieldQuestionNum + 1;

  return (
    <div className={showReportField ? "roulette-page roulette-page--report" : "roulette-page"}>
      {/* Controls */}
      <div className="controls-bar">
        {isAttestationMode ? (
          <button className="grid-toggle-btn settings-open-btn" onClick={onBackToAttestation}>
            ← Назад к аттестации
          </button>
        ) : (
          <>
            <button className="grid-toggle-btn spin-btn" onClick={handleSpin} disabled={isSpinning}>
              {isSpinning ? "⏳ Spin…" : "▶ Spin"}
            </button>
            {onBackHome && (
              <button className="grid-toggle-btn" onClick={onBackHome}>
                ← На главную
              </button>
            )}
            <button className="grid-toggle-btn settings-open-btn" onClick={onOpenSettings}>
              ⚙ Настройки
            </button>
            <button className="grid-toggle-btn" onClick={onOpenDebug} disabled={isSpinning}>
              🔧 Отладка
            </button>
          </>
        )}
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

          <defs>
          </defs>

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

          {/* ── Track group — all track elements wrapped together ── */}
          <g
            id="roulette-track"
          >

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

          </g>{/* /roulette-track */}

          {/* ── Track focus overlay — darkens entire track area uniformly; same mechanism as complete-multiplicity ── */}
          {focusMode === "complete-field-intersections" && (() => {
            const trackTop = Math.min(trackParams.topY1, trackParams.arcRY[0]) - 10;
            const shift    = BASE_HEIGHT * 0.03;
            const top      = trackTop - shift;
            return (
              <rect
                x={0} y={top}
                width={BASE_WIDTH} height={BASE_HEIGHT - top}
                fill="rgba(0,0,0,0.62)"
                style={{ pointerEvents: "none", transition: "opacity 200ms ease" }}
              />
            );
          })()}

          {/* Winning number highlight */}
          {game && (() => {
            const wz = gridZones.find(z => z.number === game.drawnNumber);
            if (!wz) return null;
            // Zero with a winning complete uses a compact badge (rendered in pass 2) — skip full-cell polygon here
            if (game.drawnNumber === 0 && fieldSource?.numberCompleteBets.some(ncb => ncb.number === 0)) return null;
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

          {/* Chips — skip positions covered by winningFieldChips when winning field is active */}
          {fieldSource && fieldSource.chips.filter(stack =>
            !showWinningField || !(winningFieldChips?.some(e => e.positionId === stack.positionId))
           ).map(stack => {
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

          {/* Cash chips — skip positions covered by winningFieldChips when winning field is active */}
          {cashDisplayStacks.filter(stack =>
            !showWinningField || !(winningFieldChips?.some(e => e.positionId === stack.positionId))
           ).map(stack => {
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

          {/* Winning field — solo color chips: keep as original blue chip.
               Use capped chip count (colorCapped / chipValue) so that if completes
               reduced the available capacity the shown count matches the payout calc. */}
          {showWinningField && winningFieldChips && winningFieldChips.filter(e => e.displayAs === "color").map(entry => {
            const pos = chipPosMap.get(entry.positionId);
            if (!pos) return null;
            const chipValue = settings.chipValue ?? 10;
            const count = Math.max(1, Math.round(entry.colorCapped / chipValue));
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

          {/* ── Focus overlay — darkens field + track; sits above all regular bets ── */}
          {focusMode === "complete-multiplicity" && (
            <rect
              x={0} y={0} width={BASE_WIDTH} height={BASE_HEIGHT}
              fill="rgba(0,0,0,0.62)"
              style={{ pointerEvents: "none", transition: "opacity 200ms ease" }}
            />
          )}

          {/* ── Q6 focus overlay — dims main field only; same geometry as Q3 overlay.
               Placed immediately before the complete bets group so those bets render
               above it (higher z-order) without any duplication. Track stays bright
               because the rect only covers y=0..trackTop. ── */}
          {focusMode === "complete-track-intersections" && (() => {
            const trackTop = Math.min(trackParams.topY1, trackParams.arcRY[0]) - 10;
            const BOTTOM_INSET = 24;
            const fieldH = trackTop - BOTTOM_INSET;
            return (
              <rect
                x={0} y={0}
                width={BASE_WIDTH} height={fieldH * 0.99}
                rx={0} ry={0}
                fill="rgba(0,0,0,0.62)"
                style={{ pointerEvents: "none", transition: "opacity 180ms ease" }}
              />
            );
          })()}

          {/* ── Complete bets — rendered above the focus overlay ── */}
          <g
            className={focusMode === "complete-multiplicity" ? "complete-bets-focus" : undefined}
            style={{
              opacity: focusMode === "dim-complete-bets-only" ? 0.35 : 1,
              transition: "opacity 200ms ease",
            }}
          >

          {/* Number complete highlights — cyan fill (pass 1, skip winning number so yellow shows on top) */}
          {fieldSource && fieldSource.numberCompleteBets.map(ncb => {
            if (game?.drawnNumber === ncb.number) return null;
            const wz = gridZones.find(z => z.number === ncb.number);
            if (!wz) return null;
            if (ncb.number === 0) {
              const refZ = gridZones.find(z => z.number === 1);
              const refPts = refZ?.pts.split(/\s+/) ?? [];
              const rxs = refPts.map(p => Number(p.split(",")[0])).filter(n => !isNaN(n));
              const rys = refPts.map(p => Number(p.split(",")[1])).filter(n => !isNaN(n));
              const bw = rxs.length >= 2 ? Math.max(...rxs) - Math.min(...rxs) : 60;
              const bh = rys.length >= 2 ? Math.max(...rys) - Math.min(...rys) : 60;
              const rx = 7;
              return (
                <g key={`ncb-hl-${ncb.number}`} style={{ pointerEvents: "none" }}>
                  <rect x={wz.cx - bw / 2} y={wz.cy - bh / 2} width={bw} height={bh} rx={rx}
                    fill="rgba(0, 212, 255, 0.42)"
                    stroke="#00D4FF"
                    strokeWidth="3" />
                </g>
              );
            }
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

          {/* Number complete — pass 2: cyan border for winning+complete, then "C" for all */}
          {fieldSource && fieldSource.numberCompleteBets.map(ncb => {
            const wz = gridZones.find(z => z.number === ncb.number);
            if (!wz) return null;
            const isWinning = game?.drawnNumber === ncb.number;

            // ── Zero complete: badge sized like a standard number cell ──
            if (ncb.number === 0) {
              const refZ = gridZones.find(z => z.number === 1);
              const refPts = refZ?.pts.split(/\s+/) ?? [];
              const rxs = refPts.map(p => Number(p.split(",")[0])).filter(n => !isNaN(n));
              const rys = refPts.map(p => Number(p.split(",")[1])).filter(n => !isNaN(n));
              const bw = rxs.length >= 2 ? Math.max(...rxs) - Math.min(...rxs) : 60;
              const bh = rys.length >= 2 ? Math.max(...rys) - Math.min(...rys) : 60;
              const rx = 7;
              return (
                <g key={`ncb-post-${ncb.number}`} style={{ pointerEvents: "none" }}>
                  {isWinning ? (
                    // Winning zero: full compact badge — yellow fill + cyan border + C
                    <>
                      <rect x={wz.cx - bw / 2 - 3} y={wz.cy - bh / 2 - 3} width={bw + 6} height={bh + 6} rx={rx + 2}
                        fill="none" stroke="rgba(255,229,0,0.45)" strokeWidth="3" />
                      <rect x={wz.cx - bw / 2} y={wz.cy - bh / 2} width={bw} height={bh} rx={rx}
                        fill="rgba(255,255,60,0.82)" stroke="#00D4FF" strokeWidth="5" opacity="0.95"
                        style={{ filter: "drop-shadow(0 0 8px rgba(0,212,255,0.60))" }} />
                    </>
                  ) : (
                    // Non-winning zero: cyan border
                    <rect x={wz.cx - bw / 2} y={wz.cy - bh / 2} width={bw} height={bh} rx={rx}
                      fill="none" stroke="#00D4FF" strokeWidth="3" />
                  )}
                  {/* "C" symbol */}
                  <text x={wz.cx} y={wz.cy}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={Math.round(bh * 0.80)} fontWeight="900"
                    fill="#D8F4FF"
                    stroke="rgba(0,200,255,0.65)" strokeWidth="3" paintOrder="stroke"
                    opacity={isWinning ? 0.92 : 0.72}
                    style={{ pointerEvents: "none" }}>
                    C
                  </text>
                </g>
              );
            }

            // ── Numbers 1–36 ──
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
                {/* "C" watermark */}
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

          {/* Dozen complete badge — cyan rectangle with "C" watermark letter */}
          {fieldSource?.dozenCompleteBet && (() => {
            const { x, y } = fieldSource.dozenCompleteBet!.position;
            const bw = 88; const bh = 62;
            const rx = 7;
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
                {/* "C" letter */}
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

          </g>{/* /complete-bets */}

          {/* ── Q3 focus overlay — dims main betting field only; track stays bright.
               Placed last so it renders above field chips and complete bets.
               Covers y=0..trackTop only — track elements live at y≥trackTop so are unaffected. ── */}
          {focusMode === "track-series-neighbours-intersections" && (() => {
            const trackTop = Math.min(trackParams.topY1, trackParams.arcRY[0]) - 10;
            const BOTTOM_INSET = 24;
            const fieldH = trackTop - BOTTOM_INSET;
            return (
              <rect
                x={0} y={0}
                width={BASE_WIDTH} height={fieldH * 0.99}
                rx={0} ry={0}
                fill="rgba(0,0,0,0.62)"
                style={{ pointerEvents: "none", transition: "opacity 180ms ease" }}
              />
            );
          })()}

          {/* ── Q7 focus overlay — dims entire table (field + track) to all edges.
               Above it: only the winning number cell and the winning complete are re-drawn.
               Layer order: overlay → winning number → winning complete highlights + C badge. ── */}
          {focusMode === "winning-number-and-complete-only" && game && (() => {
            const drawnNumber = game.drawnNumber;
            const wz = gridZones.find(z => z.number === drawnNumber);
            if (!wz) return null;

            // The winning complete is the numberCompleteBet for the drawn number
            const winningComplete = fieldSource?.numberCompleteBets.find(ncb => ncb.number === drawnNumber);

            // Shared helper: compute badge rect dimensions for zero (same formula used throughout)
            const getZeroDims = () => {
              const refZ = gridZones.find(z => z.number === 1);
              const refPts = refZ?.pts.split(/\s+/) ?? [];
              const rxs = refPts.map(p => Number(p.split(",")[0])).filter(n => !isNaN(n));
              const rys = refPts.map(p => Number(p.split(",")[1])).filter(n => !isNaN(n));
              return {
                bw: rxs.length >= 2 ? Math.max(...rxs) - Math.min(...rxs) : 60,
                bh: rys.length >= 2 ? Math.max(...rys) - Math.min(...rys) : 60,
                brx: 7,
              };
            };

            return (
              <>
                {/* 1. Full-screen overlay — covers field and track to every edge */}
                <rect x={0} y={0} width={BASE_WIDTH} height={BASE_HEIGHT}
                  fill="rgba(0,0,0,0.62)"
                  style={{ pointerEvents: "none", transition: "opacity 180ms ease" }}
                />

                {/* 2. Winning number cell — yellow fill.
                     When drawnNumber=0 and there is a winning complete, the complete
                     section below renders the yellow badge (same logic as normal render). */}
                {!(drawnNumber === 0 && winningComplete) && (
                  <g style={{ pointerEvents: "none" }}>
                    <polygon points={wz.pts}
                      fill="rgba(255,255,60,0.55)"
                      stroke="#FFE500"
                      strokeWidth="4"
                      strokeLinejoin="round" />
                  </g>
                )}

                {/* 3. Winning complete — re-drawn above overlay at full brightness.
                     Mirrors the existing pass-1 + pass-2 rendering but filtered to
                     drawnNumber only, and with no opacity reduction. */}
                {winningComplete && (() => {
                  if (drawnNumber === 0) {
                    const { bw, bh, brx } = getZeroDims();
                    return (
                      <g style={{ pointerEvents: "none" }}>
                        {/* Zero winning+complete: yellow fill + cyan border (pass-1 highlight) */}
                        <rect x={wz.cx - bw / 2} y={wz.cy - bh / 2} width={bw} height={bh} rx={brx}
                          fill="rgba(0, 212, 255, 0.42)"
                          stroke="#00D4FF"
                          strokeWidth="3" />
                        {/* Pass-2 badge: yellow fill + cyan border + C */}
                        <rect x={wz.cx - bw / 2 - 3} y={wz.cy - bh / 2 - 3} width={bw + 6} height={bh + 6} rx={brx + 2}
                          fill="none" stroke="rgba(255,229,0,0.45)" strokeWidth="3" />
                        <rect x={wz.cx - bw / 2} y={wz.cy - bh / 2} width={bw} height={bh} rx={brx}
                          fill="rgba(255,255,60,0.82)" stroke="#00D4FF" strokeWidth="5" opacity="0.95" />
                        <text x={wz.cx} y={wz.cy}
                          textAnchor="middle" dominantBaseline="central"
                          fontSize={Math.round(bh * 0.80)} fontWeight="900"
                          fill="#D8F4FF"
                          stroke="rgba(0,200,255,0.65)" strokeWidth="3" paintOrder="stroke"
                          opacity="0.92"
                          style={{ pointerEvents: "none" }}>
                          C
                        </text>
                      </g>
                    );
                  }

                  // Numbers 1–36: yellow cell already drawn above; add cyan border + C watermark (pass-2)
                  const ysInPts = wz.pts.split(/\s+/).map(p => Number(p.split(",")[1])).filter(n => !isNaN(n));
                  const cellH = ysInPts.length >= 2 ? Math.max(...ysInPts) - Math.min(...ysInPts) : 60;
                  const cFontSize = Math.round(cellH * 0.85);
                  return (
                    <g style={{ pointerEvents: "none" }}>
                      {/* Cyan fill highlight (pass-1 equivalent — not skipped here because yellow is already painted) */}
                      <polygon points={wz.pts}
                        fill="rgba(0, 212, 255, 0.42)"
                        stroke="#00D4FF"
                        strokeWidth="3"
                        strokeLinejoin="round" />
                      {/* Cyan border + C watermark (pass-2) */}
                      <polygon points={wz.pts}
                        fill="none"
                        stroke="#00D4FF"
                        strokeWidth="5"
                        strokeLinejoin="round"
                        opacity="0.95" />
                      <text x={wz.cx} y={wz.cy}
                        textAnchor="middle" dominantBaseline="central"
                        fontSize={cFontSize} fontWeight="900" fill="#D8F4FF"
                        stroke="rgba(0,200,255,0.65)" strokeWidth="3" paintOrder="stroke"
                        opacity="0.72"
                        style={{ pointerEvents: "none" }}>
                        C
                      </text>
                    </g>
                  );
                })()}
              </>
            );
          })()}

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
          </>
        )}
        {(game?.dozenCompleteBet || (game?.numberCompleteBets && game.numberCompleteBets.length > 0)) && (
          <>
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
                <NumericKeypad value={completesInput} onChange={setCompletesInput} />
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
                  <span className="quiz-series-title">2. Посчитайте общую сдачу с поля, без учета трека.</span>
                  <span className="quiz-series-sub">Общая сдача</span>
                </div>
                <NumericKeypad value={intersectionInput} onChange={setIntersectionInput} />
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
                <NumericKeypad value={seriesInput} onChange={setSeriesInput} />
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
                  <span className="quiz-series-title">{trackIntQuestionNum}. Посчитайте общую сдачу с трека, без учета ставок на поле</span>
                  <span className="quiz-series-sub">Общая сдача</span>
                </div>
                <NumericKeypad value={trackIntersectionInput} onChange={setTrackIntersectionInput} />
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
                  <span className="quiz-series-title">{trackFieldIntQuestionNum}. Посчитайте сдачу с пересечений ставок на треке со ставками на поле.</span>
                  <span className="quiz-series-sub">Общая сдача</span>
                </div>
                <NumericKeypad value={trackFieldIntersectionInput} onChange={setTrackFieldIntersectionInput} />
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

            {/* Complete number payout question */}
            {quizPhase.kind === "completeNumberPayout" && (
              <div className="game-answer-area">
                <div className="quiz-series-header">
                  <span className="quiz-series-title">{completeNumberPayoutQuestionNum}. Какую общую сумму нужно поставить в номер с выигрышных ставок «комплит»?</span>
                  <span className="quiz-series-sub">Сумма</span>
                </div>
                <NumericKeypad value={completeNumberPayoutInput} onChange={setCompleteNumberPayoutInput} />
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
                <NumericKeypad value={seriesFieldPayoutInput} onChange={setSeriesFieldPayoutInput} />
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
                <NumericKeypad value={neighboursPayoutInput} onChange={setNeighboursPayoutInput} />
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
                <NumericKeypad value={fieldInput} onChange={setFieldInput} />
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
                <NumericKeypad value={colorPayoutInput} onChange={setColorPayoutInput} />
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
                  <div className="quiz-report-name">1. Посчитайте сдачу с кратности приема ставок «комплит».</div>
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
                  <div className="quiz-report-name">2. Посчитайте общую сдачу с поля, без учета трека.</div>
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
                        <div className="quiz-report-calc">Превышений лимитов по позициям основного поля не найдено — сдачи нет.</div>
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
                  <div className="quiz-report-name">{seriesBaseNum}. Посчитайте общую сдачу с кратности приема серий.</div>
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
                  <div className="quiz-report-name">{trackIntQuestionNum}. Посчитайте общую сдачу с трека, без учета ставок на поле</div>
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
                        <div className="quiz-report-calc">Превышений лимитов по позициям трека не найдено — сдачи нет.</div>
                      ) : (
                        <div className="quiz-report-calc">
                          {trackIntersectionRecord.lines.map((line, li) => (
                            <div key={li} style={{ marginBottom: 8 }}>
                              <strong>{line.label}</strong><br/>
                              {line.contributions.map(c => (
                                <span key={c.source}>{c.source}: {c.amount}<br/></span>
                              ))}
                              Общая ставка: {line.totalAmount}<br/>
                              Лимит {line.typeLabel} (×{line.limitMultiplier}): {line.positionLimit}<br/>
                              Сдача: {line.change}
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
                  <div className="quiz-report-name">{trackFieldIntQuestionNum}. Посчитайте сдачу с пересечений ставок на треке со ставками на поле.</div>
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
                        <div className="quiz-report-calc">Пересечений с дополнительной сдачей не найдено.</div>
                      ) : (
                        <div className="quiz-report-calc">
                          {trackFieldIntersectionRecord.lines.map((line, li) => (
                            <div key={li} style={{ marginBottom: 8 }}>
                              <strong>{line.label}</strong><br/>
                              Лимит: {line.positionLimit}<br/>
                              <em>Поле:</em><br/>
                              {line.colorAmount > 0 && <>• цвет: {line.colorAmount}<br/></>}
                              {line.cashAmount > 0 && <>• кэш: {line.cashAmount}<br/></>}
                              {line.completeAmount > 0 && <>• комплиты: {line.completeAmount}<br/></>}
                              Исходное поле: {line.fieldTotal}<br/>
                              Ранее возвращено с поля: {line.fieldPrevChange}<br/>
                              Принятое поле: {line.acceptedField}<br/>
                              <em>Трек:</em><br/>
                              Исходный трек: {line.trackTotal}<br/>
                              Ранее возвращено с трека: {line.trackPrevChange}<br/>
                              Принятый трек: {line.acceptedTrack}<br/>
                              После наложения: {line.acceptedField} + {line.acceptedTrack} = {line.combinedTotal}<br/>
                              Сдача с пересечения: max(0, {line.combinedTotal} − {line.positionLimit}) = {line.change}
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
                        <div>Выпавший номер: {completeNumberPayoutRecord.drawnNumber}</div>
                        {completeNumberPayoutRecord.winningPositions.length === 0 ? (
                          <div>Выигравших позиций комплитов нет — ответ 0.</div>
                        ) : (
                          <>
                            {completeNumberPayoutRecord.winningPositions.map((pos, pi) => (
                              <div key={pi} style={{ marginBottom: 8 }}>
                                <strong>{pos.positionLabel}</strong><br/>
                                {pos.contributions.map((c, ci) => (
                                  <span key={ci}>{c.completeLabel}, по {c.playPerUnit}: {c.stakeOnPos}<br/></span>
                                ))}
                                {pos.contributions.length > 1 && (
                                  <span>Общая ставка: {pos.totalStake}<br/></span>
                                )}
                                Лимит {pos.positionLabel}: {pos.positionLimit}<br/>
                                {pos.atMax ? (
                                  <span>Позиция играет по максимуму<br/></span>
                                ) : (
                                  <span>Превышения нет<br/></span>
                                )}
                                В номер поставить: {pos.contributionToAnswer}
                              </div>
                            ))}
                            <div className="quiz-report-total">
                              Итого: {completeNumberPayoutRecord.winningPositions.map(p => p.contributionToAnswer).join(" + ")} = {completeNumberPayoutRecord.correctAnswer}
                            </div>
                          </>
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
                        {seriesFieldPayoutRecord.positions.map((pos, pi) => (
                          <div key={pi} style={{ marginBottom: 10 }}>
                            <strong>Выигрышная позиция: {pos.positionLabel}</strong><br/>
                            {pos.seriesContributions.map((sc, si) => (
                              <span key={si}>
                                {sc.seriesLabel}: поставлено {sc.amount}, играет по {sc.playPerUnit}
                                {sc.chips > 1 ? ` × ${sc.chips} фишки = ${sc.contribution}` : ""}<br/>
                              </span>
                            ))}
                            {pos.seriesContributions.length > 1 && (
                              <span>Сумма серий на позиции: {pos.seriesContributions.map(sc => sc.contribution).join(" + ")} = {pos.totalSeriesAmount}<br/></span>
                            )}
                            Уже стоит на позиции:<br/>
                            <span style={{ paddingLeft: 12 }}>
                              цвет: {pos.colorAmount}<br/>
                            </span>
                            <span style={{ paddingLeft: 12 }}>
                              кэш: {pos.cashAmount}<br/>
                            </span>
                            <span style={{ paddingLeft: 12 }}>
                              комплиты: {pos.completeAmount}<br/>
                            </span>
                            <span style={{ paddingLeft: 12 }}>
                              всего: {pos.fieldTotal}<br/>
                            </span>
                            {pos.fieldTotal > pos.positionLimit && (
                              <span>Ранее возвращена сдача с поля: {pos.fieldTotal - pos.positionLimit}<br/></span>
                            )}
                            Фактически занято: {pos.effectiveOccupied}<br/>
                            Лимит {pos.positionLabel}: {pos.positionLimit}<br/>
                            Свободная ёмкость: {pos.positionLimit} − {pos.effectiveOccupied} = {pos.freeCapacity}<br/>
                            Серия должна поставить: {pos.totalSeriesAmount}<br/>
                            Фактически можно выставить: min({pos.totalSeriesAmount}, {pos.freeCapacity}) = {pos.acceptedAmount}
                          </div>
                        ))}
                        <div className="quiz-report-total">
                          Итого: {seriesFieldPayoutRecord.positions.map(p => p.acceptedAmount).join(" + ")} = {seriesFieldPayoutRecord.correctAnswer}
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
                          <strong>Выигрышная позиция: Straight Up {neighboursPayoutRecord.winningNumber}</strong><br/>
                          <strong>Выигравшие соседи:</strong><br/>
                          {neighboursPayoutRecord.winningNeighbours.map((line, li) => (
                            <span key={li}>{line.label}: {line.totalAmount} / 5 = {line.amountPerNumber}<br/></span>
                          ))}
                          Общая ставка соседей: {neighboursPayoutRecord.winningNeighbours.map(l => l.amountPerNumber).join(" + ")} = {neighboursPayoutRecord.totalNeighboursAmount}<br/>
                          Максимум Straight Up: {neighboursPayoutRecord.positionLimit}<br/>
                          {neighboursPayoutRecord.totalNeighboursAmount > neighboursPayoutRecord.positionLimit && (
                            <span>Соседи играют по максимуму: {neighboursPayoutRecord.cappedNeighboursAmount}<br/></span>
                          )}
                        </div>
                        <div style={{ marginBottom: 6 }}>
                          <strong>На позиции уже стоит:</strong><br/>
                          Серии: {neighboursPayoutRecord.seriesContrib}<br/>
                          Цветные ставки: {neighboursPayoutRecord.colorContrib}<br/>
                          Кэш: {neighboursPayoutRecord.cashContrib}<br/>
                          Комплиты: {neighboursPayoutRecord.completeContrib}<br/>
                          Всего: {neighboursPayoutRecord.fieldTotal}
                          {neighboursPayoutRecord.fieldTotal > neighboursPayoutRecord.positionLimit && (
                            <> → ранее возвращена сдача с поля: {neighboursPayoutRecord.fieldTotal - neighboursPayoutRecord.positionLimit}</>
                          )}<br/>
                          Фактически занято: {neighboursPayoutRecord.effectiveOccupied}
                        </div>
                        <div style={{ marginBottom: 6 }}>
                          Свободная ёмкость: {neighboursPayoutRecord.positionLimit} − {neighboursPayoutRecord.effectiveOccupied} = {neighboursPayoutRecord.freeCapacity}
                        </div>
                        <div className="quiz-report-total">
                          Соседи хотят поставить: {neighboursPayoutRecord.cappedNeighboursAmount}<br/>
                          Фактически можно выставить: min({neighboursPayoutRecord.cappedNeighboursAmount}, {neighboursPayoutRecord.freeCapacity}) = {neighboursPayoutRecord.correctAnswer}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {fieldRecord && (
                <div className={`quiz-report-item ${fieldRecord.correct ? "quiz-report-item--ok" : "quiz-report-item--err"}`}>
                  <div className="quiz-report-name">{fieldQuestionNum}. Посчитайте общую сумму выплаты.</div>
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
                              const hasSeparateComplete = e.positionType === "straight" && e.completeAmountAdded > 0;

                              // Per-source normal bets (non-zero only)
                              const normalParts: Array<{ label: string; amount: number }> = [];
                              if (e.colorCapped     > 0) normalParts.push({ label: "Цвет",   amount: e.colorCapped     });
                              if (e.cashCapped      > 0) normalParts.push({ label: "Кэш",    amount: e.cashCapped      });
                              if (e.seriesCapped    > 0) normalParts.push({ label: "Серии",  amount: e.seriesCapped    });
                              if (e.neighboursCapped > 0) normalParts.push({ label: "Соседи", amount: e.neighboursCapped });

                              // Per-complete summary for Straight Up (group by label)
                              type CompleteEntry = { label: string; count: number; playPerUnit: number; total: number };
                              const completeSummary: CompleteEntry[] = [];
                              if (hasSeparateComplete && completeNumberPayoutRecord) {
                                const byLabel = new Map<string, { playPerUnit: number; count: number }>();
                                for (const wp of completeNumberPayoutRecord.winningPositions) {
                                  for (const c of wp.contributions) {
                                    const cur = byLabel.get(c.completeLabel) ?? { playPerUnit: c.playPerUnit, count: 0 };
                                    cur.count += 1;
                                    byLabel.set(c.completeLabel, cur);
                                  }
                                }
                                for (const [label, { playPerUnit, count }] of byLabel) {
                                  completeSummary.push({ label, count, playPerUnit, total: count * playPerUnit });
                                }
                              }

                              return (
                                <div key={j} style={{ marginBottom: 8 }}>
                                  <strong>{typeLabel} {e.positionNums.join("-")}</strong><br/>

                                  {hasSeparateComplete ? (
                                    // ── Straight Up: show normal parts + complete parts separately ──
                                    <>
                                      {e.normalAmountCapped > 0 && (
                                        <>
                                          Обычные ставки:<br/>
                                          {normalParts.map((p, pi) => (
                                            <span key={pi}>— {p.label}: {p.amount}<br/></span>
                                          ))}
                                          {normalParts.length > 1
                                            ? <>Итого обычные: {normalParts.map(p => p.amount).join(" + ")} = {e.normalAmountCapped}<br/></>
                                            : <>Итого обычные: {e.normalAmountCapped}<br/></>
                                          }
                                        </>
                                      )}
                                      Выигрышные комплиты:<br/>
                                      {completeSummary.map((cs, ci) => (
                                        <span key={ci}>{cs.label}: {cs.count} пересечений × {cs.playPerUnit} = {cs.total}<br/></span>
                                      ))}
                                      {completeSummary.length > 1
                                        ? <>Итого комплиты: {completeSummary.map(cs => cs.total).join(" + ")} = {e.completeAmountAdded}<br/></>
                                        : <>Итого комплиты: {e.completeAmountAdded}<br/></>
                                      }
                                      Ставка комплитов не ограничивается максимумом Straight.<br/>
                                      {e.normalAmountCapped > 0
                                        ? <>Итоговая ставка Straight: {e.normalAmountCapped} + {e.completeAmountAdded} = {e.amount}<br/></>
                                        : <>Итоговая ставка Straight: {e.amount}<br/></>
                                      }
                                    </>
                                  ) : (
                                    // ── All other positions: show composition then total ──
                                    <>
                                      {normalParts.length > 0 && (
                                        <>
                                          Состав ставки:<br/>
                                          {normalParts.map((p, pi) => (
                                            <span key={pi}>— {p.label}: {p.amount}<br/></span>
                                          ))}
                                        </>
                                      )}
                                      {normalParts.length > 1
                                        ? <>Итоговая ставка: {normalParts.map(p => p.amount).join(" + ")} = {e.amount}<br/></>
                                        : <>Итоговая ставка: {e.amount}<br/></>
                                      }
                                    </>
                                  )}

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
              {isAttestationMode && !readOnlyReport && (
                <div className="attestation-completion-action">
                  <button className="game-check-btn" type="button" onClick={handleCompleteAttestation}>
                    Завершить аттестацию
                  </button>
                  {attestationCompletionError && (
                    <p className="dealer-action-error" role="alert">{attestationCompletionError}</p>
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
