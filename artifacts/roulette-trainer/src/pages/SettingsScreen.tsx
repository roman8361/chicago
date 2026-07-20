import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
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
  const [completeDozen, setCompleteDozen] = useState<"yes" | "no">(initialSettings.completeDozen);
  const [completeField, setCompleteField] = useState<"yes" | "no">(initialSettings.completeField);
  const [completeCount, setCompleteCount] = useState(initialSettings.completeCount);
  const [completeMultiplicity, setCompleteMultiplicity] = useState(String(initialSettings.completeMultiplicity));
  const [neighboursMultiplicity, setNeighboursMultiplicity] = useState(String(initialSettings.neighboursMultiplicity ?? DEFAULT_SETTINGS.neighboursMultiplicity));
  const [colorNumbersCount, setColorNumbersCount] = useState(String(initialSettings.colorNumbersCount ?? DEFAULT_SETTINGS.colorNumbersCount));
  const [cashChipValues, setCashChipValues] = useState<Array<"5" | "10" | "25" | "50" | "100" | "500" | "1000" | "5000" | "10000" | "50000">>(() => {
    const raw = initialSettings.cashChipValues?.length ? initialSettings.cashChipValues : DEFAULT_SETTINGS.cashChipValues;
    // Normalise: deduplicate preserving order, then keep the last 2 (most recently chosen)
    const unique = raw.filter((v, i, a) => a.lastIndexOf(v) === i);
    return unique.length > 2 ? unique.slice(-2) : unique;
  });
  const [showBetBeforeChange, setShowBetBeforeChange] = useState<boolean>(
    initialSettings.showBetBeforeChange ?? DEFAULT_SETTINGS.showBetBeforeChange
  );
  const [cashDenominationMessage, setCashDenominationMessage] = useState<string | null>(null);
  const cashMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ALL_CASH_DENOMINATIONS = ["5", "10", "25", "50", "100", "500", "1000", "5000", "10000", "50000"] as const;

  function parseNum(val: string, def: number): number {
    const n = Number(val);
    return val.trim() === "" || isNaN(n) ? def : n;
  }

  function showCashDenominationMessage(message: string) {
    setCashDenominationMessage(message);
    if (cashMessageTimerRef.current) clearTimeout(cashMessageTimerRef.current);
    cashMessageTimerRef.current = setTimeout(() => {
      setCashDenominationMessage(null);
      cashMessageTimerRef.current = null;
    }, 3000);
  }

  // Очистить таймер при размонтировании
  useEffect(() => {
    return () => {
      if (cashMessageTimerRef.current) clearTimeout(cashMessageTimerRef.current);
    };
  }, []);

  // Авто-фильтрация выбранных номиналов при изменении диапазона рулетки
  useEffect(() => {
    const min = parseNum(minBet, DEFAULT_SETTINGS.minBet);
    const max = parseNum(maxBet, DEFAULT_SETTINGS.maxBet);
    setCashDenominationMessage(null);
    setCashChipValues((current) => {
      const valid = current.filter((v) => Number(v) >= min && Number(v) <= max);
      if (valid.length === current.length) return current; // ничего не изменилось
      if (valid.length > 0) return valid;
      // Нет ни одного допустимого — выбрать первый из полного списка, попадающий в диапазон
      const first = ALL_CASH_DENOMINATIONS.find((v) => Number(v) >= min && Number(v) <= max);
      return first ? [first] : current;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minBet, maxBet]);

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
      neighboursMultiplicity: Math.max(1, parseNum(neighboursMultiplicity, DEFAULT_SETTINGS.neighboursMultiplicity)),
      colorNumbersCount: Math.max(0, Math.floor(parseNum(colorNumbersCount, DEFAULT_SETTINGS.colorNumbersCount))),
      cashChipValues: cashChipValues.length ? cashChipValues : DEFAULT_SETTINGS.cashChipValues,
      showBetBeforeChange,
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
          <NumField
            label="Кратность соседей"
            value={neighboursMultiplicity}
            defaultVal={DEFAULT_SETTINGS.neighboursMultiplicity}
            onChange={setNeighboursMultiplicity}
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
        <div className="settings-section-title">Цвет / Кэш</div>
        <div className="settings-grid-2">
          <NumField label="Номинал цвета на рулетке" value={chipValue} defaultVal={DEFAULT_SETTINGS.chipValue} onChange={setChipValue} />
          <NumField label="Количество фишек цвета в поле" value={chipsInField} defaultVal={DEFAULT_SETTINGS.chipsInField} onChange={setChipsInField} />
          <NumField label="Количество номеров с цветом" value={colorNumbersCount} defaultVal={DEFAULT_SETTINGS.colorNumbersCount} onChange={setColorNumbersCount} />
          <NumField label="Сумма кэша на поле" value={cashOnField} defaultVal={DEFAULT_SETTINGS.cashOnField} onChange={setCashOnField} />
          <div className="settings-field" style={{ gridColumn: "1 / -1" }}>
            <label className="settings-label">Номинал кэша на поле</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              {(["5", "10", "25", "50", "100", "500", "1000", "5000", "10000", "50000"] as const).map((val) => {
                const checked = cashChipValues.includes(val);
                const numVal = Number(val);
                const min = parseNum(minBet, DEFAULT_SETTINGS.minBet);
                const max = parseNum(maxBet, DEFAULT_SETTINGS.maxBet);
                // Уже выбранный номинал никогда не выглядит недоступным
                const isOutOfRange = !checked && (numVal < min || numVal > max);
                return (
                  <label
                    key={val}
                    aria-pressed={checked}
                    aria-disabled={isOutOfRange}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      cursor: isOutOfRange ? "not-allowed" : "pointer",
                      padding: "4px 12px",
                      borderRadius: 4,
                      border: checked ? "1px solid #C9A227" : "1px solid #5a4a2a",
                      background: checked ? "rgba(201,162,39,0.12)" : "transparent",
                      color: checked ? "#C9A227" : "#8a7a5a",
                      fontSize: 13,
                      fontFamily: "inherit",
                      transition: "all 0.15s",
                      userSelect: "none",
                      opacity: isOutOfRange ? 0.45 : 1,
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      // 1. Уже выбран — снять выбор (без проверки диапазона)
                      if (checked) {
                        if (cashChipValues.length === 1) {
                          toast("Необходимо выбрать хотя бы один номинал");
                          return;
                        }
                        setCashChipValues((current) => current.filter((v) => v !== val));
                        return;
                      }
                      // 2. Не выбран — проверить диапазон
                      if (numVal < min) {
                        showCashDenominationMessage(`Номинал ${val} меньше минимальной ставки рулетки — ${min}.`);
                        return;
                      }
                      if (numVal > max) {
                        showCashDenominationMessage(`Номинал ${val} превышает максимальную ставку рулетки — ${max}.`);
                        return;
                      }
                      // 3. Допустимый номинал — FIFO, очистить сообщение
                      setCashDenominationMessage(null);
                      setCashChipValues((current) => {
                        if (current.length >= 2) return [...current.slice(1), val];
                        return [...current, val];
                      });
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      readOnly
                      style={{ display: "none" }}
                    />
                    {val}
                  </label>
                );
              })}
            </div>
            {cashDenominationMessage && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  marginTop: 8,
                  padding: "7px 12px",
                  border: "1px solid rgba(201,162,39,0.45)",
                  borderRadius: 6,
                  background: "rgba(20,12,4,0.97)",
                  fontSize: 13,
                  lineHeight: 1.35,
                  color: "#c8a84b",
                  fontFamily: "inherit",
                }}
              >
                {cashDenominationMessage}
              </div>
            )}
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
        <div className="settings-section-title">Отображение</div>
        <div className="settings-grid-2">
          <div className="settings-field" style={{ gridColumn: "1 / -1" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
              <div
                onClick={() => setShowBetBeforeChange(v => !v)}
                style={{
                  width: 44, height: 24, borderRadius: 12, position: "relative", cursor: "pointer",
                  background: showBetBeforeChange ? "#C9A227" : "#2a2010",
                  border: showBetBeforeChange ? "1px solid #C9A227" : "1px solid #5a4a2a",
                  transition: "background 0.2s, border-color 0.2s",
                  flexShrink: 0,
                }}
              >
                <div style={{
                  position: "absolute", top: 2, left: showBetBeforeChange ? 22 : 2,
                  width: 18, height: 18, borderRadius: "50%",
                  background: showBetBeforeChange ? "#fff" : "#8a7a5a",
                  transition: "left 0.2s",
                }} />
              </div>
              <span
                className="settings-label"
                style={{ marginBottom: 0, cursor: "pointer" }}
                onClick={() => setShowBetBeforeChange(v => !v)}
              >
                Показывать ставку без сдачи (комплиты, серии, соседи)
              </span>
            </label>
          </div>
        </div>

        <div className="settings-divider" />
        <div className="settings-footer" style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button className="settings-start-btn" onClick={handleStart}>
            Применить
          </button>
        </div>
      </div>
    </div>
  );
}
