import { useState } from "react";
import { Link } from "wouter";
import CardsSettingsScreen from "@/pages/CardsSettingsScreen";
import { loadCardTableSettings, saveCardTableSettings } from "@/data/cardTableSettingsStorage";
import type { CardTableSettings, PokerGameId } from "@/types/cardTableSettings";

const DEMO_CARD_CODES = ["c7", "c8", "c9", "c10", "hj", "hq"];

function getConfiguredPokerGame(settings: CardTableSettings): PokerGameId | null {
  const configuredGames: Array<[PokerGameId, { enabled: boolean }]> = [
    ["russianPoker", settings.pokerGames.russianPoker],
  ];
  return configuredGames.find(([, game]) => game.enabled)?.[0] ?? null;
}

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
  const [settings, setSettings] = useState<CardTableSettings>(loadCardTableSettings);
  const [screen, setScreen] = useState<"table" | "settings">("table");
  const [roundStarted, setRoundStarted] = useState(false);
  const [startedPokerGame, setStartedPokerGame] = useState<PokerGameId | null>(null);

  function handleSettingsSave(nextSettings: CardTableSettings) {
    saveCardTableSettings(nextSettings);
    setSettings(nextSettings);
    setRoundStarted(false);
    setStartedPokerGame(null);
    setScreen("table");
  }

  function handleStart() {
    const configuredPokerGame = getConfiguredPokerGame(settings);
    setStartedPokerGame(configuredPokerGame);
    setRoundStarted(configuredPokerGame !== null);
  }

  if (screen === "settings") {
    return (
      <CardsSettingsScreen
        initialSettings={settings}
        onSave={handleSettingsSave}
        onBack={() => setScreen("table")}
      />
    );
  }

  return (
    <main className="roulette-page cards-page">
      <div className="controls-bar" aria-label="Управление карточным столом">
        <button className="grid-toggle-btn spin-btn" type="button" onClick={handleStart}>
          ▶ Старт
        </button>
        <Link className="grid-toggle-btn" href="/">
          ← На главную
        </Link>
        <button
          className="grid-toggle-btn settings-open-btn"
          type="button"
          onClick={() => setScreen("settings")}
        >
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
          {roundStarted && startedPokerGame === "russianPoker" && (
            <CardsHand cardCodes={DEMO_CARD_CODES} />
          )}
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