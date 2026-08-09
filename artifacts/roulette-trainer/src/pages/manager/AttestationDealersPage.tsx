import { useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { getDealers } from "@/data/dealerStorage";
import {
  addTrainingAssignment,
  deleteTrainingAssignment,
  getAssignmentsByTemplateId,
  getTrainingTemplateById,
} from "@/data/attestationStorage";
import { getAssignmentStatusLabel } from "@/lib/attestationStatus";

export default function AttestationDealersPage() {
  const [, params] = useRoute("/manager/attestations/:templateId/dealers");
  const [, navigate] = useLocation();
  const templateId = params?.templateId;
  const template = templateId ? getTrainingTemplateById(templateId) : undefined;
  const dealers = useMemo(() => getDealers(), []);
  const assignments = useMemo(
    () => (templateId ? getAssignmentsByTemplateId(templateId) : []),
    [templateId],
  );
  const [selectedDealerIds, setSelectedDealerIds] = useState<string[]>(
    () => assignments.map((assignment) => assignment.dealerId),
  );
  const [error, setError] = useState<string | null>(null);

  if (!template || !templateId) {
    return (
      <main className="account-page">
        <section className="account-card" aria-labelledby="attestation-dealers-not-found-title">
          <h1 id="attestation-dealers-not-found-title">Аттестация не найдена</h1>
          <Link className="account-button account-button--inline" href="/manager">
            Вернуться в кабинет
          </Link>
        </section>
      </main>
    );
  }

  const attestationId = template.id;
  const assignmentByDealerId = new Map(
    assignments.map((assignment) => [assignment.dealerId, assignment]),
  );
  const selectedSet = new Set(selectedDealerIds);
  const lockedDealerIds = new Set(
    assignments
      .filter((assignment) => assignment.status !== "CREATED")
      .map((assignment) => assignment.dealerId),
  );

  function toggleDealer(dealerId: string) {
    if (lockedDealerIds.has(dealerId)) return;
    setSelectedDealerIds((current) =>
      current.includes(dealerId)
        ? current.filter((id) => id !== dealerId)
        : [...current, dealerId],
    );
  }

  function saveDealers() {
    if (selectedDealerIds.length === 0) {
      setError("Выберите хотя бы одного дилера.");
      return;
    }

    const selected = new Set(selectedDealerIds);
    assignments.forEach((assignment) => {
      if (!selected.has(assignment.dealerId) && assignment.status === "CREATED") {
        deleteTrainingAssignment(assignment.id);
      }
    });

    const existingIds = new Set(assignments.map((assignment) => assignment.dealerId));
    selectedDealerIds.forEach((dealerId) => {
      if (!existingIds.has(dealerId)) {
        addTrainingAssignment(attestationId, dealerId);
      }
    });

    navigate(`/manager/attestations/${encodeURIComponent(attestationId)}`);
  }

  return (
    <main className="account-page">
      <section className="account-card account-card--wide training-wizard-card" aria-labelledby="attestation-dealers-title">
        <p className="account-eyebrow">Аттестация</p>
        <h1 id="attestation-dealers-title">Изменить дилеров</h1>
        <div className="training-summary">
          <p><strong>Игра:</strong> Roulette</p>
          <p>Начатые и завершённые назначения нельзя снять.</p>
        </div>

        <div className="dealer-selection-list">
          {dealers.map((dealer) => {
            const assignment = assignmentByDealerId.get(dealer.id);
            const checked = selectedSet.has(dealer.id);
            const locked = lockedDealerIds.has(dealer.id);
            return (
              <label
                className={`dealer-selection-item${checked ? " dealer-selection-item--selected" : ""}`}
                key={dealer.id}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={locked}
                  onChange={() => toggleDealer(dealer.id)}
                />
                <span className="dealer-selection-copy">
                  <strong>{dealer.fullName}</strong>
                  {assignment && (
                    <small>{getAssignmentStatusLabel(assignment.status)}</small>
                  )}
                </span>
              </label>
            );
          })}
        </div>

        {error && <p className="review-error-message" role="alert">{error}</p>}

        <div className="account-actions training-wizard-actions">
          <button className="account-button" type="button" onClick={saveDealers}>
            Сохранить
          </button>
          <button
            className="account-button account-button--secondary"
            type="button"
            onClick={() => navigate(`/manager/attestations/${encodeURIComponent(templateId)}`)}
          >
            Отмена
          </button>
        </div>
      </section>
    </main>
  );
}