import type { GameSettings } from "@/types/gameSettings";

type SettingRow = {
  label: string;
  value: string;
};

function yesNo(value: "yes" | "no") {
  return value === "yes" ? "Да" : "Нет";
}

function rows(settings: GameSettings): SettingRow[] {
  return [
    { label: "Минимум рулетки", value: String(settings.minBet) },
    { label: "Максимум рулетки", value: String(settings.maxBet) },
    { label: 'Количество ставок «Соседи номера»', value: String(settings.neighborsCount) },
    { label: "Кратность соседей", value: String(settings.neighboursMultiplicity) },
    { label: 'Ставка на «5/8»', value: yesNo(settings.bet58) },
    { label: 'Ставка на «Orphelins»', value: yesNo(settings.betOrphelins) },
    { label: 'Ставка на «Seria 0/2/3»', value: yesNo(settings.betSeria023) },
    { label: 'Ставка на «Zero Spiel»', value: yesNo(settings.betZeroSpiel) },
    { label: "Номинал цвета на рулетке", value: String(settings.chipValue) },
    { label: "Количество фишек цвета в поле", value: String(settings.chipsInField) },
    { label: "Сумма кэша на поле", value: String(settings.cashOnField) },
    { label: "Номиналы кэша на поле", value: settings.cashChipValues.join(", ") },
    { label: "Кратность серии", value: String(settings.multiplicity) },
    { label: "Комплит дюжины", value: yesNo(settings.completeDozen) },
    { label: "Комплит поля", value: yesNo(settings.completeField) },
    { label: "Количество комплитов", value: String(settings.completeCount) },
    { label: "Кратность комплита", value: String(settings.completeMultiplicity) },
    { label: "Количество номеров с цветом", value: String(settings.colorNumbersCount) },
    { label: "Показывать ставку без сдачи", value: settings.showBetBeforeChange ? "Да" : "Нет" },
  ];
}

export default function RouletteSettingsSummary({ settings }: { settings: GameSettings }) {
  return (
    <div className="roulette-settings-summary">
      {rows(settings).map((row) => (
        <div className="roulette-settings-summary-row" key={row.label}>
          <span>{row.label}</span>
          <strong>{row.value}</strong>
        </div>
      ))}
    </div>
  );
}