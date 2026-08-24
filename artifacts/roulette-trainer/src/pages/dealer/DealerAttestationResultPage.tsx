import { useMemo } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { getDealers } from "@/data/dealerStorage";
import { getTrainingAssignments, getTrainingTemplateById } from "@/data/attestationStorage";
import { getTrainingResultByAssignmentId } from "@/data/trainingResultStorage";
import { getRouletteExerciseByAssignmentId } from "@/data/rouletteExerciseStorage";
import { getGameDefinition } from "@/data/gameRegistry";
import { getCurrentDealerId } from "@/lib/dealerSession";
import { formatDateTime } from "@/lib/dateFormatting";
import SpinReport from "@/components/SpinReport";
import { DEFAULT_SETTINGS } from "@/types/gameSettings";

function formatDuration(seconds: number): string {
  const negative = seconds < 0;
  const absolute = Math.abs(Math.round(seconds));
  return `${negative ? "-" : ""}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

function ReturnToDealerButton() {
  return (
    <Link className="account-button account-button--inline" href="/dealer">
      Вернуться в кабинет
    </Link>
  );
}

export default function DealerAttestationResultPage() {
  const [, params] = useRoute("/dealer/attestations/:assignmentId/result");
  const [, navigate] = useLocation();
  const assignmentId = params?.assignmentId;
  const currentDealerId = getCurrentDealerId();
  const dealer = getDealers().find((candidate) => candidate.id === currentDealerId);
  const assignment = assignmentId
    ? getTrainingAssignments().find((candidate) => candidate.id === assignmentId)
    : undefined;
  const result = useMemo(
    () => (assignment ? getTrainingResultByAssignmentId(assignment.id) : undefined),
    [assignment?.id],
  );
  const exercise = useMemo(
    () => (assignment ? getRouletteExerciseByAssignmentId(assignment.id) : undefined),
    [assignment?.id],
  );
  const template = useMemo(
    () => (assignment ? getTrainingTemplateById(assignment.trainingTemplateId) : undefined),
    [assignment?.trainingTemplateId],
  );

  if (!dealer) {
    return (
      <main className="account-page">
        <section className="account-card" aria-labelledby="result-dealer-not-found-title">
          <h1 id="result-dealer-not-found-title">Дилер не найден.</h1>
          <Link className="account-button account-button--inline" href="/login">
            Вернуться ко входу
          </Link>
        </section>
      </main>
    );
  }

  if (!assignment || assignment.dealerId !== currentDealerId) {
    return (
      <main className="account-page">
        <section className="account-card" aria-labelledby="result-not-available-title">
          <h1 id="result-not-available-title">Результат аттестации недоступен</h1>
          <ReturnToDealerButton />
        </section>
      </main>
    );
  }

  const gameTitle = template ? getGameDefinition(template.gameType)?.title ?? "Игра" : "Игра";

  if (!exercise) {
    return (
      <main className="account-page">
        <section className="account-card account-card--wide dealer-result-page" aria-labelledby="result-exercise-unavailable-title">
          <p className="account-eyebrow">Личный кабинет дилера</p>
          <h1 id="result-exercise-unavailable-title">Исходное игровое поле недоступно.</h1>
          <ReturnToDealerButton />
        </section>
      </main>
    );
  }

  if (assignment.status !== "COMPLETED" || !result) {
    return (
      <main className="account-page">
        <section className="account-card account-card--wide dealer-result-page" aria-labelledby="result-unavailable-title">
          <p className="account-eyebrow">Личный кабинет дилера</p>
          <h1 id="result-unavailable-title">Результат аттестации недоступен.</h1>
          <p className="account-description">
            Сохранённый результат этого прохождения не найден.
          </p>
          <ReturnToDealerButton />
        </section>
      </main>
    );
  }

  if (!result.reportSnapshot) {
    return (
      <main className="account-page">
        <section className="account-card account-card--wide dealer-result-page" aria-labelledby="result-report-unavailable-title">
          <p className="account-eyebrow">Личный кабинет дилера</p>
          <h1 id="result-report-unavailable-title">Результат аттестации недоступен.</h1>
          <p className="account-description">В сохранённом результате отсутствуют данные полного отчёта.</p>
          <ReturnToDealerButton />
        </section>
      </main>
    );
  }

  const percentage = result.totalQuestions > 0
    ? Math.round((result.correctAnswers / result.totalQuestions) * 100)
    : 0;

  return (
    <main className="manager-result-page">
      <section className="manager-result-header dealer-result-page" aria-labelledby="result-title">
        <p className="account-eyebrow">Личный кабинет дилера</p>
        <h1 id="result-title">Аттестация завершена</h1>

        <div className="attestation-meta">
          <p><strong>Игра:</strong> {gameTitle}</p>
          <p><strong>Начало:</strong> {assignment.startedAt ? formatDateTime(assignment.startedAt) : "—"}</p>
          <p><strong>Завершение:</strong> {formatDateTime(assignment.completedAt ?? result.completedAt)}</p>
        </div>

        <div className="dealer-result-summary" aria-label="Итог аттестации">
          <p><strong>Правильных ответов:</strong> {result.correctAnswers} из {result.totalQuestions}</p>
          <p><strong>Результат:</strong> {percentage}%</p>
        </div>
        {result.actualDurationSeconds !== undefined && (
          <div className="attestation-time-summary" aria-label="Время прохождения">
            <h2>Время прохождения</h2>
            <p><span>Заданное время:</span> {result.configuredTimeSeconds !== undefined ? formatDuration(result.configuredTimeSeconds) : "—"}</p>
            <p><span>Фактическое время:</span> {formatDuration(result.actualDurationSeconds)}</p>
            <p><span>Уложился в заданное время:</span> {result.withinTimeLimit ? "Да" : "Нет"}</p>
            {result.overtimeSeconds ? <p><span>Превышение:</span> {formatDuration(result.overtimeSeconds)}</p> : null}
          </div>
        )}
      </section>

      <SpinReport
        exercise={exercise}
        reportSnapshot={result.reportSnapshot}
        settings={template?.config ?? DEFAULT_SETTINGS}
        onBack={() => navigate("/dealer")}
      />
    </main>
  );
}