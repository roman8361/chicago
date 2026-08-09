import { Link } from "wouter";
import { MOCK_DEALERS } from "@/data/mockDealers";

export default function ManagerPage() {
  return (
    <main className="account-page">
      <section className="account-card" aria-labelledby="manager-title">
        <p className="account-eyebrow">Личный кабинет</p>
        <h1 id="manager-title">Личный кабинет руководителя</h1>

        <div className="dealer-section" aria-labelledby="dealer-list-title">
          <div className="dealer-section-header">
            <h2 id="dealer-list-title">Дилеры</h2>
            <button className="dealer-add-button" type="button" disabled>
              + Добавить дилера
            </button>
          </div>

          <div className="dealer-list">
            {MOCK_DEALERS.map((dealer) => (
              <div className="dealer-list-item" key={dealer.id}>
                <span className="dealer-list-item-name">{dealer.fullName}</span>
              </div>
            ))}
          </div>
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