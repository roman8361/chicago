import { useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { GAME_REGISTRY, type GameType } from "@/data/gameRegistry";
import { useTrainingWizard } from "@/lib/trainingWizardContext";

function getContext() {
  if (typeof window === "undefined") {
    return { dealerId: null };
  }

  return {
    dealerId: new URLSearchParams(window.location.search).get("dealerId"),
    isResume: new URLSearchParams(window.location.search).get("resume") === "1",
  };
}

export default function SelectGamePage() {
  const [, navigate] = useLocation();
  const { dealerId, isResume } = useMemo(getContext, []);
  const { gameType: selectedGame, setGameType, startNew } = useTrainingWizard();

  useEffect(() => {
    if (!isResume) startNew(dealerId);
  }, [dealerId, isResume, startNew]);

  function handleNext() {
    if (!selectedGame) return;
    const params = new URLSearchParams({ gameType: selectedGame });
    if (dealerId) params.set("dealerId", dealerId);
    navigate(`/manager/training/new/settings?${params.toString()}`);
  }

  const cancelPath = dealerId
    ? `/manager/dealers/${encodeURIComponent(dealerId)}`
    : "/manager";

  return (
    <main className="account-page">
      <section className="account-card training-wizard-card" aria-labelledby="select-game-title">
        <p className="account-eyebrow">Новая тренировка</p>
        <h1 id="select-game-title">Выберите игру</h1>
        <p className="account-description">
          Сначала выберите одну игру для этой тренировки.
        </p>

        <div className="game-selection-list" role="radiogroup" aria-label="Доступные игры">
          {GAME_REGISTRY.filter((game) => game.enabled).map((game) => {
            const isSelected = selectedGame === game.type;
            return (
              <label
                className={`game-selection-card${isSelected ? " game-selection-card--selected" : ""}`}
                key={game.type}
              >
                <input
                  type="radio"
                  name="gameType"
                  value={game.type}
                  checked={isSelected}
                  onChange={() => setGameType(game.type as GameType)}
                />
                <span className="game-selection-radio" aria-hidden="true">
                  {isSelected ? "●" : "○"}
                </span>
                <span className="game-selection-title">{game.title}</span>
              </label>
            );
          })}
        </div>

        <div className="account-actions training-wizard-actions">
          <button
            className="account-button"
            type="button"
            disabled={!selectedGame}
            onClick={handleNext}
          >
            Далее
          </button>
          <Link className="account-link" href={cancelPath}>
            Отмена
          </Link>
        </div>
      </section>
    </main>
  );
}