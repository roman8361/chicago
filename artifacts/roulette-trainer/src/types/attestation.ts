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
  completedAt?: string;
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

export type TrainingAnswer = {
  questionId: string;
  question: string;
  answer: string | number;
  correctAnswer: string | number;
  correct: boolean;
};

/**
 * Serializable business data used to render the completed Roulette report.
 * This intentionally contains report data, not JSX/DOM or React state.
 */
export type RouletteReportSnapshot = {
  completesRecord?: unknown;
  intersectionRecord?: unknown;
  seriesRecord?: unknown;
  trackIntersectionRecord?: unknown;
  trackFieldIntersectionRecord?: unknown;
  completeTrackIntersectionRecord?: unknown;
  completeNumberPayoutRecord?: unknown;
  seriesFieldPayoutRecord?: unknown;
  neighboursPayoutRecord?: unknown;
  fieldRecord?: unknown;
  colorPayoutRecord?: unknown;
};

export type TrainingProgress = {
  assignmentId: string;
  currentQuestionIndex: number;
  answers: TrainingAnswer[];
  updatedAt: string;
};

export type TrainingResult = {
  id: string;
  assignmentId: string;
  answers: TrainingAnswer[];
  totalQuestions: number;
  correctAnswers: number;
  createdAt: string;
  completedAt: string;
  reportSnapshot?: RouletteReportSnapshot;
};