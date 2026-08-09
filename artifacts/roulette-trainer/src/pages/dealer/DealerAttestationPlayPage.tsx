import { useMemo } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { getDealers } from "@/data/dealerStorage";
import {
  getTrainingAssignments,
  getTrainingTemplateById,
} from "@/data/attestationStorage";
import { getRouletteExerciseByAssignmentId } from "@/data/rouletteExerciseStorage";
import { getCurrentDealerId } from "@/lib/dealerSession";
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

  if (!dealer) {
    return <ErrorPage title="Дилер не найден." />;
  }

  if (!assignment) {
    return <ErrorPage title="Аттестация не найдена" />;
  }

  if (assignment.dealerId !== currentDealerId) {
    return <ErrorPage title="Аттестация недоступна" />;
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