import { useState } from "react";
import { Link, useLocation } from "wouter";
import { getDealers } from "@/data/dealerStorage";
import { setCurrentDealerId } from "@/lib/dealerSession";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const dealers = getDealers();
  const [dealerId, setDealerId] = useState(dealers[0]?.id ?? "");

  function handleDealerLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dealerId) return;
    setCurrentDealerId(dealerId);
    navigate("/dealer");
  }

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
          <form className="dealer-login-form" onSubmit={handleDealerLogin}>
            <label className="dealer-login-label" htmlFor="dealer-login-select">
              Войти как дилер
            </label>
            <select
              id="dealer-login-select"
              className="dealer-form-input"
              value={dealerId}
              onChange={(event) => setDealerId(event.target.value)}
              disabled={dealers.length === 0}
            >
              {dealers.map((dealer) => (
                <option key={dealer.id} value={dealer.id}>
                  {dealer.fullName}
                </option>
              ))}
            </select>
            <button
              className="account-button account-button--secondary"
              type="submit"
              disabled={!dealerId}
            >
              Войти
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}