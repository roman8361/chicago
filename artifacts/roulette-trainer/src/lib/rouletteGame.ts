import { ALL_BET_POSITIONS, BET_POSITIONS_MAP } from "@/data/betPositions";

export interface ChipStack {
  positionId: string;
  count: number;
}

export interface GameState {
  drawnNumber: number;
  chips: ChipStack[];
  correctAnswer: number;
  userAnswer: string;
  checkResult: "correct" | "incorrect" | null;
}

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export function getNumberColor(n: number): "green" | "red" | "black" {
  if (n === 0) return "green";
  return RED_NUMBERS.has(n) ? "red" : "black";
}

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

  const correctAnswer = calculatePayout(drawnNumber, chips, chipValue);

  return {
    drawnNumber,
    chips,
    correctAnswer,
    userAnswer: "",
    checkResult: null,
  };
}

export function calculatePayout(
  drawnNumber: number,
  chips: ChipStack[],
  chipValue: number
): number {
  let total = 0;
  for (const stack of chips) {
    const pos = BET_POSITIONS_MAP.get(stack.positionId);
    if (!pos) continue;
    if (pos.numbers.includes(drawnNumber)) {
      total += stack.count * chipValue * pos.payout;
    }
  }
  return total;
}
