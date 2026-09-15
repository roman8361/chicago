import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "wouter";
import CardsSettingsScreen from "@/pages/CardsSettingsScreen";
import { loadCardTableSettings, saveCardTableSettings } from "@/data/cardTableSettingsStorage";
import type { CardTableSettings, PokerGameId } from "@/types/cardTableSettings";

const DEMO_CARD_CODES = ["c7", "c8", "c9", "c10", "hj", "hq"];
const FLIP_DURATION_MS = 420;
const FLIP_STAGGER_MS = 70;

type CardsRoundState = "HIDDEN" | "CLOSED" | "FLIPPING" | "OPEN";

interface CardsRuntimeState {
  settings: CardTableSettings;
  roundState: CardsRoundState;
  activePokerGame: PokerGameId | null;
}

function getConfiguredPokerGame(settings: CardTableSettings): PokerGameId | null {
  const configuredGames: Array<[PokerGameId, { enabled: boolean }]> = [
    ["russianPoker", settings.pokerGames.russianPoker],
  ];
  return configuredGames.find(([, game]) => game.enabled)?.[0] ?? null;
}

function CardsHand({
  cardCodes,
  roundState,
}: {
  cardCodes: readonly string[];
  roundState: Exclude<CardsRoundState, "HIDDEN">;
}) {
  return (
    <div className="cards-hand" aria-label="Демонстрационный ряд карт">
      {cardCodes.map((code, index) => (
        <div
          key={code}
          className="cards-hand-card-slot"
        >
          <div
            className={`cards-hand-card-flip cards-hand-card-flip--${roundState.toLowerCase()}`}
            style={{ "--cards-flip-delay": `${index * FLIP_STAGGER_MS}ms` } as CSSProperties}
          >
            <img
              className="cards-hand-card-face cards-hand-card-face--back"
              src="/assets/cards/back.png"
              alt=""
              aria-hidden="true"
              draggable={false}
            />
            <img
              className="cards-hand-card-face cards-hand-card-face--front"
              src={`/assets/cards/${code}.png`}
              alt={`Карта ${code}`}
              draggable={false}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CardsPage() {
  const [runtime, setRuntime] = useState<CardsRuntimeState>(() => {
    const settings = loadCardTableSettings();
    const configuredPokerGame = getConfiguredPokerGame(settings);
    return {
      settings,
      roundState: configuredPokerGame ? "CLOSED" : "HIDDEN",
      activePokerGame: configuredPokerGame,
    };
  });
  const [screen, setScreen] = useState<"table" | "settings">("table");

  useEffect(() => {
    if (runtime.roundState !== "FLIPPING") return;

    const flipTimer = window.setTimeout(() => {
      setRuntime((current) => (
        current.roundState === "FLIPPING"
          ? { ...current, roundState: "OPEN" }
          : current
      ));
    }, FLIP_DURATION_MS + FLIP_STAGGER_MS * (DEMO_CARD_CODES.length - 1));

    return () => window.clearTimeout(flipTimer);
  }, [runtime.roundState]);

  function handleSettingsSave(nextSettings: CardTableSettings) {
    saveCardTableSettings(nextSettings);
    const configuredPokerGame = getConfiguredPokerGame(nextSettings);
    setRuntime({
      settings: nextSettings,
      roundState: configuredPokerGame ? "CLOSED" : "HIDDEN",
      activePokerGame: configuredPokerGame,
    });
    setScreen("table");
  }

  function handleStart() {
    const configuredPokerGame = getConfiguredPokerGame(runtime.settings);
    if (!configuredPokerGame) {
      setRuntime((current) => ({
        ...current,
        roundState: "HIDDEN",
        activePokerGame: null,
      }));
      return;
    }

    setRuntime((current) => ({
      ...current,
      roundState: "FLIPPING",
      activePokerGame: configuredPokerGame,
    }));
  }

  if (screen === "settings") {
    return (
      <CardsSettingsScreen
        initialSettings={runtime.settings}
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
          {runtime.activePokerGame === "russianPoker" && runtime.roundState !== "HIDDEN" && (
            <CardsHand
              cardCodes={DEMO_CARD_CODES}
              roundState={runtime.roundState}
            />
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