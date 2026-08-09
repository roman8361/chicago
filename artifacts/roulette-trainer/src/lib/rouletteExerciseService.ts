import {
  getTrainingAssignments,
  getTrainingTemplateById,
} from "@/data/attestationStorage";
import {
  addRouletteExercise,
  deleteRouletteExerciseByAssignment,
  getRouletteExerciseByAssignmentId,
} from "@/data/rouletteExerciseStorage";
import { generateRouletteExercise } from "@/lib/rouletteExerciseGenerator";
import type { RouletteExercise } from "@/types/attestation";

export function getOrCreateRouletteExercise(assignmentId: string): RouletteExercise | undefined {
  const existing = getRouletteExerciseByAssignmentId(assignmentId);
  if (existing) return existing;

  const assignment = getTrainingAssignments().find((candidate) => candidate.id === assignmentId);
  if (!assignment) return undefined;
  const template = getTrainingTemplateById(assignment.trainingTemplateId);
  if (!template || template.gameType !== "ROULETTE") return undefined;

  return addRouletteExercise(assignment.id, generateRouletteExercise(template.config));
}

export function ensureRouletteExercisesForAssignments(assignmentIds: string[]): RouletteExercise[] {
  return assignmentIds
    .map((assignmentId) => getOrCreateRouletteExercise(assignmentId))
    .filter((exercise): exercise is RouletteExercise => exercise !== undefined);
}

export function regenerateRouletteExercisesForTemplate(templateId: string): RouletteExercise[] {
  const assignments = getTrainingAssignments().filter(
    (assignment) => assignment.trainingTemplateId === templateId && assignment.status === "CREATED",
  );
  assignments.forEach((assignment) => deleteRouletteExerciseByAssignment(assignment.id));
  return ensureRouletteExercisesForAssignments(assignments.map((assignment) => assignment.id));
}