import { Link } from "wouter";

export default function CardsPage() {
  return (
    <main className="roulette-page cards-page">
      <div className="controls-bar" aria-label="Управление карточным столом">
        <button className="grid-toggle-btn spin-btn" type="button" disabled>
          ▶ Старт
        </button>
        <Link className="grid-toggle-btn" href="/">
          ← На главную
        </Link>
        <button className="grid-toggle-btn settings-open-btn" type="button" disabled>
          ⚙ Настройки
        </button>
      </div>

      <div className="table-row cards-table-row">
        <div className="roulette-wrapper cards-table-wrapper">
          <img
            src="/card-table.png"
            alt="Карточный стол"
            className="cards-table-image"
            draggable={false}
          />
        </div>

        <aside className="table-info-sidebar cards-help-sidebar" aria-labelledby="cards-help-title">
          <div id="cards-help-title" className="info-sidebar-title">
            Справка
          </div>
          <div className="cards-help-empty" aria-hidden="true" />
        </aside>
      </div>
    </main>
  );
}