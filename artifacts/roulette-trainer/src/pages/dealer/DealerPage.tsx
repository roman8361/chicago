import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { getDealers } from "@/data/dealerStorage";
import {
  getTrainingAssignments,
  getTrainingTemplateById,
} from "@/data/attestationStorage";
import { getGameDefinition } from "@/data/gameRegistry";
import { clearCurrentDealerId, getCurrentDealerId } from "@/lib/dealerSession";
import { getAssignmentStatusLabel } from "@/lib/attestationStatus";
import { formatDateTime } from "@/lib/dateFormatting";

export default function DealerPage() {
  const [, navigate] = useLocation();
  const currentDealerId = getCurrentDealerId();
  const dealer = getDealers().find((candidate) => candidate.id === currentDealerId);
  const assignments = useMemo(
    () =>
      currentDealerId
        ? getTrainingAssignments()
            .filter((assignment) => assignment.dealerId === currentDealerId)
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        : [],
    [currentDealerId],
  );

  function handleLogout() {
    clearCurrentDealerId();
    navigate("/login");
  }

  if (!currentDealerId) {
    return (
      <main className="account-page">
        <section className="account-card" aria-labelledby="dealer-login-required-title">
          <p className="account-eyebrow">Личный кабинет</p>
          <h1 id="dealer-login-required-title">Войдите как дилер</h1>
          <p className="account-description">
            Сначала выберите дилера на временном экране входа.
          </p>
          <Link className="account-button account-button--inline" href="/login">
            Вернуться ко входу
          </Link>
        </section>
      </main>
    );
  }

  if (!dealer) {
    return (
      <main className="account-page">
        <section className="account-card" aria-labelledby="dealer-not-found-title">
          <p className="account-eyebrow">Личный кабинет</p>
          <h1 id="dealer-not-found-title">Дилер не найден.</h1>
          <button className="account-button account-button--inline" type="button" onClick={handleLogout}>
            Вернуться ко входу
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="account-page">
      <section className="account-card account-card--wide dealer-dashboard" aria-labelledby="dealer-title">
        <p className="account-eyebrow">Личный кабинет</p>
        <h1 id="dealer-title">Личный кабинет дилера</h1>
        <p className="dealer-current-name">{dealer.fullName}</p>

        <div className="dealer-dashboard-section">
          <div className="dealer-dashboard-heading">
            <h2>Мои аттестации</h2>
          </div>

          {assignments.length === 0 ? (
            <p className="dealer-empty-state">Нет назначенных аттестаций.</p>
          ) : (
            <div className="dealer-attestation-list">
              {assignments.map((assignment) => {
                const template = getTrainingTemplateById(assignment.trainingTemplateId);
                const gameTitle = template
                  ? getGameDefinition(template.gameType)?.title ?? "Игра"
                  : "Данные аттестации недоступны";

                return (
                  <article className="dealer-attestation-card" key={assignment.id}>
                    <div className="dealer-attestation-card__details">
                      <h3>{gameTitle}</h3>
                      <p>Назначена: {formatDateTime(assignment.createdAt)}</p>
                      <p>Статус: {getAssignmentStatusLabel(assignment.status)}</p>
                    </div>
                    <Link
                      className="account-button dealer-attestation-card__action"
                      href={`/dealer/attestations/${encodeURIComponent(assignment.id)}`}
                    >
                      Открыть
                    </Link>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="account-actions dealer-dashboard-actions">
          <button className="account-link dealer-logout-button" type="button" onClick={handleLogout}>
            Выйти и выбрать другого дилера
          </button>
        </div>
      </section>
    </main>
  );
}