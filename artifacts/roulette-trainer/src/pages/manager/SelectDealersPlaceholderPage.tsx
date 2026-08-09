import { useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { getDealers } from "@/data/dealerStorage";
import type { Dealer } from "@/data/mockDealers";
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

function getSettingsPath(gameType: GameType, dealerId: string | null) {
  const params = new URLSearchParams({ gameType });
  if (dealerId) params.set("dealerId", dealerId);
  return `/manager/training/new/settings?${params.toString()}`;
}

export default function SelectDealersPlaceholderPage() {
  const [, navigate] = useLocation();
  const { gameType: urlGameType, dealerId: urlDealerId } = getWizardParams();
  const { gameType: storedGameType, dealerIds, sourceDealerId, setDealerIds, initializeDealerSelection } = useTrainingWizard();
  const dealers = useMemo<Dealer[]>(getDealers, []);
  const gameType = urlGameType ?? storedGameType;
  const game = gameType ? getGameDefinition(gameType) : undefined;
  const initialDealerId = sourceDealerId ?? urlDealerId;

  useEffect(() => {
    const availableIds = new Set(dealers.map((dealer) => dealer.id));
    const initialIds = initialDealerId && availableIds.has(initialDealerId)
      ? [initialDealerId]
      : [];
    initializeDealerSelection(initialIds);
  }, [dealers, initialDealerId, initializeDealerSelection]);

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

  const cancelPath = initialDealerId
    ? `/manager/dealers/${encodeURIComponent(initialDealerId)}`
    : "/manager";
  const selectedSet = new Set(dealerIds);

  function toggleDealer(dealerId: string) {
    setDealerIds(
      selectedSet.has(dealerId)
        ? dealerIds.filter((id) => id !== dealerId)
        : [...dealerIds, dealerId],
    );
  }

  function selectAll() {
    setDealerIds(dealers.map((dealer) => dealer.id));
  }

  function clearSelection() {
    setDealerIds([]);
  }

  const reviewParams = new URLSearchParams({ gameType: game.type });
  if (initialDealerId) reviewParams.set("dealerId", initialDealerId);

  if (dealers.length === 0) {
    return (
      <main className="account-page">
        <section className="account-card training-wizard-card" aria-labelledby="empty-dealers-title">
          <p className="account-eyebrow">Новая тренировка</p>
          <h1 id="empty-dealers-title">Выберите дилеров</h1>
          <div className="training-summary">
            <p><strong>Игра:</strong> {game.title}</p>
            <p>Дилеры ещё не добавлены.</p>
            <p>Сначала добавьте дилера.</p>
          </div>
          <div className="account-actions training-wizard-actions">
            <Link className="account-button" href="/manager">
              Перейти к дилерам
            </Link>
            <button
              className="account-button"
              type="button"
              onClick={() => navigate(getSettingsPath(game.type, initialDealerId))}
            >
              Назад
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="account-page">
      <section className="account-card training-wizard-card" aria-labelledby="select-dealers-title">
        <p className="account-eyebrow">Новая тренировка</p>
        <h1 id="select-dealers-title">Выберите дилеров</h1>
        <div className="training-summary">
          <p><strong>Игра:</strong> {game.title}</p>
          <p>Выбрано дилеров: {dealerIds.length}</p>
        </div>

        <div className="dealer-selection-actions">
          <button className="dealer-add-button" type="button" onClick={selectAll}>
            Выбрать всех
          </button>
          <button className="dealer-add-button" type="button" onClick={clearSelection}>
            Снять выбор
          </button>
        </div>

        <div className="dealer-selection-list">
          {dealers.map((dealer) => {
            const checked = selectedSet.has(dealer.id);
            return (
              <label className={`dealer-selection-item${checked ? " dealer-selection-item--selected" : ""}`} key={dealer.id}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleDealer(dealer.id)}
                />
                <span>{dealer.fullName}</span>
              </label>
            );
          })}
        </div>

        <div className="account-actions training-wizard-actions">
          <button
            className="account-button"
            type="button"
            disabled={dealerIds.length === 0}
            onClick={() => navigate(`/manager/training/new/review?${reviewParams.toString()}`)}
          >
            Далее
          </button>
          <button
            className="account-button"
            type="button"
            onClick={() => navigate(getSettingsPath(game.type, initialDealerId))}
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