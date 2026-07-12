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
  totalAmount: number;
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
// Cash chips are spread naturally across random field positions, excluding any
// position already occupied by a color chip. The drawn number is always covered
// by at least one cash bet (best-effort). Total amount equals cashOnField exactly.

export function generateCashChips(
  drawnNumber: number,
  cashOnField: number,
  cashChipValues: string[],
  colorPositionIds: Set<string>,
): CashChipStack[] {
  if (cashOnField <= 0) return [];

  const denomValues = (cashChipValues.length > 0 ? cashChipValues : ["100"])
    .map(Number)
    .filter(n => n > 0)
    .sort((a, b) => a - b); // ascending so minDenom is first
  const minDenom = denomValues[0];

  if (cashOnField < minDenom) return [];

  // All available positions on the field (excluding color positions)
  const allAvailable = ALL_BET_POSITIONS.filter(p => !colorPositionIds.has(p.id));
  if (allAvailable.length === 0) return [];

  // Separate winning positions (contain drawnNumber) from the rest
  const winningPool  = shuffle(allAvailable.filter(p => p.numbers.includes(drawnNumber)));
  const otherPool    = shuffle(allAvailable.filter(p => !p.numbers.includes(drawnNumber)));

  // Pick a random number of cash positions: 1–6 (natural spread)
  const maxPositions = Math.min(6, allAvailable.length, Math.floor(cashOnField / minDenom));
  const targetCount  = Math.max(1, 1 + Math.floor(Math.random() * maxPositions));

  const selectedPositions: BetPosition[] = [];

  // Guarantee at least one winning position (best-effort)
  if (winningPool.length > 0) {
    selectedPositions.push(winningPool[0]);
  }

  // Fill remaining from a shuffled mix of winning + other positions
  const remaining = shuffle([...winningPool.slice(1), ...otherPool]);
  for (const pos of remaining) {
    if (selectedPositions.length >= targetCount) break;
    selectedPositions.push(pos);
  }

  const n = selectedPositions.length;
  if (n === 0) return [];

  // Distribute cashOnField across n positions with random weights
  // Each position gets at least minDenom
  if (cashOnField < minDenom * n) {
    // Not enough to give each position one chip — put everything on winning pos
    return [{ positionId: selectedPositions[0].id, totalAmount: cashOnField }];
  }

  // Random weights (skewed so distribution is uneven and natural)
  const weights = Array.from({ length: n }, () => Math.random() * Math.random() + 0.05);
  const weightSum = weights.reduce((a, b) => a + b, 0);

  // Floor-allocate, rounded to minDenom, each at least minDenom
  const amounts = weights.map(w =>
    Math.max(minDenom, Math.floor((w / weightSum * cashOnField) / minDenom) * minDenom),
  );

  // Adjust total to match cashOnField exactly (add/remove minDenom steps)
  let total = amounts.reduce((a, b) => a + b, 0);
  const idxOrder = shuffle(Array.from({ length: n }, (_, i) => i));

  while (total < cashOnField) {
    amounts[idxOrder[0]]  += minDenom;
    total += minDenom;
  }
  while (total > cashOnField) {
    // Subtract from largest positions that still have > minDenom
    for (const i of idxOrder) {
      if (total <= cashOnField) break;
      if (amounts[i] > minDenom) {
        amounts[i] -= minDenom;
        total -= minDenom;
      }
    }
    // Safety: if we're stuck (all at minDenom but total still > cashOnField),
    // dump the difference onto the first position and break
    if (total > cashOnField && amounts.every(a => a <= minDenom)) {
      amounts[0] += cashOnField - total;
      break;
    }
  }

  return selectedPositions
    .map((pos, i) => ({ positionId: pos.id, totalAmount: amounts[i] }))
    .filter(s => s.totalAmount > 0);
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
