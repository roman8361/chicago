import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { getDealers } from "@/data/dealerStorage";
import { addTrainingAssignment, addTrainingTemplate } from "@/data/attestationStorage";
import RouletteSettingsSummary from "@/components/RouletteSettingsSummary";
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
  const {
    gameType: storedGameType,
    gameConfig,
    dealerIds,
    reset,
  } = useTrainingWizard();
  const [creationError, setCreationError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const gameType = urlGameType ?? storedGameType;
  const game = gameType ? getGameDefinition(gameType) : undefined;
  const dealers = useMemo(() => {
    const selectedIds = new Set(dealerIds);
    return getDealers().filter((dealer) => selectedIds.has(dealer.id));
  }, [dealerIds]);

  const selectGamePath = "/manager/training/new/game?resume=1";
  const settingsPath = game
    ? `/manager/training/new/settings?gameType=${encodeURIComponent(game.type)}`
    : "/manager/training/new/game?resume=1";
  const dealersPath = new URLSearchParams({
    ...(game ? { gameType: game.type } : {}),
    ...(dealerId ? { dealerId } : {}),
  }).toString();

  useEffect(() => {
    if (!gameType || !game) {
      navigate(selectGamePath, { replace: true });
    } else if (!gameConfig) {
      navigate(settingsPath, { replace: true });
    } else if (dealerIds.length === 0) {
      navigate(`/manager/training/new/dealers?${dealersPath}`, { replace: true });
    }
  }, [
    dealerId,
    dealerIds.length,
    dealersPath,
    gameConfig,
    game,
    gameType,
    navigate,
    settingsPath,
  ]);

  if (!game || !gameConfig || dealerIds.length === 0) {
    return (
      <main className="account-page">
        <section className="account-card" aria-labelledby="invalid-review-title">
          <h1 id="invalid-review-title">Проверка аттестации</h1>
          <p className="account-description">Возвращаем вас к незаполненному шагу.</p>
        </section>
      </main>
    );
  }

  function handleCreateAttestation() {
    if (isCreating) return;
    if (!gameType || !gameConfig || dealerIds.length === 0) {
      setCreationError("Не удалось создать аттестацию: заполните игру, настройки и выберите дилеров.");
      return;
    }

    setIsCreating(true);
    setCreationError(null);
    try {
      const template = addTrainingTemplate(gameType, gameConfig);
      dealerIds.forEach((dealerId) => addTrainingAssignment(template.id, dealerId));
      reset();
      navigate(`/manager/attestations/${encodeURIComponent(template.id)}/prepare`);
    } catch {
      setCreationError("Не удалось сохранить аттестацию. Попробуйте ещё раз.");
      setIsCreating(false);
    }
  }

  return (
    <main className="account-page">
      <section className="account-card account-card--wide training-wizard-card" aria-labelledby="training-review-title">
        <p className="account-eyebrow">Новая аттестация</p>
        <h1 id="training-review-title">Новая аттестация</h1>

        <div className="review-section">
          <div className="review-section-header">
            <h2>Игра</h2>
            <button className="review-edit-button" type="button" onClick={() => navigate(selectGamePath)}>
              Изменить
            </button>
          </div>
          <div className="review-section-value">{game.title}</div>
        </div>

        <div className="review-section">
          <div className="review-section-header">
            <h2>Настройки Roulette</h2>
            <button className="review-edit-button" type="button" onClick={() => navigate(settingsPath)}>
              Изменить
            </button>
          </div>
          <RouletteSettingsSummary settings={gameConfig} />
        </div>

        <div className="review-section">
          <div className="review-section-header">
            <h2>Дилеры</h2>
            <button className="review-edit-button" type="button" onClick={() => navigate(`/manager/training/new/dealers?${dealersPath}`)}>
              Изменить
            </button>
          </div>
          <div className="review-dealers-list">
            {dealers.map((dealer) => (
              <div className="review-dealer-name" key={dealer.id}>{dealer.fullName}</div>
            ))}
          </div>
          <p className="review-count">Выбрано: {dealerIds.length}</p>
        </div>

        {creationError && <p className="review-error-message" role="alert">{creationError}</p>}

        <div className="account-actions training-wizard-actions">
          <button
            className="account-button"
            type="button"
            disabled={isCreating}
            onClick={handleCreateAttestation}
          >
            {isCreating ? "Сохранение..." : "Создать аттестацию"}
          </button>
          <button
            className="account-button account-button--secondary"
            type="button"
            onClick={() => navigate(`/manager/training/new/dealers?${dealersPath}`)}
          >
            Назад
          </button>
          <button
            className="account-link"
            type="button"
            onClick={() => {
              reset();
              navigate("/manager");
            }}
          >
            Отмена
          </button>
        </div>
      </section>
    </main>
  );
}