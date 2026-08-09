import type { GameType } from "@/data/gameRegistry";
import type { GameSettings } from "@/types/gameSettings";
import type { GameState } from "@/lib/rouletteGame";

export type TrainingAssignmentStatus = "CREATED" | "IN_PROGRESS" | "COMPLETED";
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
  startedAt?: string;
};

/**
 * Immutable result of the Roulette generator for one assignment.
 *
 * The data is the business-level GameState, not rendered DOM or React state.
 * Keeping the complete generated state makes it possible to restore the same
 * exercise later without running Spin again.
 */
export type RouletteExercise = {
  id: string;
  assignmentId: string;
  createdAt: string;
  data: GameState;
};