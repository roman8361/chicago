import type { TrainingAnswer, TrainingResult } from "@/types/attestation";

export const TRAINING_RESULTS_STORAGE_KEY = "roulette-trainer-training-results";

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

function isTrainingResult(value: unknown): value is TrainingResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TrainingResult>;
  const reportSnapshot = candidate.reportSnapshot;
  const hasValidReportSnapshot = reportSnapshot === undefined
    || (!!reportSnapshot && typeof reportSnapshot === "object" && !Array.isArray(reportSnapshot));
  return (
    typeof candidate.id === "string" &&
    typeof candidate.assignmentId === "string" &&
    Array.isArray(candidate.answers) &&
    candidate.answers.every(isTrainingAnswer) &&
    typeof candidate.totalQuestions === "number" &&
    typeof candidate.correctAnswers === "number" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.completedAt === "string" &&
    (candidate.configuredTimeSeconds === undefined || typeof candidate.configuredTimeSeconds === "number") &&
    (candidate.actualDurationSeconds === undefined || typeof candidate.actualDurationSeconds === "number") &&
    (candidate.withinTimeLimit === undefined || typeof candidate.withinTimeLimit === "boolean") &&
    (candidate.overtimeSeconds === undefined || typeof candidate.overtimeSeconds === "number") &&
    hasValidReportSnapshot
  );
}

function readResults(): TrainingResult[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(TRAINING_RESULTS_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isTrainingResult) : [];
  } catch {
    return [];
  }
}

function saveResults(results: TrainingResult[]): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(TRAINING_RESULTS_STORAGE_KEY, JSON.stringify(results));
  }
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `training-result-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getTrainingResults(): TrainingResult[] {
  return readResults();
}

export function getTrainingResultByAssignmentId(assignmentId: string): TrainingResult | undefined {
  return readResults().find((result) => result.assignmentId === assignmentId);
}

export function addTrainingResult(input: Omit<TrainingResult, "id">): TrainingResult {
  const result: TrainingResult = {
    ...input,
    id: createId(),
    answers: input.answers.map((answer) => ({ ...answer })),
  };
  saveResults([
    ...readResults().filter((candidate) => candidate.assignmentId !== input.assignmentId),
    result,
  ]);
  return result;
}

export function deleteTrainingResultByAssignmentId(assignmentId: string): void {
  saveResults(readResults().filter((result) => result.assignmentId !== assignmentId));
}