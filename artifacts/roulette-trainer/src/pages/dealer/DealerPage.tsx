import { Link } from "wouter";

export default function DealerPage() {
  return (
    <main className="account-page">
      <section className="account-card" aria-labelledby="dealer-title">
        <p className="account-eyebrow">Личный кабинет</p>
        <h1 id="dealer-title">Кабинет дилера</h1>
        <p className="account-description">
          Тестовый кабинет дилера.
        </p>

        <div className="account-actions">
          <Link className="account-button" href="/">
            Открыть тренировку
          </Link>
          <Link className="account-link" href="/login">
            Вернуться к выбору режима
          </Link>
        </div>
      </section>
    </main>
  );
}