import type { TrainingAssignment, TrainingAssignmentStatus } from "@/types/attestation";

export const ASSIGNMENT_STATUS_LABELS: Record<TrainingAssignmentStatus, string> = {
  CREATED: "Не начата",
  IN_PROGRESS: "В процессе",
  COMPLETED: "Завершена",
};

export function getAssignmentStatusLabel(status: TrainingAssignmentStatus): string {
  return ASSIGNMENT_STATUS_LABELS[status];
}

export function getTemplateStatus(assignments: TrainingAssignment[]): string {
  if (assignments.length > 0 && assignments.every((assignment) => assignment.status === "COMPLETED")) {
    return "Завершена";
  }

  if (assignments.some((assignment) => assignment.status === "IN_PROGRESS" || assignment.status === "COMPLETED")) {
    return "В процессе";
  }

  return "Не начата";
}

export function hasStartedAssignment(assignments: TrainingAssignment[]): boolean {
  return assignments.some((assignment) => assignment.status !== "CREATED");
}