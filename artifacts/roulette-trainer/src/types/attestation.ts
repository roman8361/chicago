import type { GameType } from "@/data/gameRegistry";
import type { GameSettings } from "@/types/gameSettings";

export type TrainingAssignmentStatus = "CREATED";
export type RouletteTrainingConfig = GameSettings;

export type TrainingTemplate = {
  id: string;
  gameType: GameType;
  config: RouletteTrainingConfig;
  createdAt: string;
  updatedAt: string;
};

export type TrainingAssignment = {
  id: string;
  trainingTemplateId: string;
  dealerId: string;
  status: TrainingAssignmentStatus;
  createdAt: string;
};