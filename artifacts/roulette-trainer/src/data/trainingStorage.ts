import type { Training } from "@/types/training";

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
    !!candidate.config &&
    typeof candidate.config === "object"
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
  config: Training["config"],
): Training {
  const training: Training = {
    id: createTrainingId(),
    dealerId,
    gameType: "ROULETTE",
    status: "CREATED",
    config,
    createdAt: new Date().toISOString(),
  };

  saveTrainings([...getTrainings(), training]);
  return training;
}

export function getTrainingsByDealerId(dealerId: string): Training[] {
  return getTrainings().filter((training) => training.dealerId === dealerId);
}