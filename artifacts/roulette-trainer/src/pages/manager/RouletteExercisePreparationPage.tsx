import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import RouletteTable from "@/pages/RouletteTable";
import { getDealers } from "@/data/dealerStorage";
import {
  getAssignmentsByTemplateId,
  getTrainingTemplateById,
} from "@/data/attestationStorage";
import {
  addRouletteExercise,
  getRouletteExerciseByAssignmentId,
} from "@/data/rouletteExerciseStorage";
import type { GameState } from "@/lib/rouletteGame";
import type { TrainingAssignment } from "@/types/attestation";

export default function RouletteExercisePreparationPage() {
  const [, params] = useRoute("/manager/attestations/:templateId/prepare");
  const [, navigate] = useLocation();
  const templateId = params?.templateId;
  const template = templateId ? getTrainingTemplateById(templateId) : undefined;
  const assignments = useMemo(
    () => (templateId ? getAssignmentsByTemplateId(templateId) : []),
    [templateId],
  );
  const dealerNames = useMemo(
    () => new Map(getDealers().map((dealer) => [dealer.id, dealer.fullName])),
    [],
  );
  const missingAssignments = useMemo(
    () => assignments.filter(
      (assignment) =>
        assignment.status === "CREATED" &&
        !getRouletteExerciseByAssignmentId(assignment.id),
    ),
    [assignments],
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const currentAssignment: TrainingAssignment | undefined = missingAssignments[currentIndex];

  const finish = useCallback(() => {
    if (templateId) {
      navigate(`/manager/attestations/${encodeURIComponent(templateId)}`, { replace: true });
    } else {
      navigate("/manager", { replace: true });
    }
  }, [navigate, templateId]);

  useEffect(() => {
    if (template && template.gameType === "ROULETTE" && missingAssignments.length === 0) {
      finish();
    }
  }, [finish, missingAssignments.length, template]);

  function handleRoundGenerated(game: GameState) {
    if (!currentAssignment || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      if (
        currentAssignment.status !== "CREATED" ||
        getRouletteExerciseByAssignmentId(currentAssignment.id)
      ) {
        setCurrentIndex((index) => index + 1);
        setIsSaving(false);
        return;
      }

      addRouletteExercise(currentAssignment.id, game);
      const nextIndex = currentIndex + 1;
      if (nextIndex >= missingAssignments.length) {
        finish();
      } else {
        setCurrentIndex(nextIndex);
        setIsSaving(false);
      }
    } catch {
      setError("Не удалось подготовить задание. Попробуйте ещё раз.");
      setIsSaving(false);
    }
  }

  if (!template || template.gameType !== "ROULETTE" || !templateId) {
    return (
      <main className="account-page">
        <section className="account-card" aria-labelledby="exercise-preparation-not-found-title">
          <h1 id="exercise-preparation-not-found-title">Аттестация не найдена</h1>
          <Link className="account-button account-button--inline" href="/manager">
            Вернуться в кабинет
          </Link>
        </section>
      </main>
    );
  }

  if (missingAssignments.length === 0) {
    return (
      <main className="account-page">
        <section className="account-card" aria-labelledby="exercise-preparation-complete-title">
          <h1 id="exercise-preparation-complete-title">Подготовка завершена</h1>
          <p className="account-description">Возвращаемся к аттестации руководителя.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="account-page">
      <section className="account-card training-wizard-card" aria-labelledby="exercise-preparation-title">
        <p className="account-eyebrow">Подготовка аттестации</p>
        <h1 id="exercise-preparation-title">Подготовка заданий Roulette</h1>
        <p className="account-description">
          Создаём отдельное упражнение для каждого нового назначения дилера.
        </p>
        <div className="training-summary">
          <p>
            <strong>Дилер:</strong>{" "}
            {currentAssignment ? dealerNames.get(currentAssignment.dealerId) ?? "Дилер удалён" : "—"}
          </p>
          <p>
            Задание {Math.min(currentIndex + 1, missingAssignments.length)} из {missingAssignments.length}
          </p>
        </div>
        {error && <p className="review-error-message" role="alert">{error}</p>}
        <div style={{ display: "none" }} aria-hidden="true">
          {currentAssignment && !isSaving && (
            <RouletteTable
              key={currentAssignment.id}
              settings={template.config}
              autoGenerateRound
              onRoundGenerated={handleRoundGenerated}
              onOpenSettings={() => undefined}
              onOpenDebug={() => undefined}
              showGrid={false}
              setShowGrid={() => undefined}
              showTrack={false}
              setShowTrack={() => undefined}
              showDozens={false}
              setShowDozens={() => undefined}
              editMode={false}
              setEditMode={() => undefined}
            />
          )}
        </div>
      </section>
    </main>
  );
}