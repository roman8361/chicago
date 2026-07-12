import { ALL_BET_POSITIONS, BET_POSITIONS_MAP, PAYOUT, type BetPosition } from "@/data/betPositions";

export interface ChipStack {
  positionId: string;
  count: number;
}

export interface PayoutLine {
  label: string;   // e.g. "Страйт №5"
  chips: number;
  payout: number;  // multiplier
  chipValue: number;
  subtotal: number; // chips * payout * chipValue
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

function pickPos(
  num: number,
  usedKeys: Set<string>,
  excludedIds: Set<string>,
): BetPosition | null {
  const candidates = (POSITIONS_BY_NUMBER.get(num) ?? []).filter(
    p => !excludedIds.has(p.id) && !usedKeys.has(posKey(p)),
  );
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// Distribute `total` into `count` non-negative integers summing to `total`, diff ≤ 1.
export function distributeInteger(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const rem = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}

// Select up to `requestedCount` unique field positions, guaranteeing the first
// one contains `drawnNumber`. Returns positions with the winning one at index 0.
function selectPositions(
  drawnNumber: number,
  requestedCount: number,
  excludedIds: Set<string>,
): BetPosition[] {
  if (requestedCount === 0) return [];

  const usedKeys = new Set<string>();
  const selected: BetPosition[] = [];

  // Step 1: mandatory winning position (contains drawnNumber)
  const winPos = pickPos(drawnNumber, usedKeys, excludedIds);
  if (winPos) {
    selected.push(winPos);
    usedKeys.add(posKey(winPos));
  }

  // Step 2: fill remaining from other numbers (shuffled)
  if (requestedCount > 1) {
    const pool: number[] = [];
    for (let i = 0; i <= 36; i++) { if (i !== drawnNumber) pool.push(i); }
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (const num of pool) {
      if (selected.length >= requestedCount) break;
      const pos = pickPos(num, usedKeys, excludedIds);
      if (pos) {
        selected.push(pos);
        usedKeys.add(posKey(pos));
      }
    }
  }

  return selected;
}

// ── Color chip generation ─────────────────────────────────────────────────────
export function generateColorChips(
  drawnNumber: number,
  colorNumbersCount: number,
  totalChips: number,
  excludedIds: Set<string>,
): ChipStack[] {
  if (colorNumbersCount === 0 || totalChips === 0) return [];

  // Each position needs ≥ 1 chip
  const requested = Math.min(colorNumbersCount, totalChips);
  const positions = selectPositions(drawnNumber, requested, excludedIds);
  const finalCount = positions.length;
  if (finalCount === 0) return [];

  // Special case: single position gets all chips
  if (finalCount === 1) {
    return [{ positionId: positions[0].id, count: totalChips }];
  }

  // Fat / thin split (winning position always goes to fat)
  const fatCount = Math.ceil(finalCount / 2);
  const thinCount = finalCount - fatCount;

  const rest = positions.slice(1);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const fatPos  = [positions[0], ...rest.slice(0, fatCount - 1)];
  const thinPos = rest.slice(fatCount - 1);

  // Distribute ~70% to fat, ~30% to thin
  const fatTotal  = thinCount === 0 ? totalChips : Math.round(totalChips * 0.7);
  const thinTotal = totalChips - fatTotal;

  const fatAmounts  = distributeInteger(fatTotal,  fatPos.length);
  const thinAmounts = distributeInteger(thinTotal, thinPos.length);

  const result: ChipStack[] = [];
  for (let i = 0; i < fatPos.length;  i++) {
    if (fatAmounts[i]  > 0) result.push({ positionId: fatPos[i].id,  count: fatAmounts[i] });
  }
  for (let i = 0; i < thinPos.length; i++) {
    if (thinAmounts[i] > 0) result.push({ positionId: thinPos[i].id, count: thinAmounts[i] });
  }
  return result;
}

// ── Cash chip generation ──────────────────────────────────────────────────────
export function generateCashChips(
  drawnNumber: number,
  cashNumbersCount: number,
  cashOnField: number,
  cashChipValues: string[],
  colorPositionIds: Set<string>,
): CashChipStack[] {
  if (cashNumbersCount === 0 || cashOnField <= 0) return [];

  // Build the full chip set from denominations (same logic as before)
  const denomValues = (cashChipValues.length > 0 ? cashChipValues : ["100"])
    .map(Number)
    .filter(n => n > 0)
    .sort((a, b) => b - a);

  const chipsToPlace: number[] = [];
  if (denomValues.length === 1) {
    const d = denomValues[0];
    const count = Math.floor(cashOnField / d);
    for (let i = 0; i < count; i++) chipsToPlace.push(d);
  } else {
    const sumDenoms = denomValues.reduce((a, b) => a + b, 0);
    const k = Math.floor(cashOnField / sumDenoms);
    let remaining = cashOnField - k * sumDenoms;
    for (const d of denomValues) {
      for (let i = 0; i < k; i++) chipsToPlace.push(d);
    }
    for (const d of denomValues) {
      if (remaining >= d) { chipsToPlace.push(d); remaining -= d; }
    }
  }

  if (chipsToPlace.length === 0) return [];

  // Select positions, avoiding color positions
  const requested = Math.min(cashNumbersCount, chipsToPlace.length);
  const positions = selectPositions(drawnNumber, requested, colorPositionIds);
  const finalCount = positions.length;
  if (finalCount === 0) return [];

  // Special case: single position gets everything
  if (finalCount === 1) {
    const totalAmount = chipsToPlace.reduce((a, b) => a + b, 0);
    return [{ positionId: positions[0].id, totalAmount }];
  }

  // Fat / thin split (winning position always goes to fat)
  const fatCount = Math.ceil(finalCount / 2);
  const thinCount = finalCount - fatCount;

  const rest = positions.slice(1);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const fatPos  = [positions[0], ...rest.slice(0, fatCount - 1)];
  const thinPos = rest.slice(fatCount - 1);

  // Shuffle chips, then split ~70% by count to fat, ~30% to thin
  const shuffled = [...chipsToPlace];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const fatChipCount  = thinCount === 0 ? shuffled.length : Math.ceil(shuffled.length * 0.7);
  const fatChips      = shuffled.slice(0, fatChipCount);
  const thinChips     = shuffled.slice(fatChipCount);

  // Round-robin assignment within each group
  const fatAmounts  = new Array<number>(fatPos.length).fill(0);
  const thinAmounts = new Array<number>(thinPos.length).fill(0);
  for (let i = 0; i < fatChips.length;  i++) fatAmounts[i  % fatPos.length]  += fatChips[i];
  for (let i = 0; i < thinChips.length; i++) thinAmounts[i % thinPos.length] += thinChips[i];

  const result: CashChipStack[] = [];
  for (let i = 0; i < fatPos.length;  i++) {
    if (fatAmounts[i]  > 0) result.push({ positionId: fatPos[i].id,  totalAmount: fatAmounts[i] });
  }
  for (let i = 0; i < thinPos.length; i++) {
    if (thinAmounts[i] > 0) result.push({ positionId: thinPos[i].id, totalAmount: thinAmounts[i] });
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
    : Math.floor(Math.random() * 37); // 0–36

  let chips: ChipStack[];
  if (preChips !== undefined) {
    chips = preChips;
  } else {
    // Legacy path: distribute chips randomly across all positions
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

  // Sort by subtotal descending for readability
  breakdown.sort((a, b) => b.subtotal - a.subtotal);

  return { total, breakdown };
}

// Re-export payout table for reference
export { PAYOUT };
