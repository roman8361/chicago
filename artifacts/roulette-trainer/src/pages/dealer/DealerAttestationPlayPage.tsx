import { useMemo } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { getDealers } from "@/data/dealerStorage";
import {
  completeTrainingAssignment,
  getTrainingAssignments,
  getTrainingTemplateById,
} from "@/data/attestationStorage";
import { getRouletteExerciseByAssignmentId } from "@/data/rouletteExerciseStorage";
import {
  addTrainingResult,
  deleteTrainingResultByAssignmentId,
  getTrainingResultByAssignmentId,
} from "@/data/trainingResultStorage";
import { getCurrentDealerId } from "@/lib/dealerSession";
import type { TrainingAnswer } from "@/types/attestation";
import RouletteTable, { type RouletteMode } from "@/pages/RouletteTable";

function ErrorPage({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="account-page">
      <section className="account-card" aria-labelledby="dealer-play-error-title">
        <h1 id="dealer-play-error-title">{title}</h1>
        {children ?? (
          <Link className="account-button account-button--inline" href="/dealer">
            Вернуться в кабинет
          </Link>
        )}
      </section>
    </main>
  );
}

export default function DealerAttestationPlayPage() {
  const [, params] = useRoute("/dealer/attestations/:assignmentId/play");
  const [, navigate] = useLocation();
  const assignmentId = params?.assignmentId;
  const currentDealerId = getCurrentDealerId();
  const dealer = getDealers().find((candidate) => candidate.id === currentDealerId);
  const assignment = assignmentId
    ? getTrainingAssignments().find((candidate) => candidate.id === assignmentId)
    : undefined;

  const template = assignment
    ? getTrainingTemplateById(assignment.trainingTemplateId)
    : undefined;
  const exercise = useMemo(
    () => (assignmentId ? getRouletteExerciseByAssignmentId(assignmentId) : undefined),
    [assignmentId],
  );

  function completeAttestation(answers: TrainingAnswer[]): string | null {
    const latestAssignment = getTrainingAssignments().find((candidate) => candidate.id === assignmentId);
    if (!latestAssignment || latestAssignment.dealerId !== currentDealerId) {
      return "Аттестация недоступна.";
    }
    if (latestAssignment.status === "COMPLETED") {
      return "Аттестация уже завершена.";
    }
    if (getTrainingResultByAssignmentId(latestAssignment.id)) {
      return "Результат этого прохождения уже сохранён.";
    }
    if (answers.length === 0) {
      return "Не удалось сохранить ответы аттестации.";
    }

    const completedAt = new Date().toISOString();
    const result = addTrainingResult({
      assignmentId: latestAssignment.id,
      answers,
      totalQuestions: answers.length,
      correctAnswers: answers.filter((answer) => answer.correct).length,
      completedAt,
    });
    const updated = completeTrainingAssignment(latestAssignment.id, completedAt);
    if (!updated) {
      deleteTrainingResultByAssignmentId(latestAssignment.id);
      return "Не удалось завершить аттестацию. Попробуйте ещё раз.";
    }

    navigate(`/dealer/attestations/${encodeURIComponent(latestAssignment.id)}/result`);
    return null;
  }

  if (!dealer) {
    return <ErrorPage title="Дилер не найден." />;
  }

  if (!assignment) {
    return <ErrorPage title="Аттестация не найдена" />;
  }

  if (assignment.dealerId !== currentDealerId) {
    return <ErrorPage title="Аттестация недоступна" />;
  }

  if (assignment.status === "COMPLETED") {
    return (
      <ErrorPage title="Аттестация уже завершена">
        <Link
          className="account-button account-button--inline"
          href={`/dealer/attestations/${encodeURIComponent(assignment.id)}/result`}
        >
          Посмотреть результат
        </Link>
      </ErrorPage>
    );
  }

  if (!template) {
    return <ErrorPage title="Данные аттестации недоступны" />;
  }

  if (template.gameType !== "ROULETTE") {
    return <ErrorPage title="Эта игра пока не поддерживается." />;
  }

  if (!exercise) {
    return (
      <ErrorPage title="Задание не подготовлено. Обратитесь к руководителю." />
    );
  }

  const mode: RouletteMode = "ATTESTATION";
  return (
    <RouletteTable
      mode={mode}
      attestationExercise={exercise}
      settings={template.config}
      onCompleteAttestation={completeAttestation}
      onOpenSettings={() => undefined}
      onOpenDebug={() => undefined}
      onBackToAttestation={() => navigate(`/dealer/attestations/${encodeURIComponent(assignment.id)}`)}
      showGrid={false}
      setShowGrid={() => undefined}
      showTrack={false}
      setShowTrack={() => undefined}
      showDozens={false}
      setShowDozens={() => undefined}
      editMode={false}
      setEditMode={() => undefined}
    />
  );
}