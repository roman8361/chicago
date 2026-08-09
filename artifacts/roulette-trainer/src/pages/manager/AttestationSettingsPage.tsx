import { useMemo } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { RouletteSettingsForm } from "@/pages/SettingsScreen";
import {
  getTrainingTemplateById,
  updateTrainingTemplate,
} from "@/data/attestationStorage";

export default function AttestationSettingsPage() {
  const [, params] = useRoute("/manager/attestations/:templateId/settings");
  const [, navigate] = useLocation();
  const templateId = params?.templateId;
  const template = useMemo(
    () => (templateId ? getTrainingTemplateById(templateId) : undefined),
    [templateId],
  );

  if (!template) {
    return (
      <main className="account-page">
        <section className="account-card" aria-labelledby="attestation-settings-not-found-title">
          <h1 id="attestation-settings-not-found-title">Аттестация не найдена</h1>
          <Link className="account-button account-button--inline" href="/manager">
            Вернуться в кабинет
          </Link>
        </section>
      </main>
    );
  }

  if (template.gameType !== "ROULETTE") {
    return (
      <main className="account-page">
        <section className="account-card" aria-labelledby="attestation-settings-game-title">
          <h1 id="attestation-settings-game-title">Игра не поддерживается</h1>
          <Link
            className="account-button account-button--inline"
            href={`/manager/attestations/${encodeURIComponent(template.id)}`}
          >
            Вернуться к аттестации
          </Link>
        </section>
      </main>
    );
  }

  const attestationPath = `/manager/attestations/${encodeURIComponent(template.id)}`;

  return (
    <RouletteSettingsForm
      initialSettings={template.config}
      title="Изменить настройки"
      submitLabel="Сохранить"
      onStart={(settings) => {
        updateTrainingTemplate(template.id, { config: settings });
        navigate(attestationPath);
      }}
      onCancel={() => navigate(attestationPath)}
      header={
        <div className="training-summary">
          <p><strong>Аттестация</strong></p>
          <p><strong>Игра:</strong> Roulette</p>
        </div>
      }
    />
  );
}