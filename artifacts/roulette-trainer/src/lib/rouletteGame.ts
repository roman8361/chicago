import { ALL_BET_POSITIONS, BET_POSITIONS_MAP, PAYOUT } from "@/data/betPositions";

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

export interface GameState {
  drawnNumber: number;
  chips: ChipStack[];
  correctAnswer: number;
  breakdown: PayoutLine[];
  userAnswer: string;
  checkResult: "correct" | "incorrect" | null;
  trackBets: TrackBet[];
  dozenCompleteBet?: DozenCompleteBet;
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

export function spinGame(chipCount: number, chipValue: number): GameState {
  const drawnNumber = Math.floor(Math.random() * 37); // 0–36

  // Distribute chips randomly across all positions
  const stackMap = new Map<string, number>();
  const total = ALL_BET_POSITIONS.length;
  for (let i = 0; i < chipCount; i++) {
    const pos = ALL_BET_POSITIONS[Math.floor(Math.random() * total)];
    stackMap.set(pos.id, (stackMap.get(pos.id) ?? 0) + 1);
  }

  const chips: ChipStack[] = Array.from(stackMap.entries()).map(
    ([positionId, count]) => ({ positionId, count })
  );

  const { total: correctAnswer, breakdown } = calculatePayout(drawnNumber, chips, chipValue);

  return {
    drawnNumber,
    chips,
    correctAnswer,
    breakdown,
    userAnswer: "",
    checkResult: null,
    trackBets: [],
  };
}

export function calculatePayout(
  drawnNumber: number,
  chips: ChipStack[],
  chipValue: number
): { total: number; breakdown: PayoutLine[] } {
  let total = 0;
  const breakdown: PayoutLine[] = [];

  for (const stack of chips) {
    const pos = BET_POSITIONS_MAP.get(stack.positionId);
    if (!pos) continue;
    if (!pos.numbers.includes(drawnNumber)) continue;

    const subtotal = stack.count * chipValue * pos.payout;
    total += subtotal;

    const nums = pos.numbers.join(", ");
    const typeLabel = TYPE_LABELS[pos.type] ?? pos.type;
    breakdown.push({
      label: `${typeLabel} [${nums}]`,
      chips: stack.count,
      payout: pos.payout,
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
