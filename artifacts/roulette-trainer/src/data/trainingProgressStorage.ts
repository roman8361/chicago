import type { TrainingAnswer, TrainingProgress } from "@/types/attestation";

export const TRAINING_PROGRESS_STORAGE_KEY = "roulette-trainer-training-progress";

function isTrainingAnswer(value: unknown): value is TrainingAnswer {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TrainingAnswer>;
  return (
    typeof candidate.questionId === "string" &&
    typeof candidate.question === "string" &&
    (typeof candidate.answer === "string" || typeof candidate.answer === "number") &&
    (typeof candidate.correctAnswer === "string" || typeof candidate.correctAnswer === "number") &&
    typeof candidate.correct === "boolean"
  );
}

function isTrainingProgress(value: unknown): value is TrainingProgress {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TrainingProgress>;
  return (
    typeof candidate.assignmentId === "string" &&
    typeof candidate.currentQuestionIndex === "number" &&
    Number.isInteger(candidate.currentQuestionIndex) &&
    candidate.currentQuestionIndex >= 0 &&
    Array.isArray(candidate.answers) &&
    candidate.answers.every(isTrainingAnswer) &&
    typeof candidate.updatedAt === "string"
  );
}

function readProgress(): TrainingProgress[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(TRAINING_PROGRESS_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isTrainingProgress) : [];
  } catch {
    return [];
  }
}

function saveProgress(progress: TrainingProgress[]): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(TRAINING_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  }
}

function normalizeAnswers(answers: TrainingAnswer[]): TrainingAnswer[] {
  const byQuestionId = new Map<string, TrainingAnswer>();
  answers.forEach((answer) => byQuestionId.set(answer.questionId, { ...answer }));
  return [...byQuestionId.values()];
}

export function getTrainingProgress(): TrainingProgress[] {
  return readProgress().map((progress) => ({
    ...progress,
    answers: normalizeAnswers(progress.answers),
  }));
}

export function getTrainingProgressByAssignmentId(
  assignmentId: string,
): TrainingProgress | undefined {
  return getTrainingProgress().find((progress) => progress.assignmentId === assignmentId);
}

export function upsertTrainingProgress(
  input: Omit<TrainingProgress, "updatedAt"> & { updatedAt?: string },
): TrainingProgress {
  const progress: TrainingProgress = {
    assignmentId: input.assignmentId,
    currentQuestionIndex: Math.max(0, Math.floor(input.currentQuestionIndex)),
    answers: normalizeAnswers(input.answers),
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
  saveProgress([
    ...readProgress().filter((candidate) => candidate.assignmentId !== progress.assignmentId),
    progress,
  ]);
  return progress;
}

export function deleteTrainingProgressByAssignmentId(assignmentId: string): void {
  saveProgress(readProgress().filter((progress) => progress.assignmentId !== assignmentId));
}