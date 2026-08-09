import { Link, useLocation } from "wouter";
import { getGameDefinition, type GameType } from "@/data/gameRegistry";
import { useTrainingWizard } from "@/lib/trainingWizardContext";

function getWizardParams() {
  if (typeof window === "undefined") {
    return { gameType: null, dealerId: null };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    gameType: params.get("gameType") as GameType | null,
    dealerId: params.get("dealerId"),
  };
}

export default function SelectDealersPlaceholderPage() {
  const [, navigate] = useLocation();
  const { gameType: urlGameType, dealerId } = getWizardParams();
  const { gameType: storedGameType } = useTrainingWizard();
  const gameType = urlGameType ?? storedGameType;
  const game = gameType ? getGameDefinition(gameType) : undefined;

  if (!game) {
    return (
      <main className="account-page">
        <section className="account-card" aria-labelledby="invalid-wizard-title">
          <h1 id="invalid-wizard-title">Игра не выбрана</h1>
          <Link className="account-button account-button--inline" href="/manager/training/new/game">
            Выбрать игру
          </Link>
        </section>
      </main>
    );
  }

  const settingsParams = new URLSearchParams({
    gameType: game.type,
    ...(dealerId ? { dealerId } : {}),
  }).toString();
  const cancelPath = dealerId
    ? `/manager/dealers/${encodeURIComponent(dealerId)}`
    : "/manager";

  return (
    <main className="account-page">
      <section className="account-card training-wizard-card" aria-labelledby="select-dealers-title">
        <p className="account-eyebrow">Новая тренировка</p>
        <h1 id="select-dealers-title">Выбор дилеров</h1>
        <div className="training-summary">
          <p><strong>Игра:</strong> {game.title}</p>
          <p>Выбор дилеров будет реализован следующим этапом.</p>
        </div>

        <div className="account-actions training-wizard-actions">
          <button
            className="account-button"
            type="button"
            onClick={() => navigate(`/manager/training/new/settings?${settingsParams}`)}
          >
            Назад
          </button>
          <Link className="account-link" href={cancelPath}>
            Отмена
          </Link>
        </div>
      </section>
    </main>
  );
}