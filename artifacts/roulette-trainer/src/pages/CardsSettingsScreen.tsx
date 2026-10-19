import { useState } from "react";
import type { CardTableSettings } from "@/types/cardTableSettings";
import type { CombinationGameId } from "@/poker/combinationCatalog";
import {
  getDoubleCombinationCatalog,
  getUniqueCardDeals,
} from "@/poker/games/russian-poker/doubleCombinationCatalog";

interface Props {
  initialSettings: CardTableSettings;
  onSave: (settings: CardTableSettings) => void;
  onBack: () => void;
  onViewCombinations: (gameId: CombinationGameId) => void;
}

export default function CardsSettingsScreen({
  initialSettings,
  onSave,
  onBack,
  onViewCombinations,
}: Props) {
  const catalog = getDoubleCombinationCatalog();
  const availableGroups = catalog.groups.map((group) => ({
    ...group,
    uniqueDealCount: getUniqueCardDeals(group.deals).length,
  }));
  const [russianPokerEnabled, setRussianPokerEnabled] = useState(
    initialSettings.pokerGames.russianPoker.enabled,
  );
  const [dealCount, setDealCount] = useState(
    String(initialSettings.pokerGames.russianPoker.dealCount),
  );
  const [selectedGroupIds, setSelectedGroupIds] = useState(
    initialSettings.pokerGames.russianPoker.selectedGroupIds,
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const unknownGroupIds = selectedGroupIds.filter(
    (groupId) => !catalog.groups.some((group) => group.id === groupId),
  );

  function handleSave() {
    if (russianPokerEnabled && catalog.fatalError) {
      setValidationError(catalog.fatalError);
      return;
    }

    if (!/^\d+$/.test(dealCount) || Number(dealCount) < 1 || Number(dealCount) > 100) {
      setValidationError("Количество раздач должно быть целым числом от 1 до 100.");
      return;
    }

    if (russianPokerEnabled && selectedGroupIds.length === 0) {
      setValidationError("Выберите хотя бы одну группу комбинаций");
      return;
    }

    if (russianPokerEnabled && unknownGroupIds.length > 0) {
      setValidationError("В сохранённых настройках есть группы, которых нет в справочнике. Нажмите «Снять все» и выберите группы заново.");
      return;
    }

    const unavailableSelectedGroups = russianPokerEnabled
      ? selectedGroupIds
        .map((groupId) => catalog.groups.find((group) => group.id === groupId))
        .filter((group) => !group || getUniqueCardDeals(group.deals).length === 0)
      : [];
    if (unavailableSelectedGroups.length > 0) {
      setValidationError("Каждая выбранная группа должна содержать корректные раздачи.");
      return;
    }

    setValidationError(null);
    onSave({
      ...initialSettings,
      pokerGames: {
        ...initialSettings.pokerGames,
        russianPoker: {
          ...initialSettings.pokerGames.russianPoker,
          enabled: russianPokerEnabled,
          dealCount: Number(dealCount),
          selectedGroupIds: [...new Set(selectedGroupIds)],
        },
      },
    });
  }

  return (
    <div className="settings-page cards-settings-page">
      <div className="settings-card">
        <div className="settings-title">
          <span className="settings-title-ornament">✦</span>
          Настройки карточного стола
          <span className="settings-title-ornament">✦</span>
        </div>

        <div className="settings-divider" />
        <div className="settings-section-title">Русский покер</div>
        <label className="cards-poker-checkbox">
          <input
            type="checkbox"
            checked={russianPokerEnabled}
            onChange={(event) => setRussianPokerEnabled(event.target.checked)}
          />
          <span>Русский покер</span>
        </label>
        <p className="cards-settings-description">
          Подготовить карточный стол для раздач русского покера.
        </p>

        <div className="cards-russian-poker-settings">
          <label className="settings-label" htmlFor="russian-poker-deal-count">
            Количество раздач
          </label>
          <input
            id="russian-poker-deal-count"
            className="settings-input cards-deal-count-input"
            type="number"
            min={1}
            max={100}
            step={1}
            inputMode="numeric"
            value={dealCount}
            onChange={(event) => {
              setDealCount(event.target.value);
              setValidationError(null);
            }}
            aria-invalid={Boolean(validationError)}
            aria-describedby={validationError ? "cards-settings-error" : undefined}
          />
        </div>

        <div className="cards-combination-group-settings">
          <div className="cards-combination-group-heading">
            <span className="settings-label">Группы комбинаций</span>
            <div className="cards-combination-group-actions">
              <button
                className="cards-text-action"
                type="button"
                onClick={() => {
                  setSelectedGroupIds(
                    availableGroups
                      .filter((group) => group.uniqueDealCount > 0)
                      .map((group) => group.id),
                  );
                  setValidationError(null);
                }}
                disabled={Boolean(catalog.fatalError)}
              >
                Выбрать все
              </button>
              <button
                className="cards-text-action"
                type="button"
                onClick={() => {
                  setSelectedGroupIds([]);
                  setValidationError(null);
                }}
              >
                Снять все
              </button>
            </div>
          </div>

          {catalog.fatalError ? (
            <p className="cards-catalog-error" role="alert">{catalog.fatalError}</p>
          ) : (
            <div className="cards-combination-group-list">
              {availableGroups.map((group) => {
                const unavailable = group.uniqueDealCount === 0;
                return (
                  <label
                    key={group.id}
                    className={`cards-combination-group-option${unavailable ? " cards-combination-group-option--unavailable" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedGroupIds.includes(group.id)}
                      disabled={unavailable}
                      onChange={(event) => {
                        setSelectedGroupIds((current) => (
                          event.target.checked
                            ? [...new Set([...current, group.id])]
                            : current.filter((id) => id !== group.id)
                        ));
                        setValidationError(null);
                      }}
                    />
                    <span className="cards-combination-group-name">{group.name}</span>
                    <span className="cards-combination-group-count">
                      {unavailable ? "Нет корректных раздач" : `${group.uniqueDealCount} раздач`}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {catalog.errors.length > 0 && !catalog.fatalError && (
          <details className="cards-catalog-warnings">
            <summary>Ошибки данных справочника: {catalog.errors.length}</summary>
            <ul>
              {catalog.errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}
            </ul>
          </details>
        )}

        {validationError && (
          <p id="cards-settings-error" className="cards-catalog-error" role="alert">
            {validationError}
          </p>
        )}

        <div className="cards-combinations-row">
          <span data-testid="text-combinations-label">Комбинации</span>
          <button
            className="grid-toggle-btn cards-combinations-button"
            type="button"
            onClick={() => onViewCombinations("russian-poker")}
            data-testid="button-view-russian-poker-combinations"
            aria-label="Посмотреть комбинации русского покера"
          >
            Посмотреть
          </button>
        </div>

        <div className="settings-divider" />
        <div className="settings-footer cards-settings-footer">
          <button
            className="settings-start-btn"
            type="button"
            onClick={handleSave}
          >
            Сохранить
          </button>
          <button
            className="settings-start-btn"
            type="button"
            onClick={onBack}
            style={{ background: "transparent", border: "1px solid #5a4a2a", color: "#8a7a5a" }}
          >
            Назад
          </button>
        </div>
      </div>
    </div>
  );
}