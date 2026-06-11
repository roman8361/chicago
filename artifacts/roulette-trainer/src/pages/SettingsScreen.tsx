import { useState } from "react";
import { GameSettings, DEFAULT_SETTINGS } from "@/types/gameSettings";

interface Props {
  initialSettings: GameSettings;
  onStart: (settings: GameSettings) => void;
}

function NumField({
  label,
  value,
  defaultVal,
  onChange,
}: {
  label: string;
  value: string;
  defaultVal: number;
  onChange: (v: string) => void;
}) {
  return (
    <div className="settings-field">
      <label className="settings-label">{label}</label>
      <input
        type="number"
        className="settings-input"
        value={value}
        placeholder={String(defaultVal)}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: "yes" | "no";
  onChange: (v: "yes" | "no") => void;
}) {
  return (
    <div className="settings-field">
      <label className="settings-label">{label}</label>
      <select
        className="settings-select"
        value={value}
        onChange={(e) => onChange(e.target.value as "yes" | "no")}
      >
        <option value="no">Нет</option>
        <option value="yes">Да</option>
      </select>
    </div>
  );
}

export default function SettingsScreen({ initialSettings, onStart }: Props) {
  const [minBet, setMinBet] = useState(String(initialSettings.minBet));
  const [maxBet, setMaxBet] = useState(String(initialSettings.maxBet));
  const [neighborsCount, setNeighborsCount] = useState(String(initialSettings.neighborsCount));
  const [bet58, setBet58] = useState<"yes" | "no">(initialSettings.bet58);
  const [betOrphelins, setBetOrphelins] = useState<"yes" | "no">(initialSettings.betOrphelins);
  const [betSeria023, setBetSeria023] = useState<"yes" | "no">(initialSettings.betSeria023);
  const [betZeroSpiel, setBetZeroSpiel] = useState<"yes" | "no">(initialSettings.betZeroSpiel);
  const [chipValue, setChipValue] = useState(String(initialSettings.chipValue));
  const [chipsInField, setChipsInField] = useState(String(initialSettings.chipsInField));
  const [cashOnField, setCashOnField] = useState(String(initialSettings.cashOnField));
  const [multiplicity, setMultiplicity] = useState(String(initialSettings.multiplicity));
  const [multiplicityError, setMultiplicityError] = useState<string | null>(null);

  function parseNum(val: string, def: number): number {
    const n = Number(val);
    return val.trim() === "" || isNaN(n) ? def : n;
  }

  function handleStart() {
    const parsedMultiplicity = parseNum(multiplicity, DEFAULT_SETTINGS.multiplicity);
    if (parsedMultiplicity <= 0 || parsedMultiplicity % 10 !== 0) {
      setMultiplicityError("Кратность должна быть кратна 10 (например: 10, 20, 50, 100)");
      return;
    }
    setMultiplicityError(null);
    const settings: GameSettings = {
      minBet: parseNum(minBet, DEFAULT_SETTINGS.minBet),
      maxBet: parseNum(maxBet, DEFAULT_SETTINGS.maxBet),
      neighborsCount: parseNum(neighborsCount, DEFAULT_SETTINGS.neighborsCount),
      bet58,
      betOrphelins,
      betSeria023,
      betZeroSpiel,
      chipValue: parseNum(chipValue, DEFAULT_SETTINGS.chipValue),
      chipsInField: parseNum(chipsInField, DEFAULT_SETTINGS.chipsInField),
      cashOnField: parseNum(cashOnField, DEFAULT_SETTINGS.cashOnField),
      multiplicity: parsedMultiplicity,
    };
    onStart(settings);
  }

  return (
    <div className="settings-page">
      <div className="settings-card">
        <div className="settings-title">
          <span className="settings-title-ornament">✦</span>
          Настройки игры
          <span className="settings-title-ornament">✦</span>
        </div>
        <div className="settings-divider" />

        <div className="settings-section-title">Лимиты рулетки</div>
        <div className="settings-grid-2">
          <NumField label="Минимум рулетки" value={minBet} defaultVal={DEFAULT_SETTINGS.minBet} onChange={setMinBet} />
          <NumField label="Максимум рулетки" value={maxBet} defaultVal={DEFAULT_SETTINGS.maxBet} onChange={setMaxBet} />
        </div>

        <div className="settings-divider" />
        <div className="settings-section-title">Специальные ставки</div>
        <div className="settings-grid-2">
          <NumField
            label='Количество ставок "Соседи номера"'
            value={neighborsCount}
            defaultVal={DEFAULT_SETTINGS.neighborsCount}
            onChange={setNeighborsCount}
          />
          <SelectField label='Ставка на "5/8"' value={bet58} onChange={setBet58} />
          <SelectField label='Ставка на "Orphelins"' value={betOrphelins} onChange={setBetOrphelins} />
          <SelectField label='Ставка на "Seria 0/2/3"' value={betSeria023} onChange={setBetSeria023} />
          <SelectField label='Ставка на "Zero Spiel"' value={betZeroSpiel} onChange={setBetZeroSpiel} />
        </div>

        <div className="settings-divider" />
        <div className="settings-section-title">Фишки и касса</div>
        <div className="settings-grid-2">
          <NumField label="Номинал цвета на рулетке" value={chipValue} defaultVal={DEFAULT_SETTINGS.chipValue} onChange={setChipValue} />
          <NumField label="Количество фишек цвета в поле" value={chipsInField} defaultVal={DEFAULT_SETTINGS.chipsInField} onChange={setChipsInField} />
          <NumField label="Сумма кэша на поле" value={cashOnField} defaultVal={DEFAULT_SETTINGS.cashOnField} onChange={setCashOnField} />
        </div>

        <div className="settings-divider" />
        <div className="settings-section-title">Кратность</div>
        <div className="settings-grid-2">
          <div className="settings-field">
            <label className="settings-label">Кратность (кратно 10)</label>
            <input
              type="number"
              className={`settings-input${multiplicityError ? " settings-input--error" : ""}`}
              value={multiplicity}
              placeholder={String(DEFAULT_SETTINGS.multiplicity)}
              step={10}
              min={10}
              onChange={(e) => {
                setMultiplicity(e.target.value);
                setMultiplicityError(null);
              }}
            />
            {multiplicityError && (
              <div className="settings-field-error">{multiplicityError}</div>
            )}
          </div>
        </div>

        <div className="settings-divider" />
        <div className="settings-footer">
          <button className="settings-start-btn" onClick={handleStart}>
            Применить
          </button>
        </div>
      </div>
    </div>
  );
}
