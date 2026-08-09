import { useState } from "react";
import { useRoute, Link } from "wouter";
import { getDealers } from "@/data/dealerStorage";
import { deleteTraining, getTrainingsByDealerId } from "@/data/trainingStorage";
import type { Training } from "@/types/training";

export default function DealerDetailsPage() {
  const [, params] = useRoute("/manager/dealers/:dealerId");
  const dealerId = params?.dealerId;
  const dealer = dealerId
    ? getDealers().find((candidate) => candidate.id === dealerId)
    : undefined;
  const [trainings, setTrainings] = useState<Training[]>(() =>
    dealerId ? getTrainingsByDealerId(dealerId) : [],
  );
  const [trainingToDelete, setTrainingToDelete] = useState<string | null>(null);

  if (!dealer) {
    return (
      <main className="account-page">
        <section className="account-card" aria-labelledby="dealer-not-found-title">
          <h1 id="dealer-not-found-title">Дилер не найден</h1>
          <Link className="account-button account-button--inline" href="/manager">
            Вернуться к списку
          </Link>
        </section>
      </main>
    );
  }

  function confirmDeleteTraining() {
    if (!trainingToDelete) return;
    deleteTraining(trainingToDelete);
    setTrainings((current) => current.filter((training) => training.id !== trainingToDelete));
    setTrainingToDelete(null);
  }

  return (
    <main className="account-page">
      <section className="account-card" aria-labelledby="dealer-details-title">
        <p className="account-eyebrow">Дилер</p>
        <h1 id="dealer-details-title">{dealer.fullName}</h1>
        <p className="dealer-training-count">Тренировок: {trainings.length}</p>

        <div className="account-actions">
          <Link
            className="account-button"
            href={`/manager/training/new/game?dealerId=${encodeURIComponent(dealer.id)}&new=1`}
          >
            Создать тренировку
          </Link>
          <Link className="account-link" href="/manager">
            Назад к списку дилеров
          </Link>
        </div>

        {trainings.length > 0 && (
          <div className="training-list" aria-labelledby="training-list-title">
            <h2 id="training-list-title">Тренировки</h2>
            {trainings.map((training) => (
              <div className="training-list-item" key={training.id}>
                <div className="training-list-item-details">
                  <strong>{training.gameType === "ROULETTE" ? "Roulette" : training.gameType}</strong>
                  <span>Статус: {training.status === "CREATED" ? "Создана" : training.status}</span>
                  <span>{new Date(training.createdAt).toLocaleDateString("ru-RU")}</span>
                </div>
                <button
                  className="training-delete-button"
                  type="button"
                  onClick={() => setTrainingToDelete(training.id)}
                >
                  Удалить
                </button>
              </div>
            ))}
          </div>
        )}

        {trainingToDelete && (
          <div className="training-delete-confirmation" role="alertdialog" aria-modal="true">
            <h2>Удалить тренировку?</h2>
            <p>Это действие нельзя отменить.</p>
            <div className="training-delete-actions">
              <button className="training-delete-button training-delete-button--confirm" type="button" onClick={confirmDeleteTraining}>
                Удалить
              </button>
              <button className="account-link dealer-cancel-button" type="button" onClick={() => setTrainingToDelete(null)}>
                Отмена
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}