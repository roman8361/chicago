export type SeriesDisplayState = "HIDDEN" | "CLOSED" | "CLOSING" | "FLIPPING" | "OPEN";

export function getNextSeriesRoundIndex({
  currentRoundIndex,
  totalRounds,
  roundState,
  transitionLocked,
}: {
  currentRoundIndex: number;
  totalRounds: number;
  roundState: SeriesDisplayState;
  transitionLocked: boolean;
}): number | null {
  if (transitionLocked || roundState !== "OPEN" || totalRounds < 1) return null;
  if (currentRoundIndex < 0 || currentRoundIndex >= totalRounds - 1) return null;
  return currentRoundIndex + 1;
}

export function isSeriesComplete(
  currentRoundIndex: number,
  totalRounds: number,
  roundState: SeriesDisplayState,
): boolean {
  return roundState === "OPEN"
    && totalRounds > 0
    && currentRoundIndex === totalRounds - 1;
}
