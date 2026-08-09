import type { TrainingAssignment, TrainingTemplate } from "@/types/attestation";
import type { GameSettings } from "@/types/gameSettings";

export const TRAINING_TEMPLATES_STORAGE_KEY = "roulette-trainer-training-templates";
export const TRAINING_ASSIGNMENTS_STORAGE_KEY = "roulette-trainer-training-assignments";

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
    settings.cashChipValues.every((value) => typeof value === "string") &&
    typeof settings.showBetBeforeChange === "boolean"
  );
}

function isTrainingTemplate(value: unknown): value is TrainingTemplate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TrainingTemplate>;
  return (
    typeof candidate.id === "string" &&
    candidate.gameType === "ROULETTE" &&
    isGameSettings(candidate.config) &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string"
  );
}

function isTrainingAssignment(value: unknown): value is TrainingAssignment {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TrainingAssignment>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.trainingTemplateId === "string" &&
    typeof candidate.dealerId === "string" &&
    candidate.status === "CREATED" &&
    typeof candidate.createdAt === "string"
  );
}

function readArray<T>(key: string, guard: (value: unknown) => value is T): T[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(key);
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(guard) : [];
  } catch {
    return [];
  }
}

function writeArray<T>(key: string, values: T[]): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, JSON.stringify(values));
  }
}

function cloneConfig(config: GameSettings): GameSettings {
  return {
    ...config,
    cashChipValues: [...config.cashChipValues],
  };
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getTrainingTemplates(): TrainingTemplate[] {
  return readArray(TRAINING_TEMPLATES_STORAGE_KEY, isTrainingTemplate);
}

export function saveTrainingTemplates(templates: TrainingTemplate[]): void {
  writeArray(TRAINING_TEMPLATES_STORAGE_KEY, templates);
}

export function getTrainingTemplateById(templateId: string): TrainingTemplate | undefined {
  return getTrainingTemplates().find((template) => template.id === templateId);
}

export function addTrainingTemplate(
  gameType: TrainingTemplate["gameType"],
  config: GameSettings,
): TrainingTemplate {
  const now = new Date().toISOString();
  const template: TrainingTemplate = {
    id: createId("template"),
    gameType,
    config: cloneConfig(config),
    createdAt: now,
    updatedAt: now,
  };
  saveTrainingTemplates([...getTrainingTemplates(), template]);
  return template;
}

export function updateTrainingTemplate(
  templateId: string,
  changes: Partial<Pick<TrainingTemplate, "gameType" | "config">>,
): TrainingTemplate | null {
  const templates = getTrainingTemplates();
  const index = templates.findIndex((template) => template.id === templateId);
  if (index === -1) return null;

  const current = templates[index];
  const updated: TrainingTemplate = {
    ...current,
    ...changes,
    config: changes.config ? cloneConfig(changes.config) : cloneConfig(current.config),
    updatedAt: new Date().toISOString(),
  };
  const next = [...templates];
  next[index] = updated;
  saveTrainingTemplates(next);
  return updated;
}

export function deleteTrainingTemplate(templateId: string): void {
  saveTrainingTemplates(getTrainingTemplates().filter((template) => template.id !== templateId));
}

export function getTrainingAssignments(): TrainingAssignment[] {
  return readArray(TRAINING_ASSIGNMENTS_STORAGE_KEY, isTrainingAssignment);
}

export function saveTrainingAssignments(assignments: TrainingAssignment[]): void {
  writeArray(TRAINING_ASSIGNMENTS_STORAGE_KEY, assignments);
}

export function getAssignmentsByTemplateId(templateId: string): TrainingAssignment[] {
  return getTrainingAssignments().filter((assignment) => assignment.trainingTemplateId === templateId);
}

export function getAssignmentsByDealerId(dealerId: string): TrainingAssignment[] {
  return getTrainingAssignments().filter((assignment) => assignment.dealerId === dealerId);
}

export function addTrainingAssignment(
  trainingTemplateId: string,
  dealerId: string,
): TrainingAssignment {
  const assignment: TrainingAssignment = {
    id: createId("assignment"),
    trainingTemplateId,
    dealerId,
    status: "CREATED",
    createdAt: new Date().toISOString(),
  };
  saveTrainingAssignments([...getTrainingAssignments(), assignment]);
  return assignment;
}

export function deleteTrainingAssignment(assignmentId: string): void {
  saveTrainingAssignments(getTrainingAssignments().filter((assignment) => assignment.id !== assignmentId));
}