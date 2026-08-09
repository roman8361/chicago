import { useRoute, Link } from "wouter";
import { getDealers } from "@/data/dealerStorage";

export default function DealerDetailsPage() {
  const [, params] = useRoute("/manager/dealers/:dealerId");
  const dealerId = params?.dealerId;
  const dealer = dealerId
    ? getDealers().find((candidate) => candidate.id === dealerId)
    : undefined;

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
        <p className="dealer-training-count">Тренировок: 0</p>

        <div className="account-actions">
          <button className="account-button" type="button" disabled>
            Создать тренировку
          </button>
          <Link className="account-link" href="/manager">
            Назад к списку дилеров
          </Link>
        </div>
      </section>
    </main>
  );
}