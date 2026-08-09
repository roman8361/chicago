import type { GameSettings } from "@/types/gameSettings";

export type GameType = "ROULETTE";
export type TrainingStatus = "CREATED";

export type RouletteTrainingConfig = GameSettings;

export type Training = {
  id: string;
  dealerId: string;
  gameType: GameType;
  status: TrainingStatus;
  config: RouletteTrainingConfig;
  createdAt: string;
};