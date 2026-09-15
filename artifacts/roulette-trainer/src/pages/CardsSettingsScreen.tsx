import { useState } from "react";
import type { CardTableSettings } from "@/types/cardTableSettings";

interface Props {
  initialSettings: CardTableSettings;
  onSave: (settings: CardTableSettings) => void;
  onBack: () => void;
}

export default function CardsSettingsScreen({ initialSettings, onSave, onBack }: Props) {
  const [russianPokerEnabled, setRussianPokerEnabled] = useState(
    initialSettings.pokerGames.russianPoker.enabled,
  );

  function handleSave() {
    onSave({
      ...initialSettings,
      pokerGames: {
        ...initialSettings.pokerGames,
        russianPoker: {
          ...initialSettings.pokerGames.russianPoker,
          enabled: russianPokerEnabled,
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
          Показывать ряд из шести карт русского покера на карточном столе.
        </p>

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