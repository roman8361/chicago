import { useState } from "react";
import { getCombinationGame } from "@/poker/combinationCatalog";
import DoubleCombinationsTab from "@/pages/DoubleCombinationsTab";

interface Props {
  gameId: string;
  onBack: () => void;
}

export default function CombinationReferencePage({ gameId, onBack }: Props) {
  const [activeTab, setActiveTab] = useState<"standard" | "double">("standard");
  const game = getCombinationGame(gameId);
  const emptyMessage = game
    ? game.catalog.combinations.length === 0
      ? "Справочник комбинаций пока не заполнен"
      : null
    : "Справочник для этой игры не найден";

  return (
    <main className="settings-page cards-combinations-page">
      <section
        className="settings-card cards-combinations-card"
        aria-labelledby="cards-combinations-title"
        data-testid={`page-combinations-${gameId}`}
      >
        <h1
          id="cards-combinations-title"
          className="settings-title cards-combinations-title"
          data-testid="heading-card-combinations"
        >
          {game?.title ?? "Справочник комбинаций"}
        </h1>

        {gameId === "russian-poker" && (
          <div
            className="cards-combinations-tabs"
            role="tablist"
            aria-label="Справочники русского покера"
          >
            <button
              id="standard-combinations-tab"
              className={`grid-toggle-btn cards-combinations-tab${activeTab === "standard" ? " cards-combinations-tab--active" : ""}`}
              type="button"
              role="tab"
              aria-selected={activeTab === "standard"}
              aria-controls="standard-combinations-panel"
              onClick={() => setActiveTab("standard")}
              data-testid="tab-standard-combinations"
            >
              Комбинации
            </button>
            <button
              id="double-combinations-tab"
              className={`grid-toggle-btn cards-combinations-tab${activeTab === "double" ? " cards-combinations-tab--active" : ""}`}
              type="button"
              role="tab"
              aria-selected={activeTab === "double"}
              aria-controls="double-combinations-tab-panel"
              onClick={() => setActiveTab("double")}
              data-testid="tab-double-combinations"
            >
              Двойные комбинации
            </button>
          </div>
        )}

        <div className="settings-divider" />

        {activeTab === "double" && gameId === "russian-poker" ? (
          <div
            id="double-combinations-tab-panel"
            role="tabpanel"
            aria-labelledby="double-combinations-tab"
          >
            <DoubleCombinationsTab />
          </div>
        ) : (
          <div
            id="standard-combinations-panel"
            className="cards-combinations-empty"
            role="tabpanel"
            aria-labelledby={gameId === "russian-poker" ? "standard-combinations-tab" : "cards-combinations-title"}
            data-testid="status-combination-catalog"
          >
            {emptyMessage && <p role="status">{emptyMessage}</p>}
          </div>
        )}

        <div className="settings-divider" />

        <div className="settings-footer">
          <button
            className="grid-toggle-btn"
            type="button"
            onClick={onBack}
            data-testid="button-back-to-card-settings"
          >
            Назад
          </button>
        </div>
      </section>
    </main>
  );
}
