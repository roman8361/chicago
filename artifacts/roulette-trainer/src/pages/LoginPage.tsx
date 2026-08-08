import { Link } from "wouter";

export default function LoginPage() {
  return (
    <main className="account-page">
      <section className="account-card" aria-labelledby="login-title">
        <p className="account-eyebrow">Roulette Dealer Trainer</p>
        <h1 id="login-title">Dealer Training</h1>
        <p className="account-description">
          Выберите тестовый режим для продолжения.
        </p>

        <div className="account-actions">
          <Link className="account-button" href="/manager">
            Войти как руководитель
          </Link>
          <Link className="account-button account-button--secondary" href="/dealer">
            Войти как дилер
          </Link>
        </div>
      </section>
    </main>
  );
}