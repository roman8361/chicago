import { Link } from "wouter";

export default function ManagerPage() {
  return (
    <main className="account-page">
      <section className="account-card" aria-labelledby="manager-title">
        <p className="account-eyebrow">Личный кабинет</p>
        <h1 id="manager-title">Кабинет руководителя</h1>
        <p className="account-description">
          Тестовый кабинет руководителя.
        </p>

        <div className="account-actions">
          <Link className="account-button" href="/">
            Открыть рулетку
          </Link>
          <Link className="account-link" href="/login">
            Вернуться к выбору режима
          </Link>
        </div>
      </section>
    </main>
  );
}