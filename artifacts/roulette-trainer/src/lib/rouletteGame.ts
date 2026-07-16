import { ALL_BET_POSITIONS, BET_POSITIONS_MAP, PAYOUT, type BetPosition } from "@/data/betPositions";

export interface ChipStack {
  positionId: string;
  count: number;
}

export interface PayoutLine {
  label: string;
  chips: number;
  payout: number;
  chipValue: number;
  subtotal: number;
}

export interface TrackBet {
  type: "SERIE_5_8" | "ORPHELINS" | "SERIE_0_2_3" | "ZERO_SPIEL";
  label: string;
  amount: number;
  position: { x: number; y: number };
  source: "TRACK";
}

export interface DozenCompleteBet {
  type: "DOZEN_COMPLETE";
  label: string;
  dozen: "1ST_12" | "2ND_12" | "3RD_12";
  baseValue: number;
  amount: number;
  position: { x: number; y: number };
  source: "DOZEN_COMPLETE";
}

export interface NumberCompleteBet {
  number: number;
  chipsRequired: number;
  amount: number;
  position: { x: number; y: number };
}

export interface NeighboursBet {
  number: number;
  baseAmount: number;
  amount: number;
  position: { x: number; y: number };
  source: "NEIGHBOURS";
}

export interface CashChipStack {
  positionId: string;
  denomination: number; // one physical chip per entry; maps 1-to-1 to a unique field position
}

export interface GameState {
  drawnNumber: number;
  chips: ChipStack[];
  correctAnswer: number;
  breakdown: PayoutLine[];
  userAnswer: string;
  checkResult: "correct" | "incorrect" | null;
  trackBets: TrackBet[];
  dozenCompleteBet?: DozenCompleteBet;
  numberCompleteBets: NumberCompleteBet[];
  cashChipStacks: CashChipStack[];
  neighboursBets: NeighboursBet[];
}

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export function getNumberColor(n: number): "green" | "red" | "black" {
  if (n === 0) return "green";
  return RED_NUMBERS.has(n) ? "red" : "black";
}

const TYPE_LABELS: Record<string, string> = {
  straight: "Страйт-ап",
  split:    "Сплит",
  street:   "Стрит",
  corner:   "Корнер",
  sixline:  "Сикс-лайн",
};

// ── Position lookup by number (built once at module load) ─────────────────────
const POSITIONS_BY_NUMBER: ReadonlyMap<number, readonly BetPosition[]> = (() => {
  const map = new Map<number, BetPosition[]>();
  for (let n = 0; n <= 36; n++) map.set(n, []);
  for (const p of ALL_BET_POSITIONS) {
    for (const n of p.numbers) {
      map.get(n)!.push(p);
    }
  }
  return map;
})();

function posKey(p: BetPosition): string {
  return `${p.type}:${[...p.numbers].sort((a, b) => a - b).join("-")}`;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Distribute `total` into `count` non-negative integers summing to `total`, diff ≤ 1. */
export function distributeInteger(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const rem = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── COLOR chip generation ─────────────────────────────────────────────────────
//
// Each center number gets chips spread across a RANDOM SUBSET of valid positions
// around it. Distribution is intentionally uneven: some positions get many chips,
// some get a few, some are skipped entirely. This mimics natural player behaviour.

/** Select `count` unique center numbers; drawnNumber is always first. */
function selectCenterNumbers(drawnNumber: number, count: number): number[] {
  const selected = [drawnNumber];
  if (count <= 1) return selected;
  const pool = shuffle(
    Array.from({ length: 37 }, (_, i) => i).filter(i => i !== drawnNumber),
  );
  for (const n of pool) {
    if (selected.length >= count) break;
    selected.push(n);
  }
  return selected;
}

/**
 * Spread `chipsCount` chips across a random subset of valid positions for
 * `centerNum`. Distribution is random and uneven — some positions may be
 * skipped entirely. Results are appended to `result`.
 */
function spreadChips(
  centerNum: number,
  chipsCount: number,
  excludedIds: Set<string>,
  usedPositionIds: Set<string>,
  result: ChipStack[],
): void {
  if (chipsCount <= 0) return;

  const candidates = shuffle(
    (POSITIONS_BY_NUMBER.get(centerNum) ?? []).filter(
      p => !excludedIds.has(p.id) && !usedPositionIds.has(p.id),
    ),
  );
  if (candidates.length === 0) return;

  // Randomly select participating positions:
  // each position has a ~55% chance of being included, minimum 1.
  const participating: BetPosition[] = [];
  for (const pos of candidates) {
    if (Math.random() < 0.55) participating.push(pos);
  }
  if (participating.length === 0) participating.push(candidates[0]);

  // Cap at chipsCount to ensure each participating position can get ≥1 chip
  const active = participating.slice(0, chipsCount);
  const n = active.length;

  // Generate random weights to produce uneven distribution
  const weights = Array.from({ length: n }, () => Math.random() * Math.random() + 0.05);
  const weightSum = weights.reduce((a, b) => a + b, 0);

  // Floor-allocate chips proportionally
  const amounts = weights.map(w => Math.max(0, Math.floor((w / weightSum) * chipsCount)));
  let allocated = amounts.reduce((a, b) => a + b, 0);
  let remainder = chipsCount - allocated;

  // Distribute remainder to random positions
  const indices = shuffle(Array.from({ length: n }, (_, i) => i));
  for (let i = 0; remainder > 0; i++, remainder--) {
    amounts[indices[i % n]]++;
  }

  // Register and emit
  for (let i = 0; i < active.length; i++) {
    if (amounts[i] > 0) {
      usedPositionIds.add(active[i].id);
      result.push({ positionId: active[i].id, count: amounts[i] });
    }
  }
}

export function generateColorChips(
  drawnNumber: number,
  colorNumbersCount: number,
  totalChips: number,
  excludedIds: Set<string>,
): ChipStack[] {
  if (colorNumbersCount === 0 || totalChips === 0) return [];

  const requested = Math.min(colorNumbersCount, totalChips);
  const centerNumbers = selectCenterNumbers(drawnNumber, requested);
  const finalCount = centerNumbers.length;
  if (finalCount === 0) return [];

  // Fat / thin split (winning number at index 0 always goes to fat)
  const fatCount = Math.ceil(finalCount / 2);
  const thinCount = finalCount - fatCount;

  const rest = shuffle(centerNumbers.slice(1));
  const fatNumbers  = [centerNumbers[0], ...rest.slice(0, fatCount - 1)];
  const thinNumbers = rest.slice(fatCount - 1);

  // ~70% of chips to fat numbers, ~30% to thin
  const fatTotal  = thinCount === 0 ? totalChips : Math.round(totalChips * 0.7);
  const thinTotal = totalChips - fatTotal;

  const fatAmounts  = distributeInteger(fatTotal,  fatNumbers.length);
  const thinAmounts = distributeInteger(thinTotal, thinNumbers.length);

  const usedPositionIds = new Set<string>();
  const result: ChipStack[] = [];

  for (let i = 0; i < fatNumbers.length;  i++) {
    spreadChips(fatNumbers[i],  fatAmounts[i],  excludedIds, usedPositionIds, result);
  }
  for (let i = 0; i < thinNumbers.length; i++) {
    spreadChips(thinNumbers[i], thinAmounts[i], excludedIds, usedPositionIds, result);
  }

  return result;
}

// ── CASH chip generation ──────────────────────────────────────────────────────
//
// Rules:
//  - One physical chip = one unique field position (never stacked).
//  - Only user-selected denominations are used.
//  - Single denom: chipCount = round(cashOnField / denom), capped by available positions.
//  - Multi-denom: balanced chip counts (floor/ceil per denom), minimise |sum - target|.
//  - At least one chip covers the drawn number.
//  - Cash never shares a position with a color chip.

/**
 * Among all size-`count` subsets of `arr`, return every subset whose sum is
 * closest to `target`. Returns [[]] when count === 0.
 */
function findBestSubsets(arr: number[], count: number, target: number): number[][] {
  if (count === 0) return [[]];
  if (count >= arr.length) return [[...arr]];

  const best: number[][] = [];
  let bestDev = Infinity;

  function enumerate(start: number, chosen: number[]) {
    if (chosen.length === count) {
      const sum = chosen.reduce((a, b) => a + b, 0);
      const dev = Math.abs(sum - target);
      if (dev < bestDev) { bestDev = dev; best.length = 0; best.push([...chosen]); }
      else if (dev === bestDev) { best.push([...chosen]); }
      return;
    }
    const need = count - chosen.length;
    for (let i = start; i <= arr.length - need; i++) {
      enumerate(i + 1, [...chosen, arr[i]]);
    }
  }

  enumerate(0, []);
  return best;
}

/**
 * Build the optimal set of physical cash chips from `denoms` (sorted ascending),
 * subject to a maximum of `maxChips` chips (= number of free field positions).
 *
 * Single denom  → chipCount = round(cashOnField / denom), capped at maxChips.
 * Multi-denom   → iterate total chip counts n..maxChips; for each count, use
 *                 floor/ceil distribution (max difference 1 between denoms) and
 *                 pick the subset that minimises |actualSum - cashOnField|.
 *                 Ties are broken randomly.
 */
function buildChipSet(cashOnField: number, denoms: number[], maxChips: number): number[] {
  if (maxChips <= 0 || denoms.length === 0) return [];
  const minDenom = denoms[0];
  if (cashOnField < minDenom) return [];

  const n = denoms.length;

  // ── Single denomination ────────────────────────────────────────────────────
  if (n === 1) {
    const d = denoms[0];
    const count = Math.max(1, Math.round(cashOnField / d));
    return Array(Math.min(count, maxChips)).fill(d);
  }

  // ── Multiple denominations ─────────────────────────────────────────────────
  // Need at least one chip per denomination (n chips minimum).
  if (maxChips < n) {
    // Not enough positions for all denoms — drop smallest until we fit.
    return buildChipSet(cashOnField, denoms.slice(denoms.length - maxChips), maxChips);
  }

  const denomSum = denoms.reduce((a, b) => a + b, 0);
  const bestSets: number[][] = [];
  let bestDev = Infinity;

  for (let total = n; total <= maxChips; total++) {
    const base = Math.floor(total / n);
    const extraCount = total % n;          // how many denoms get base+1 chips
    const baseSum = base * denomSum;
    const targetExtra = cashOnField - baseSum;

    for (const subset of findBestSubsets(denoms, extraCount, targetExtra)) {
      const extraSum = subset.reduce((a, b) => a + b, 0);
      const dev = Math.abs(baseSum + extraSum - cashOnField);

      const chips: number[] = [];
      const extraMap = new Map<number, number>();
      for (const d of subset) extraMap.set(d, (extraMap.get(d) ?? 0) + 1);
      for (const d of denoms) {
        const cnt = base + (extraMap.get(d) ?? 0);
        for (let i = 0; i < cnt; i++) chips.push(d);
      }

      if (dev < bestDev) { bestDev = dev; bestSets.length = 0; bestSets.push(chips); }
      else if (dev === bestDev) { bestSets.push(chips); }
    }
  }

  if (bestSets.length === 0) return [];
  // Random tie-break among equally good combinations
  return bestSets[Math.floor(Math.random() * bestSets.length)];
}

export function generateCashChips(
  drawnNumber: number,
  cashOnField: number,
  cashChipValues: string[],
  colorPositionIds: Set<string>,
): CashChipStack[] {
  if (cashOnField <= 0) return [];

  // Deduplicate, filter invalid, sort ascending
  const denoms = [...new Set(
    (cashChipValues.length > 0 ? cashChipValues : ["100"]).map(Number).filter(n => n > 0 && Number.isFinite(n)),
  )].sort((a, b) => a - b);

  if (denoms.length === 0) return [];
  if (cashOnField < denoms[0]) return [];

  // ── Available positions: not occupied by color chips ───────────────────────
  const available = ALL_BET_POSITIONS.filter(p => !colorPositionIds.has(p.id));
  if (available.length === 0) return [];

  // Build physical chips — one chip per position, capped by available count
  const physicalChips = buildChipSet(cashOnField, denoms, available.length);
  if (physicalChips.length === 0) return [];

  // ── Select positions: guarantee at least one covers the drawn number ───────
  const winningPool = shuffle(available.filter(p =>  p.numbers.includes(drawnNumber)));
  const otherPool   = shuffle(available.filter(p => !p.numbers.includes(drawnNumber)));

  const ordered: BetPosition[] = [];
  if (winningPool.length > 0) ordered.push(winningPool[0]);  // guaranteed winning slot
  const rest = shuffle([...winningPool.slice(1), ...otherPool]);
  for (const pos of rest) {
    if (ordered.length >= physicalChips.length) break;
    ordered.push(pos);
  }
  if (ordered.length === 0) return [];

  // Shuffle chips so denomination types are distributed randomly across positions
  const shuffled = shuffle([...physicalChips]);
  const count = Math.min(ordered.length, shuffled.length);

  return Array.from({ length: count }, (_, i) => ({
    positionId: ordered[i].id,
    denomination: shuffled[i],
  }));
}

// ── Core game functions ───────────────────────────────────────────────────────

export function spinGame(
  chipCount: number,
  chipValue: number,
  payoutMap?: Record<string, number>,
  excludedPositionIds?: Set<string>,
  preDrawnNumber?: number,
  preChips?: ChipStack[],
): GameState {
  const drawnNumber = preDrawnNumber !== undefined
    ? preDrawnNumber
    : Math.floor(Math.random() * 37);

  let chips: ChipStack[];
  if (preChips !== undefined) {
    chips = preChips;
  } else {
    const available = excludedPositionIds
      ? ALL_BET_POSITIONS.filter(p => !excludedPositionIds.has(p.id))
      : ALL_BET_POSITIONS;
    const total = available.length;
    const stackMap = new Map<string, number>();
    for (let i = 0; i < chipCount; i++) {
      const pos = available[Math.floor(Math.random() * total)];
      stackMap.set(pos.id, (stackMap.get(pos.id) ?? 0) + 1);
    }
    chips = Array.from(stackMap.entries()).map(([positionId, count]) => ({ positionId, count }));
  }

  const { total: correctAnswer, breakdown } = calculatePayout(drawnNumber, chips, chipValue, payoutMap);

  return {
    drawnNumber,
    chips,
    correctAnswer,
    breakdown,
    userAnswer: "",
    checkResult: null,
    trackBets: [],
    numberCompleteBets: [],
    cashChipStacks: [],
    neighboursBets: [],
  };
}

export function calculatePayout(
  drawnNumber: number,
  chips: ChipStack[],
  chipValue: number,
  payoutMap?: Record<string, number>
): { total: number; breakdown: PayoutLine[] } {
  let total = 0;
  const breakdown: PayoutLine[] = [];

  for (const stack of chips) {
    const pos = BET_POSITIONS_MAP.get(stack.positionId);
    if (!pos) continue;
    if (!pos.numbers.includes(drawnNumber)) continue;

    const payout = payoutMap?.[pos.type] ?? pos.payout;
    const subtotal = stack.count * chipValue * payout;
    total += subtotal;

    const nums = pos.numbers.join(", ");
    const typeLabel = TYPE_LABELS[pos.type] ?? pos.type;
    breakdown.push({
      label: `${typeLabel} [${nums}]`,
      chips: stack.count,
      payout: payoutMap?.[pos.type] ?? pos.payout,
      chipValue,
      subtotal,
    });
  }

  breakdown.sort((a, b) => b.subtotal - a.subtotal);

  return { total, breakdown };
}

export { PAYOUT };
