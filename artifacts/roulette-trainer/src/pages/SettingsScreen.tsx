import { useState } from "react";
import { GameSettings, DEFAULT_SETTINGS } from "@/types/gameSettings";

interface Props {
  initialSettings: GameSettings;
  onStart: (settings: GameSettings) => void;
  onOpenRules: () => void;
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
        min="0"
        onKeyDown={(e) => e.key === "-" && e.preventDefault()}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v !== "" && Number(v) < 0 ? "" : v);
        }}
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

function CountSelectField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="settings-field">
      <label className="settings-label">{label}</label>
      <select
        className="settings-select"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        <option value={1}>1</option>
        <option value={2}>2</option>
        <option value={3}>3</option>
      </select>
    </div>
  );
}

export default function SettingsScreen({ initialSettings, onStart, onOpenRules }: Props) {
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
  const [completeDozen, setCompleteDozen] = useState<"yes" | "no">(initialSettings.completeDozen);
  const [completeField, setCompleteField] = useState<"yes" | "no">(initialSettings.completeField);
  const [completeCount, setCompleteCount] = useState(initialSettings.completeCount);
  const [completeMultiplicity, setCompleteMultiplicity] = useState(String(initialSettings.completeMultiplicity));
  const [cashChipValues, setCashChipValues] = useState<Array<"5" | "10" | "25" | "50" | "100" | "500" | "1000" | "5000" | "10000" | "50000">>(
    initialSettings.cashChipValues?.length ? initialSettings.cashChipValues : DEFAULT_SETTINGS.cashChipValues
  );

  function parseNum(val: string, def: number): number {
    const n = Number(val);
    return val.trim() === "" || isNaN(n) ? def : n;
  }

  function handleStart() {
    const raw = parseNum(multiplicity, DEFAULT_SETTINGS.multiplicity);
    const parsedMultiplicity = raw < 10 ? 10 : raw > 1000 ? 1000 : raw;
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
      completeDozen,
      completeField,
      completeCount,
      completeMultiplicity: parseNum(completeMultiplicity, DEFAULT_SETTINGS.completeMultiplicity),
      cashChipValues: cashChipValues.length ? cashChipValues : DEFAULT_SETTINGS.cashChipValues,
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
        <div className="settings-section-title">Серии / Соседи</div>
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
          <div className="settings-field">
            <label className="settings-label">Кратность серии</label>
            <input
              type="number"
              className={`settings-input${multiplicityError ? " settings-input--error" : ""}`}
              value={multiplicity}
              placeholder={String(DEFAULT_SETTINGS.multiplicity)}
              step={10}
              min={10}
              onKeyDown={(e) => e.key === "-" && e.preventDefault()}
              onChange={(e) => {
                const v = e.target.value;
                setMultiplicity(v !== "" && Number(v) < 0 ? "" : v);
                setMultiplicityError(null);
              }}
            />
            {multiplicityError && (
              <div className="settings-field-error">{multiplicityError}</div>
            )}
          </div>
        </div>

        <div className="settings-divider" />
        <div className="settings-section-title">Фишки и касса</div>
        <div className="settings-grid-2">
          <NumField label="Номинал цвета на рулетке" value={chipValue} defaultVal={DEFAULT_SETTINGS.chipValue} onChange={setChipValue} />
          <NumField label="Количество фишек цвета в поле" value={chipsInField} defaultVal={DEFAULT_SETTINGS.chipsInField} onChange={setChipsInField} />
          <NumField label="Сумма кэша на поле" value={cashOnField} defaultVal={DEFAULT_SETTINGS.cashOnField} onChange={setCashOnField} />
          <div className="settings-field" style={{ gridColumn: "1 / -1" }}>
            <label className="settings-label">Номинал кэша на поле</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              {(["5", "10", "25", "50", "100", "500", "1000", "5000", "10000", "50000"] as const).map((val) => {
                const checked = cashChipValues.includes(val);
                return (
                  <label
                    key={val}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      cursor: "pointer",
                      padding: "4px 12px",
                      borderRadius: 4,
                      border: checked ? "1px solid #C9A227" : "1px solid #5a4a2a",
                      background: checked ? "rgba(201,162,39,0.12)" : "transparent",
                      color: checked ? "#C9A227" : "#8a7a5a",
                      fontSize: 13,
                      fontFamily: "inherit",
                      transition: "all 0.15s",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        if (checked) {
                          if (cashChipValues.length > 1) {
                            setCashChipValues(cashChipValues.filter((v) => v !== val));
                          }
                        } else {
                          setCashChipValues([...cashChipValues, val]);
                        }
                      }}
                      style={{ display: "none" }}
                    />
                    {val}
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="settings-divider" />
        <div className="settings-section-title">Комплиты</div>
        <div className="settings-grid-2">
          <SelectField label="Комплит дюжины" value={completeDozen} onChange={setCompleteDozen} />
          <SelectField label="Комплит в поле" value={completeField} onChange={setCompleteField} />
          <CountSelectField label="Количество комплитов сразу" value={completeCount} onChange={setCompleteCount} />
          <NumField
            label="Кратность комплита"
            value={completeMultiplicity}
            defaultVal={DEFAULT_SETTINGS.completeMultiplicity}
            onChange={setCompleteMultiplicity}
          />
        </div>

        <div className="settings-divider" />
        <div className="settings-footer" style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button className="settings-start-btn" onClick={onOpenRules}
            style={{ background: "transparent", border: "1px solid #5a4a2a", color: "#8a7a5a" }}>
            📖 Правила игры
          </button>
          <button className="settings-start-btn" onClick={handleStart}>
            Применить
          </button>
        </div>
      </div>
    </div>
  );
}
