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

export default function TrainingReviewPage() {
  const [, navigate] = useLocation();
  const { gameType: urlGameType, dealerId } = getWizardParams();
  const { gameType: storedGameType, dealerIds } = useTrainingWizard();
  const gameType = urlGameType ?? storedGameType;
  const game = gameType ? getGameDefinition(gameType) : undefined;

  if (!game) {
    return (
      <main className="account-page">
        <section className="account-card" aria-labelledby="invalid-review-title">
          <h1 id="invalid-review-title">Игра не выбрана</h1>
          <Link className="account-button account-button--inline" href="/manager/training/new/game">
            Выбрать игру
          </Link>
        </section>
      </main>
    );
  }

  const dealersPath = new URLSearchParams({
    gameType: game.type,
    ...(dealerId ? { dealerId } : {}),
  }).toString();

  return (
    <main className="account-page">
      <section className="account-card training-wizard-card" aria-labelledby="training-review-title">
        <p className="account-eyebrow">Новая тренировка</p>
        <h1 id="training-review-title">Проверка тренировки</h1>
        <div className="training-summary">
          <p><strong>Игра:</strong> {game.title}</p>
          <p><strong>Выбрано дилеров:</strong> {dealerIds.length}</p>
        </div>
        <button
          className="account-button account-button--inline"
          type="button"
          onClick={() => navigate(`/manager/training/new/dealers?${dealersPath}`)}
        >
          Назад
        </button>
      </section>
    </main>
  );
}