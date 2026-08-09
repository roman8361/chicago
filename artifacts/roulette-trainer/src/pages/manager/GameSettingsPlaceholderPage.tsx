import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { getGameDefinition, type GameType } from "@/data/gameRegistry";
import { RouletteSettingsForm } from "@/pages/SettingsScreen";
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

function getSelectGamePath(dealerId: string | null) {
  return dealerId
    ? `/manager/training/new/game?dealerId=${encodeURIComponent(dealerId)}&resume=1`
    : "/manager/training/new/game?resume=1";
}

export default function GameSettingsPage() {
  const [, navigate] = useLocation();
  const { gameType: urlGameType, dealerId } = getWizardParams();
  const { gameType: storedGameType, gameConfig, setGameType, setGameConfig } = useTrainingWizard();
  const gameType = urlGameType ?? storedGameType;
  const game = gameType ? getGameDefinition(gameType) : undefined;

  useEffect(() => {
    if (urlGameType && game) setGameType(urlGameType);
  }, [urlGameType, game, setGameType]);

  if (!game || game.type !== "ROULETTE") {
    const selectGamePath = getSelectGamePath(dealerId);
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

  const selectGamePath = getSelectGamePath(dealerId);
  const cancelPath = dealerId
    ? `/manager/dealers/${encodeURIComponent(dealerId)}`
    : "/manager";
  const dealersPath = new URLSearchParams({
    gameType: game.type,
    ...(dealerId ? { dealerId } : {}),
  }).toString();

  return (
    <RouletteSettingsForm
      initialSettings={gameConfig}
      onChange={setGameConfig}
      title="Настройки Roulette"
      submitLabel="Далее"
      onStart={(settings) => {
        setGameConfig(settings);
        navigate(`/manager/training/new/dealers?${dealersPath}`);
      }}
      onBack={() => navigate(selectGamePath)}
      onCancel={() => navigate(cancelPath)}
      header={
        <div className="training-summary">
          <p><strong>Игра:</strong> {game.title}</p>
        </div>
      }
    />
  );
}