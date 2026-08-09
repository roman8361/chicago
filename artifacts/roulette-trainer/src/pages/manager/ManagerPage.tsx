import { Link } from "wouter";

export default function ManagerPage() {
  return (
    <main className="account-page">
      <section className="account-card" aria-labelledby="manager-title">
        <p className="account-eyebrow">Личный кабинет</p>
        <h1 id="manager-title">Личный кабинет руководителя</h1>

        <div className="manager-primary-actions" aria-label="Основные действия">
          <Link className="account-button manager-primary-action" href="/manager/dealers">
            Добавить дилера
          </Link>
          <Link className="account-button manager-primary-action" href="/manager/training/new/game">
            Создать аттестацию
          </Link>
        </div>

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