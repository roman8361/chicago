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
// Each center number gets its chips spread across ALL valid field positions
// containing that number, prioritising breadth (1 chip per position first,
// then round-robin for leftovers). Fat numbers get ~70% of total chips, thin
// numbers get ~30%. The drawn number is always the first fat center number
// (guarantees a winning position exists).

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
 * Spread `chipsCount` chips across as many unique positions for `centerNum`
 * as possible (breadth-first). Positions already used by previous center
 * numbers are skipped. Results are appended to `result`.
 */
function spreadChips(
  centerNum: number,
  chipsCount: number,
  excludedIds: Set<string>,
  usedPositionIds: Set<string>,
  result: ChipStack[],
): void {
  if (chipsCount <= 0) return;

  const candidates = (POSITIONS_BY_NUMBER.get(centerNum) ?? []).filter(
    p => !excludedIds.has(p.id) && !usedPositionIds.has(p.id),
  );
  if (candidates.length === 0) return;

  const positions = shuffle([...candidates]);

  // First pass: 1 chip per position until chips or positions run out
  const counts = new Map<string, number>();
  let remaining = chipsCount;
  for (const pos of positions) {
    if (remaining <= 0) break;
    counts.set(pos.id, 1);
    remaining--;
  }

  // Second pass: round-robin on already-used positions
  if (remaining > 0) {
    const usedList = [...counts.keys()];
    for (let i = 0; remaining > 0; i++, remaining--) {
      const id = usedList[i % usedList.length];
      counts.set(id, counts.get(id)! + 1);
    }
  }

  for (const [id, n] of counts) {
    usedPositionIds.add(id);
    result.push({ positionId: id, count: n });
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

  // Distribute ~70% to fat numbers, ~30% to thin numbers
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
// Each cash center number gets exactly ONE position (selected randomly from
// all valid positions containing that number). Positions used by color chips
// are excluded.

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

/** Select positions (one per center number), guaranteeing drawnNumber is covered first. */
function selectPositions(
  drawnNumber: number,
  requestedCount: number,
  excludedIds: Set<string>,
): BetPosition[] {
  if (requestedCount === 0) return [];

  const usedKeys = new Set<string>();
  const selected: BetPosition[] = [];

  const winPos = pickPos(drawnNumber, usedKeys, excludedIds);
  if (winPos) {
    selected.push(winPos);
    usedKeys.add(posKey(winPos));
  }

  if (requestedCount > 1) {
    const pool = shuffle(
      Array.from({ length: 37 }, (_, i) => i).filter(i => i !== drawnNumber),
    );
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

export function generateCashChips(
  drawnNumber: number,
  cashNumbersCount: number,
  cashOnField: number,
  cashChipValues: string[],
  colorPositionIds: Set<string>,
): CashChipStack[] {
  if (cashNumbersCount === 0 || cashOnField <= 0) return [];

  // Build the full chip set from denominations
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

  // Select positions (one per center number), excluding color positions
  const requested = Math.min(cashNumbersCount, chipsToPlace.length);
  const positions = selectPositions(drawnNumber, requested, colorPositionIds);
  const finalCount = positions.length;
  if (finalCount === 0) return [];

  // Single position: everything goes there
  if (finalCount === 1) {
    const totalAmount = chipsToPlace.reduce((a, b) => a + b, 0);
    return [{ positionId: positions[0].id, totalAmount }];
  }

  // Fat / thin split
  const fatCount = Math.ceil(finalCount / 2);
  const thinCount = finalCount - fatCount;

  const rest = shuffle(positions.slice(1));
  const fatPos  = [positions[0], ...rest.slice(0, fatCount - 1)];
  const thinPos = rest.slice(fatCount - 1);

  // Shuffle chips, split ~70% by count to fat, ~30% to thin
  const shuffledChips = shuffle([...chipsToPlace]);
  const fatChipCount  = thinCount === 0 ? shuffledChips.length : Math.ceil(shuffledChips.length * 0.7);
  const fatChips  = shuffledChips.slice(0, fatChipCount);
  const thinChips = shuffledChips.slice(fatChipCount);

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
