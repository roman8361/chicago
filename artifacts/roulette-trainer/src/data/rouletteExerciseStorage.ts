import type { RouletteExercise } from "@/types/attestation";
import type { GameState } from "@/lib/rouletteGame";

export const ROULETTE_EXERCISES_STORAGE_KEY = "roulette-trainer-roulette-exercises";

function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GameState>;
  return (
    typeof candidate.drawnNumber === "number" &&
    Array.isArray(candidate.chips) &&
    typeof candidate.correctAnswer === "number" &&
    Array.isArray(candidate.breakdown) &&
    typeof candidate.userAnswer === "string" &&
    (candidate.checkResult === null ||
      candidate.checkResult === "correct" ||
      candidate.checkResult === "incorrect") &&
    Array.isArray(candidate.trackBets) &&
    Array.isArray(candidate.numberCompleteBets) &&
    Array.isArray(candidate.cashChipStacks) &&
    Array.isArray(candidate.neighboursBets)
  );
}

function isRouletteExercise(value: unknown): value is RouletteExercise {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RouletteExercise>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.assignmentId === "string" &&
    typeof candidate.createdAt === "string" &&
    isGameState(candidate.data)
  );
}

function readExercises(): RouletteExercise[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(ROULETTE_EXERCISES_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRouletteExercise) : [];
  } catch {
    return [];
  }
}

function saveExercises(exercises: RouletteExercise[]): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ROULETTE_EXERCISES_STORAGE_KEY, JSON.stringify(exercises));
  }
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `roulette-exercise-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneGameState(data: GameState): GameState {
  return JSON.parse(JSON.stringify(data)) as GameState;
}

export function getRouletteExercises(): RouletteExercise[] {
  return readExercises();
}

export function getRouletteExerciseById(id: string): RouletteExercise | undefined {
  return readExercises().find((exercise) => exercise.id === id);
}

export function getRouletteExerciseByAssignmentId(assignmentId: string): RouletteExercise | undefined {
  return readExercises().find((exercise) => exercise.assignmentId === assignmentId);
}

export function addRouletteExercise(assignmentId: string, data: GameState): RouletteExercise {
  const exercise: RouletteExercise = {
    id: createId(),
    assignmentId,
    createdAt: new Date().toISOString(),
    data: cloneGameState(data),
  };
  saveExercises([
    ...readExercises().filter((candidate) => candidate.assignmentId !== assignmentId),
    exercise,
  ]);
  return exercise;
}

export function deleteRouletteExerciseByAssignment(assignmentId: string): void {
  saveExercises(readExercises().filter((exercise) => exercise.assignmentId !== assignmentId));
}

export function deleteRouletteExercisesByAssignmentIds(assignmentIds: string[]): void {
  const ids = new Set(assignmentIds);
  saveExercises(readExercises().filter((exercise) => !ids.has(exercise.assignmentId)));
}