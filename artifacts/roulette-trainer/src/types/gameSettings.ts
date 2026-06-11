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
}

export const DEFAULT_SETTINGS: GameSettings = {
  minBet: 10,
  maxBet: 1000,
  neighborsCount: 50,
  bet58: "no",
  betOrphelins: "no",
  betSeria023: "no",
  betZeroSpiel: "no",
  chipValue: 10,
  chipsInField: 100,
  cashOnField: 1000,
  multiplicity: 10,
};
