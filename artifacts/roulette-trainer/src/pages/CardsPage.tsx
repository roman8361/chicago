import { Link } from "wouter";

const DEMO_CARD_CODES = ["c7", "c8", "c9", "c10", "hj", "hq"];

function CardsHand({ cardCodes }: { cardCodes: readonly string[] }) {
  return (
    <div className="cards-hand" aria-label="Демонстрационный ряд карт">
      {cardCodes.map((code) => (
        <img
          key={code}
          className="cards-hand-card"
          src={`/assets/cards/${code}.png`}
          alt={`Карта ${code}`}
          draggable={false}
        />
      ))}
    </div>
  );
}

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
          <CardsHand cardCodes={DEMO_CARD_CODES} />
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