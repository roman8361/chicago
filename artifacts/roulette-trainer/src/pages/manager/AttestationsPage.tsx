import { useMemo } from "react";
import { Link } from "wouter";
import { getAssignmentsByTemplateId, getTrainingTemplates } from "@/data/attestationStorage";
import { formatDateTime } from "@/lib/dateFormatting";

export default function AttestationsPage() {
  const templates = useMemo(() => getTrainingTemplates().reverse(), []);

  return (
    <main className="account-page">
      <section className="account-card account-card--wide" aria-labelledby="attestations-title">
        <p className="account-eyebrow">Руководитель</p>
        <h1 id="attestations-title">Аттестации</h1>

        {templates.length === 0 ? (
          <p className="account-description">Созданных аттестаций пока нет.</p>
        ) : (
          <div className="attestation-list">
            {templates.map((template) => (
              <div className="attestation-list-item" key={template.id}>
                <div>
                  <strong>{template.gameType === "ROULETTE" ? "Roulette" : template.gameType}</strong>
                  <span>{getAssignmentsByTemplateId(template.id).length} дилеров</span>
                  <span>{formatDateTime(template.createdAt)}</span>
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