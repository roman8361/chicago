import type { Training } from "@/types/training";
import type { GameSettings } from "@/types/gameSettings";

export const TRAININGS_STORAGE_KEY = "roulette-trainer-trainings";

function isTraining(value: unknown): value is Training {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Training>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.dealerId === "string" &&
    candidate.gameType === "ROULETTE" &&
    candidate.status === "CREATED" &&
    typeof candidate.createdAt === "string" &&
    isGameSettings(candidate.config)
  );
}

function isGameSettings(value: unknown): value is GameSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as Partial<GameSettings>;
  return (
    typeof settings.minBet === "number" &&
    typeof settings.maxBet === "number" &&
    typeof settings.neighborsCount === "number" &&
    (settings.bet58 === "yes" || settings.bet58 === "no") &&
    (settings.betOrphelins === "yes" || settings.betOrphelins === "no") &&
    (settings.betSeria023 === "yes" || settings.betSeria023 === "no") &&
    (settings.betZeroSpiel === "yes" || settings.betZeroSpiel === "no") &&
    typeof settings.chipValue === "number" &&
    typeof settings.chipsInField === "number" &&
    typeof settings.cashOnField === "number" &&
    typeof settings.multiplicity === "number" &&
    (settings.completeDozen === "yes" || settings.completeDozen === "no") &&
    (settings.completeField === "yes" || settings.completeField === "no") &&
    typeof settings.completeCount === "number" &&
    typeof settings.completeMultiplicity === "number" &&
    typeof settings.neighboursMultiplicity === "number" &&
    typeof settings.colorNumbersCount === "number" &&
    Array.isArray(settings.cashChipValues) &&
    typeof settings.showBetBeforeChange === "boolean"
  );
}

export function getTrainings(): Training[] {
  if (typeof window === "undefined") return [];

  const raw = window.localStorage.getItem(TRAININGS_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isTraining) : [];
  } catch {
    return [];
  }
}

export function saveTrainings(trainings: Training[]): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(TRAININGS_STORAGE_KEY, JSON.stringify(trainings));
  }
}

function createTrainingId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `training-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function addTraining(
  dealerId: string,
  config: GameSettings,
): Training {
  const training: Training = {
    id: createTrainingId(),
    dealerId,
    gameType: "ROULETTE",
    status: "CREATED",
    config: {
      ...config,
      cashChipValues: [...config.cashChipValues],
    },
    createdAt: new Date().toISOString(),
  };

  saveTrainings([...getTrainings(), training]);
  return training;
}

export function getTrainingsByDealerId(dealerId: string): Training[] {
  return getTrainings().filter((training) => training.dealerId === dealerId);
}

export function getTrainingById(trainingId: string): Training | undefined {
  return getTrainings().find((training) => training.id === trainingId);
}

export function deleteTraining(trainingId: string): void {
  saveTrainings(getTrainings().filter((training) => training.id !== trainingId));
}