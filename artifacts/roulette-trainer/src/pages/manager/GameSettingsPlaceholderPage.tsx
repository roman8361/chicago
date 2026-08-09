import { Link, useLocation } from "wouter";
import { getGameDefinition, type GameType } from "@/data/gameRegistry";

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

export default function GameSettingsPlaceholderPage() {
  const [, navigate] = useLocation();
  const { gameType, dealerId } = getWizardParams();
  const game = gameType ? getGameDefinition(gameType) : undefined;

  if (!game) {
    const selectGamePath = dealerId
      ? `/manager/training/new/game?dealerId=${encodeURIComponent(dealerId)}`
      : "/manager/training/new/game";

    return (
      <main className="account-page">
        <section className="account-card" aria-labelledby="invalid-game-title">
          <p className="account-eyebrow">Новая тренировка</p>
          <h1 id="invalid-game-title">Игра не выбрана</h1>
          <p className="account-description">
            Вернитесь к выбору игры, чтобы продолжить создание тренировки.
          </p>
          <Link className="account-button account-button--inline" href={selectGamePath}>
            Выбрать игру
          </Link>
        </section>
      </main>
    );
  }

  const selectGamePath = dealerId
    ? `/manager/training/new/game?dealerId=${encodeURIComponent(dealerId)}`
    : "/manager/training/new/game";

  const cancelPath = dealerId
    ? `/manager/dealers/${encodeURIComponent(dealerId)}`
    : "/manager";

  return (
    <main className="account-page">
      <section className="account-card training-wizard-card" aria-labelledby="game-settings-title">
        <p className="account-eyebrow">Новая тренировка</p>
        <h1 id="game-settings-title">Настройки {game.title}</h1>
        <div className="training-summary">
          <p><strong>Игра:</strong> {game.title}</p>
          <p>Настройки будут добавлены следующим этапом.</p>
        </div>

        <div className="account-actions training-wizard-actions">
          <button className="account-button" type="button" onClick={() => navigate(selectGamePath)}>
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