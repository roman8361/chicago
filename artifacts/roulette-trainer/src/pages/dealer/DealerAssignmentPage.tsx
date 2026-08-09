import { useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { getDealers } from "@/data/dealerStorage";
import {
  getTrainingAssignments,
  getTrainingTemplateById,
  updateTrainingAssignmentStatus,
} from "@/data/attestationStorage";
import { getRouletteExerciseByAssignmentId } from "@/data/rouletteExerciseStorage";
import { getGameDefinition } from "@/data/gameRegistry";
import { getAssignmentStatusLabel } from "@/lib/attestationStatus";
import { getCurrentDealerId } from "@/lib/dealerSession";
import { formatDateTime } from "@/lib/dateFormatting";

function ReturnToDealerButton() {
  return (
    <Link className="account-button account-button--inline" href="/dealer">
      Вернуться в кабинет
    </Link>
  );
}

export default function DealerAssignmentPage() {
  const [, params] = useRoute("/dealer/attestations/:assignmentId");
  const [, navigate] = useLocation();
  const assignmentId = params?.assignmentId;
  const currentDealerId = getCurrentDealerId();
  const dealer = getDealers().find((candidate) => candidate.id === currentDealerId);
  const assignment = assignmentId
    ? getTrainingAssignments().find((candidate) => candidate.id === assignmentId)
    : undefined;
  const [actionError, setActionError] = useState<string | null>(null);

  if (!dealer) {
    return (
      <main className="account-page">
        <section className="account-card" aria-labelledby="assignment-dealer-not-found-title">
          <h1 id="assignment-dealer-not-found-title">Дилер не найден.</h1>
          <Link className="account-button account-button--inline" href="/login">
            Вернуться ко входу
          </Link>
        </section>
      </main>
    );
  }

  if (!assignment) {
    return (
      <main className="account-page">
        <section className="account-card" aria-labelledby="assignment-not-found-title">
          <h1 id="assignment-not-found-title">Аттестация не найдена</h1>
          <ReturnToDealerButton />
        </section>
      </main>
    );
  }

  if (assignment.dealerId !== currentDealerId) {
    return (
      <main className="account-page">
        <section className="account-card" aria-labelledby="assignment-forbidden-title">
          <h1 id="assignment-forbidden-title">Аттестация недоступна</h1>
          <ReturnToDealerButton />
        </section>
      </main>
    );
  }

  const template = getTrainingTemplateById(assignment.trainingTemplateId);
  if (!template) {
    return (
      <main className="account-page">
        <section className="account-card" aria-labelledby="assignment-data-unavailable-title">
          <h1 id="assignment-data-unavailable-title">Данные аттестации недоступны</h1>
          <p className="account-description">
            Шаблон этой аттестации больше не найден.
          </p>
          <ReturnToDealerButton />
        </section>
      </main>
    );
  }

  const gameTitle = getGameDefinition(template.gameType)?.title ?? "Игра";
  const exercise = getRouletteExerciseByAssignmentId(assignment.id);
  const assignmentRecordId = assignment.id;
  const actionLabel =
    assignment.status === "CREATED"
      ? "Начать аттестацию"
      : assignment.status === "IN_PROGRESS"
        ? "Продолжить аттестацию"
        : "Аттестация завершена";

  function openPlay() {
    setActionError(null);

    // Re-read the records at click time so the checks are not based only on
    // the data captured during the initial render.
    const latestAssignment = getTrainingAssignments().find((candidate) => candidate.id === assignmentRecordId);
    if (!latestAssignment || latestAssignment.dealerId !== currentDealerId) {
      setActionError("Аттестация недоступна");
      return;
    }

    const latestTemplate = getTrainingTemplateById(latestAssignment.trainingTemplateId);
    if (!latestTemplate) {
      setActionError("Данные аттестации недоступны");
      return;
    }

    const latestExercise = getRouletteExerciseByAssignmentId(latestAssignment.id);
    if (!latestExercise) {
      setActionError("Задание не подготовлено. Обратитесь к руководителю.");
      return;
    }

    if (latestTemplate.gameType !== "ROULETTE") {
      setActionError("Эта игра пока не поддерживается.");
      return;
    }

    if (latestAssignment.status === "CREATED") {
      const startedAt = latestAssignment.startedAt ?? new Date().toISOString();
      const updated = updateTrainingAssignmentStatus(
        latestAssignment.id,
        "IN_PROGRESS",
        startedAt,
      );
      if (!updated) {
        setActionError("Не удалось начать аттестацию. Попробуйте ещё раз.");
        return;
      }
    }

    navigate(`/dealer/attestations/${encodeURIComponent(latestAssignment.id)}/play`);
  }

  return (
    <main className="account-page">
      <section className="account-card account-card--wide dealer-assignment-page" aria-labelledby="dealer-assignment-title">
        <p className="account-eyebrow">Личный кабинет дилера</p>
        <h1 id="dealer-assignment-title">Аттестация</h1>

        <div className="attestation-meta">
          <p><strong>Игра:</strong> {gameTitle}</p>
          <p><strong>Назначена:</strong> {formatDateTime(assignment.createdAt)}</p>
          <p><strong>Статус:</strong> {getAssignmentStatusLabel(assignment.status)}</p>
        </div>

        <div className="dealer-assignment-exercise">
          <h2>Задание</h2>
          <p className={exercise ? "dealer-exercise-ready" : "dealer-exercise-missing"}>
            {exercise ? "Задание подготовлено" : "Задание не подготовлено"}
          </p>
        </div>

        <div className="dealer-assignment-actions">
          <button
            className="account-button"
            type="button"
            onClick={openPlay}
            disabled={assignment.status === "COMPLETED"}
          >
            {actionLabel}
          </button>
          <button className="account-link dealer-cancel-button" type="button" onClick={() => navigate("/dealer")}>
            Назад
          </button>
        </div>
        {actionError && <p className="dealer-action-error" role="alert">{actionError}</p>}
      </section>
    </main>
  );
}