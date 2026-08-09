import { useMemo } from "react";
import { Link } from "wouter";
import { getAssignmentsByTemplateId, getTrainingTemplates } from "@/data/attestationStorage";
import { getGameDefinition } from "@/data/gameRegistry";
import { formatDateTime } from "@/lib/dateFormatting";

export default function AttestationsPage() {
  const templates = useMemo(
    () =>
      [...getTrainingTemplates()].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      ),
    [],
  );

  return (
    <main className="account-page">
      <section className="account-card account-card--wide" aria-labelledby="attestations-title">
        <p className="account-eyebrow">Руководитель</p>
        <h1 id="attestations-title">Аттестации</h1>

        {templates.length === 0 ? (
          <div className="account-actions">
            <p className="account-description">Аттестаций пока нет.</p>
            <Link className="account-button account-button--inline" href="/manager/training/new/game">
              Создать аттестацию
            </Link>
          </div>
        ) : (
          <div className="attestation-list">
            {templates.map((template) => (
              <div className="attestation-list-item" key={template.id}>
                <div>
                  <strong>{getGameDefinition(template.gameType)?.title ?? template.gameType}</strong>
                  <span>Создана: {formatDateTime(template.createdAt)}</span>
                  <span>Дилеров: {getAssignmentsByTemplateId(template.id).length}</span>
                </div>
                <Link className="review-edit-button" href={`/manager/attestations/${encodeURIComponent(template.id)}`}>
                  Открыть
                </Link>
              </div>
            ))}
          </div>
        )}

        <div className="account-actions">
          <Link className="account-link" href="/manager">
            Назад
          </Link>
        </div>
      </section>
    </main>
  );
}