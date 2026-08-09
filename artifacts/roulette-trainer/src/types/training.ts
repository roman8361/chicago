export type GameType = "ROULETTE";
export type TrainingStatus = "CREATED";

export type RouletteTrainingConfig = {
  neighborsCount: number;
  completesCount: number;
  seriesCount: number;
  colorEnabled: boolean;
  colorCount: number;
  cashEnabled: boolean;
  cashAmount: number;
};

export type Training = {
  id: string;
  dealerId: string;
  gameType: GameType;
  status: TrainingStatus;
  config: RouletteTrainingConfig;
  createdAt: string;
};