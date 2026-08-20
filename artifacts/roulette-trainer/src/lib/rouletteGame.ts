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
export function generateCashChips(
  drawnNumber: number,
  cashOnField: number,
  cashChipValues: string[],
  minBet = 1,
  maxBet = 100,
  centerNumbersCount = 1,
): CashChipStack[] {
  if (cashOnField <= 0 || !Number.isFinite(cashOnField)) return [];

  const lower = Math.max(0, Math.min(minBet, maxBet));
  const upper = Math.max(lower, maxBet);
  const standardDenoms = [5, 10, 25, 50, 100, 500, 1000, 5000, 10000, 50000];
  const selected = [...new Set(cashChipValues.map(Number))]
    .filter(n => Number.isFinite(n) && n > 0 && n >= lower && n <= upper);
  const fallback = standardDenoms.filter(n => n >= lower && n <= upper).sort((a, b) => b - a);
  const denoms = (selected.length > 0
    ? selected
    : [fallback.includes(100) ? 100 : fallback[0]])
    .filter((n): n is number => typeof n === "number")
    .sort((a, b) => a - b)
    .slice(-2);
  if (denoms.length === 0 || cashOnField < denoms[0]) return [];

  const requestedCount = Math.min(37, Math.max(1, Math.floor(centerNumbersCount)));
  const otherNumbers = shuffle(
    Array.from({ length: 37 }, (_, i) => i).filter(n => n !== drawnNumber),
  );
  const remainingCount = requestedCount - 1;
  const fatCount = Math.ceil(remainingCount * 0.6);
  const fatNumbers = otherNumbers.slice(0, fatCount);
  const thinNumbers = otherNumbers.slice(fatCount, remainingCount);
  const centers = [drawnNumber, ...fatNumbers, ...thinNumbers];

  const positionMultiplier: Record<BetPosition["type"], number> = {
    straight: 1, split: 2, street: 3, corner: 4, sixline: 6,
  };
  const positionLimit = (p: BetPosition) =>
    Math.max(0, upper * positionMultiplier[p.type] - denoms[denoms.length - 1]);
  const result: CashChipStack[] = [];

  const winningCandidates = shuffle(
    (POSITIONS_BY_NUMBER.get(drawnNumber) ?? [])
      .filter(p => positionLimit(p) >= denoms[0]),
  );
  const combinedValue = denoms.length === 2 ? denoms[0] + denoms[1] : 0;
  const canCombine = (p: BetPosition) => positionLimit(p) >= combinedValue;
  const winningCombined = winningCandidates.filter(canCombine);
  const winningOrdered = shuffle([
    ...winningCombined,
    ...winningCandidates.filter(p => !canCombine(p)),
  ]);
  const winningCount = winningCandidates.length === 0
    ? 0
    : Math.min(winningOrdered.length, 1 + Math.floor(Math.random() * Math.min(3, winningOrdered.length)));
  const winningPositions = winningOrdered.slice(0, winningCount);

  const positionMap = new Map<string, BetPosition>();
  for (const p of winningPositions) positionMap.set(p.id, p);
  for (const center of centers.slice(1)) {
    for (const p of (POSITIONS_BY_NUMBER.get(center) ?? [])) {
      // A position containing the winning number may only be selected from
      // winningCandidates, so the winning-number occupancy stays at 1–3.
      if (!p.numbers.includes(drawnNumber) && positionLimit(p) >= denoms[0]) {
        positionMap.set(p.id, p);
      }
    }
  }
  const positions = shuffle([...positionMap.values()]);
  positions.sort((a, b) => {
    const aw = winningPositions.some(p => p.id === a.id) ? 0 : 1;
    const bw = winningPositions.some(p => p.id === b.id) ? 0 : 1;
    return aw - bw;
  });

  let remaining = cashOnField;
  const amountByPosition = new Map<string, number>();
  const addChip = (position: BetPosition, denomination: number) => {
    const current = amountByPosition.get(position.id) ?? 0;
    if (
      denomination > remaining
      || current + denomination > positionLimit(position)
    ) return false;
    result.push({ positionId: position.id, denomination });
    amountByPosition.set(position.id, current + denomination);
    remaining -= denomination;
    return true;
  };
  const addCombinedStack = (position: BetPosition) => {
    if (denoms.length !== 2 || !canCombine(position) || remaining < combinedValue) return false;
    // Add both denominations before any ordinary distribution. Extra chips
    // may be added later by the normal stack logic.
    const first = Math.random() < 0.5 ? denoms[0] : denoms[1];
    const second = first === denoms[0] ? denoms[1] : denoms[0];
    return addChip(position, first) && addChip(position, second);
  };

  // With two denominations, guarantee a mixed winning stack whenever the
  // target and the position limit make it physically possible.
  const winningCombinedPositions = shuffle(winningPositions.filter(canCombine));
  if (winningCombinedPositions.length > 0) {
    addCombinedStack(winningCombinedPositions[0]);
    for (const position of winningCombinedPositions.slice(1)) {
      if (Math.random() < 0.4) addCombinedStack(position);
    }
  }

  const nonWinningPositions = positions.filter(
    position => !winningPositions.some(winning => winning.id === position.id),
  );
  const nonWinningCombined = shuffle(nonWinningPositions.filter(canCombine));
  // A non-winning mixed stack is required only when at least one eligible
  // non-winning position exists and the remaining target can fund both chips.
  if (nonWinningCombined.length > 0 && remaining >= combinedValue) {
    addCombinedStack(nonWinningCombined[0]);
    for (const position of nonWinningCombined.slice(1)) {
      if (Math.random() < 0.4) addCombinedStack(position);
    }
  }

  for (const position of positions) {
    if (remaining < denoms[0]) break;
    const limit = positionLimit(position);
    let current = amountByPosition.get(position.id) ?? 0;
    while (remaining >= denoms[0]) {
      const fitting = denoms.filter(d => d <= remaining && current + d <= limit);
      if (fitting.length === 0) break;
      // Usually prefer larger values, but occasionally choose a smaller value
      // so mixed stacks such as 100 + 25 can naturally occur.
      const denomination = Math.random() < 0.35
        ? fitting[Math.floor(Math.random() * fitting.length)]
        : fitting[fitting.length - 1];
      if (!addChip(position, denomination)) break;
      current = amountByPosition.get(position.id) ?? current + denomination;
      if (Math.random() < 0.28) break;
    }
  }

  // Use only the already selected positions for any remaining representable sum.
  for (const position of positions) {
    if (remaining < denoms[0]) break;
    const current = amountByPosition.get(position.id) ?? 0;
    const fitting = denoms.filter(d => d <= remaining && current + d <= positionLimit(position));
    if (fitting.length === 0) continue;
    const denomination = fitting[fitting.length - 1];
    addChip(position, denomination);
  }
  return result;
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
