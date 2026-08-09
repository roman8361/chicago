import { useRoute, Link } from "wouter";
import { getDealers } from "@/data/dealerStorage";
import { getTrainingsByDealerId } from "@/data/trainingStorage";

export default function DealerDetailsPage() {
  const [, params] = useRoute("/manager/dealers/:dealerId");
  const dealerId = params?.dealerId;
  const dealer = dealerId
    ? getDealers().find((candidate) => candidate.id === dealerId)
    : undefined;
  const trainings = dealerId ? getTrainingsByDealerId(dealerId) : [];

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

  return (
    <main className="account-page">
      <section className="account-card" aria-labelledby="dealer-details-title">
        <p className="account-eyebrow">Дилер</p>
        <h1 id="dealer-details-title">{dealer.fullName}</h1>
        <p className="dealer-training-count">Тренировок: {trainings.length}</p>

        <div className="account-actions">
          <Link
            className="account-button"
            href={`/manager/dealers/${encodeURIComponent(dealer.id)}/training/new`}
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
                <strong>{training.gameType === "ROULETTE" ? "Roulette" : training.gameType}</strong>
                <span>Статус: {training.status}</span>
                <span>{new Date(training.createdAt).toLocaleDateString("ru-RU")}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}