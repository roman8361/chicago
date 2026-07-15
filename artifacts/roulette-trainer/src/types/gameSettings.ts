export interface GameSettings {
  minBet: number;
  maxBet: number;
  neighborsCount: number;
  bet58: "yes" | "no";
  betOrphelins: "yes" | "no";
  betSeria023: "yes" | "no";
  betZeroSpiel: "yes" | "no";
  chipValue: number;
  chipsInField: number;
  cashOnField: number;
  multiplicity: number;
  completeDozen: "yes" | "no";
  completeField: "yes" | "no";
  completeCount: number;
  completeMultiplicity: number;
  neighboursMultiplicity: number;
  colorNumbersCount: number;
  cashChipValues: Array<"5" | "10" | "25" | "50" | "100" | "500" | "1000" | "5000" | "10000" | "50000">;
  showBetBeforeChange: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  minBet: 1,
  maxBet: 100,
  neighborsCount: 5,
  bet58: "no",
  betOrphelins: "no",
  betSeria023: "no",
  betZeroSpiel: "no",
  chipValue: 10,
  chipsInField: 60,
  cashOnField: 1000,
  multiplicity: 10,
  completeDozen: "no",
  completeField: "yes",
  completeCount: 1,
  completeMultiplicity: 100,
  neighboursMultiplicity: 10,
  colorNumbersCount: 3,
  cashChipValues: ["100"],
  showBetBeforeChange: false,
};
