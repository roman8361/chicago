import { useMemo } from "react";
import { Link, useRoute } from "wouter";
import RouletteSettingsSummary from "@/components/RouletteSettingsSummary";
import { getDealers } from "@/data/dealerStorage";
import { getAssignmentsByTemplateId, getTrainingTemplateById } from "@/data/attestationStorage";

export default function AttestationPage() {
  const [, params] = useRoute("/manager/attestations/:templateId");
  const templateId = params?.templateId;
  const template = templateId ? getTrainingTemplateById(templateId) : undefined;
  const assignments = useMemo(
    () => (templateId ? getAssignmentsByTemplateId(templateId) : []),
    [templateId],
  );
  const dealers = useMemo(() => getDealers(), []);

  if (!template) {
    return (
      <main className="account-page">
        <section className="account-card" aria-labelledby="attestation-not-found-title">
          <h1 id="attestation-not-found-title">Аттестация не найдена</h1>
          <Link className="account-button account-button--inline" href="/manager">
            Вернуться в кабинет
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="account-page">
      <section className="account-card account-card--wide training-wizard-card" aria-labelledby="attestation-title">
        <p className="account-eyebrow">Руководитель</p>
        <h1 id="attestation-title">Аттестация</h1>

        <div className="attestation-meta">
          <p><strong>Игра:</strong> Roulette</p>
          <p><strong>Создана:</strong> {new Date(template.createdAt).toLocaleDateString("ru-RU")}</p>
          <p><strong>Статус:</strong> Создана</p>
        </div>

        <div className="review-section">
          <div className="review-section-header">
            <h2>Дилеры</h2>
          </div>
          <div className="review-dealers-list">
            {assignments.map((assignment) => {
              const dealer = dealers.find((candidate) => candidate.id === assignment.dealerId);
              return (
                <div className="review-dealer-name" key={assignment.id}>
                  {dealer?.fullName ?? "Дилер удалён"}
                </div>
              );
            })}
          </div>
          <p className="review-count">Назначено дилеров: {assignments.length}</p>
        </div>

        <div className="review-section">
          <div className="review-section-header">
            <h2>Настройки Roulette</h2>
          </div>
          <RouletteSettingsSummary settings={template.config} />
        </div>

        <div className="attestation-actions">
          <button className="review-edit-button" type="button" disabled title="Будет доступно на следующем этапе">
            Изменить настройки
          </button>
          <button className="review-edit-button" type="button" disabled title="Будет доступно на следующем этапе">
            Изменить дилеров
          </button>
          <button className="review-edit-button review-edit-button--danger" type="button" disabled title="Будет доступно на следующем этапе">
            Удалить аттестацию
          </button>
        </div>

        <div className="account-actions">
          <Link className="account-link" href="/manager">
            Назад
          </Link>
        </div>
      </section>
    </main>
  );
}