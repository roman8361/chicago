import { Link, useLocation, useRoute } from "wouter";
import { useMemo } from "react";
import { getDealers } from "@/data/dealerStorage";
import {
  getTrainingAssignments,
  getTrainingTemplateById,
} from "@/data/attestationStorage";
import { getTrainingResultByAssignmentId } from "@/data/trainingResultStorage";
import { getGameDefinition } from "@/data/gameRegistry";
import { formatDateTime } from "@/lib/dateFormatting";
import { getRouletteExerciseByAssignmentId } from "@/data/rouletteExerciseStorage";
import RouletteTable from "@/pages/RouletteTable";

function BackToAttestation({ templateId }: { templateId: string }) {
  return (
    <Link
      className="account-button account-button--inline"
      href={`/manager/attestations/${encodeURIComponent(templateId)}`}
    >
      Назад к аттестации
    </Link>
  );
}

export default function ManagerDealerResultPage() {
  const [, params] = useRoute("/manager/attestations/:templateId/results/:assignmentId");
  const [, navigate] = useLocation();
  const templateId = params?.templateId;
  const assignmentId = params?.assignmentId;
  const template = templateId ? getTrainingTemplateById(templateId) : undefined;
  const assignment = assignmentId
    ? getTrainingAssignments().find(
        (candidate) =>
          candidate.id === assignmentId &&
          candidate.trainingTemplateId === templateId,
      )
    : undefined;
  const dealer = assignment
    ? getDealers().find((candidate) => candidate.id === assignment.dealerId)
    : undefined;
  const result = useMemo(
    () => (assignment ? getTrainingResultByAssignmentId(assignment.id) : undefined),
    [assignment?.id],
  );
  const exercise = useMemo(
    () => (assignment ? getRouletteExerciseByAssignmentId(assignment.id) : undefined),
    [assignment?.id],
  );

  if (!templateId || !assignment) {
    return (
      <main className="account-page">
        <section className="account-card" aria-labelledby="manager-result-not-found-title">
          <h1 id="manager-result-not-found-title">Результат не найден</h1>
          {templateId && <BackToAttestation templateId={templateId} />}
        </section>
      </main>
    );
  }

  if (!template) {
    return (
      <main className="account-page">
        <section className="account-card account-card--wide dealer-result-page" aria-labelledby="manager-result-unavailable-title">
          <p className="account-eyebrow">Руководитель</p>
          <h1 id="manager-result-unavailable-title">Результат аттестации недоступен</h1>
          <p className="account-description">
            Шаблон аттестации не найден.
          </p>
          <BackToAttestation templateId={templateId} />
        </section>
      </main>
    );
  }

  if (!exercise) {
    return (
      <main className="account-page">
        <section className="account-card account-card--wide dealer-result-page" aria-labelledby="manager-exercise-unavailable-title">
          <p className="account-eyebrow">Руководитель</p>
          <h1 id="manager-exercise-unavailable-title">Исходное игровое поле недоступно.</h1>
          <p className="account-description">
            Сохранённое упражнение Roulette для этого назначения не найдено.
          </p>
          <BackToAttestation templateId={templateId} />
        </section>
      </main>
    );
  }

  if (assignment.status !== "COMPLETED" || !result) {
    return (
      <main className="account-page">
        <section className="account-card account-card--wide dealer-result-page" aria-labelledby="manager-result-unavailable-title">
          <p className="account-eyebrow">Руководитель</p>
          <h1 id="manager-result-unavailable-title">Результат аттестации недоступен.</h1>
          <p className="account-description">
            Сохранённый результат этого прохождения не найден.
          </p>
          <BackToAttestation templateId={templateId} />
        </section>
      </main>
    );
  }

  if (!result.reportSnapshot) {
    return (
      <main className="account-page">
        <section className="account-card account-card--wide dealer-result-page" aria-labelledby="manager-report-unavailable-title">
          <p className="account-eyebrow">Руководитель</p>
          <h1 id="manager-report-unavailable-title">Результат аттестации недоступен.</h1>
          <p className="account-description">
            В сохранённом результате отсутствуют данные полного отчёта.
          </p>
          <BackToAttestation templateId={templateId} />
        </section>
      </main>
    );
  }

  const gameTitle = getGameDefinition(template.gameType)?.title ?? "Игра";
  const percentage = result.totalQuestions > 0
    ? Math.round((result.correctAnswers / result.totalQuestions) * 100)
    : 0;

  return (
    <main className="account-page">
      <section className="account-card account-card--wide dealer-result-page" aria-labelledby="manager-result-title">
        <p className="account-eyebrow">Руководитель</p>
        <h1 id="manager-result-title">Результат аттестации</h1>

        <div className="attestation-meta">
          <p><strong>Дилер:</strong> {dealer?.fullName ?? "Дилер удалён"}</p>
          <p><strong>Игра:</strong> {gameTitle}</p>
          <p><strong>Начало:</strong> {assignment.startedAt ? formatDateTime(assignment.startedAt) : "—"}</p>
          <p><strong>Завершение:</strong> {formatDateTime(assignment.completedAt ?? result.completedAt)}</p>
        </div>

        <div className="dealer-result-summary" aria-label="Итог аттестации">
          <p><strong>Правильных ответов:</strong> {result.correctAnswers} из {result.totalQuestions}</p>
          <p><strong>Результат:</strong> {percentage}%</p>
        </div>

        <RouletteTable
          mode="ATTESTATION"
          attestationExercise={exercise}
          readOnlyReport
          savedReport={result.reportSnapshot}
          settings={template.config}
          onOpenSettings={() => undefined}
          onOpenDebug={() => undefined}
          onBackToAttestation={() => navigate(`/manager/attestations/${encodeURIComponent(templateId)}`)}
          showGrid={false}
          setShowGrid={() => undefined}
          showTrack={false}
          setShowTrack={() => undefined}
          showDozens={false}
          setShowDozens={() => undefined}
          editMode={false}
          setEditMode={() => undefined}
        />

        <div className="account-actions">
          <BackToAttestation templateId={templateId} />
        </div>
      </section>
    </main>
  );
}