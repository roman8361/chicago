import { Link } from "wouter";

export default function HomePage() {
  return (
    <main className="account-page home-page">
      <section className="account-card account-card--wide home-card" aria-labelledby="home-title">
        <p className="account-eyebrow">Dealer Training Platform</p>
        <h1 id="home-title">Платформа для обучения и аттестации дилеров</h1>
        <p className="account-description home-description">
          Тренируйте игровые сценарии, отрабатывайте расчёты ставок
          и проходите аттестации в интерактивном формате.
        </p>

        <div className="home-actions">
          <Link className="home-action-card" href="/roulette">
            <strong>Roulette — тренировка</strong>
            <span>
              Открыть тренировочный стол Roulette, настроить ставки и запустить тренировочный Spin.
            </span>
          </Link>
          <Link className="home-action-card home-action-card--secondary" href="/login">
            <strong>Войти в систему</strong>
            <span>Вход в личный кабинет руководителя или дилера.</span>
          </Link>
        </div>
      </section>
    </main>
  );
}