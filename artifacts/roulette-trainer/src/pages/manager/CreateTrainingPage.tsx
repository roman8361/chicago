import { useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { getDealers } from "@/data/dealerStorage";
import { addTraining } from "@/data/trainingStorage";

type NumberField = "neighborsCount" | "completesCount" | "seriesCount" | "colorCount" | "cashAmount";

type TrainingForm = {
  neighborsCount: string;
  completesCount: string;
  seriesCount: string;
  colorEnabled: boolean;
  colorCount: string;
  cashEnabled: boolean;
  cashAmount: string;
};

const INITIAL_FORM: TrainingForm = {
  neighborsCount: "5",
  completesCount: "2",
  seriesCount: "2",
  colorEnabled: true,
  colorCount: "100",
  cashEnabled: true,
  cashAmount: "1000",
};

function parseNonNegativeInteger(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export default function CreateTrainingPage() {
  const [, params] = useRoute("/manager/dealers/:dealerId/training/new");
  const [, navigate] = useLocation();
  const dealerId = params?.dealerId;
  const selectedDealerId = dealerId;
  const dealer = selectedDealerId
    ? getDealers().find((candidate) => candidate.id === selectedDealerId)
    : undefined;
  const [form, setForm] = useState<TrainingForm>(INITIAL_FORM);
  const [error, setError] = useState("");

  if (!dealer || !selectedDealerId) {
    return (
      <main className="account-page">
        <section className="account-card" aria-labelledby="dealer-not-found-title">
          <h1 id="dealer-not-found-title">Дилер не найден</h1>
          <Link className="account-button account-button--inline" href="/manager">
            Вернуться к списку
          </Link>
        </section>
      </main>
    );
  }

  function updateNumberField(field: NumberField, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    if (error) setError("");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentDealerId = selectedDealerId;
    if (!currentDealerId) return;

    const neighborsCount = parseNonNegativeInteger(form.neighborsCount);
    const completesCount = parseNonNegativeInteger(form.completesCount);
    const seriesCount = parseNonNegativeInteger(form.seriesCount);
    const colorCount = parseNonNegativeInteger(form.colorCount);
    const cashAmount = parseNonNegativeInteger(form.cashAmount);

    if (
      neighborsCount === null ||
      completesCount === null ||
      seriesCount === null ||
      colorCount === null ||
      cashAmount === null
    ) {
      setError("Введите целые неотрицательные значения");
      return;
    }

    addTraining(currentDealerId, {
      neighborsCount,
      completesCount,
      seriesCount,
      colorEnabled: form.colorEnabled,
      colorCount,
      cashEnabled: form.cashEnabled,
      cashAmount,
    });
    navigate(`/manager/dealers/${encodeURIComponent(currentDealerId)}`);
  }

  return (
    <main className="account-page">
      <section className="account-card training-card" aria-labelledby="new-training-title">
        <p className="account-eyebrow">Roulette Dealer Trainer</p>
        <h1 id="new-training-title">Новая тренировка</h1>

        <div className="training-summary">
          <p><strong>Дилер:</strong> {dealer.fullName}</p>
          <p><strong>Игра:</strong> Roulette</p>
        </div>

        <form className="training-form" onSubmit={handleSubmit}>
          <h2>Уровень сложности</h2>

          <label className="training-field">
            <span>Количество соседей</span>
            <input
              type="number"
              min="0"
              step="1"
              value={form.neighborsCount}
              onChange={(event) => updateNumberField("neighborsCount", event.target.value)}
            />
          </label>

          <label className="training-field">
            <span>Количество комплитов</span>
            <input
              type="number"
              min="0"
              step="1"
              value={form.completesCount}
              onChange={(event) => updateNumberField("completesCount", event.target.value)}
            />
          </label>

          <label className="training-field">
            <span>Количество серий</span>
            <input
              type="number"
              min="0"
              step="1"
              value={form.seriesCount}
              onChange={(event) => updateNumberField("seriesCount", event.target.value)}
            />
          </label>

          <label className="training-checkbox">
            <input
              type="checkbox"
              checked={form.colorEnabled}
              onChange={(event) => setForm((current) => ({ ...current, colorEnabled: event.target.checked }))}
            />
            <span>Цветные фишки</span>
          </label>

          {form.colorEnabled && (
            <label className="training-field">
              <span>Количество цветных фишек</span>
              <input
                type="number"
                min="0"
                step="1"
                value={form.colorCount}
                onChange={(event) => updateNumberField("colorCount", event.target.value)}
              />
            </label>
          )}

          <label className="training-checkbox">
            <input
              type="checkbox"
              checked={form.cashEnabled}
              onChange={(event) => setForm((current) => ({ ...current, cashEnabled: event.target.checked }))}
            />
            <span>Кэш на поле</span>
          </label>

          {form.cashEnabled && (
            <label className="training-field">
              <span>Сумма кэша</span>
              <input
                type="number"
                min="0"
                step="1"
                value={form.cashAmount}
                onChange={(event) => updateNumberField("cashAmount", event.target.value)}
              />
            </label>
          )}

          {error && <p className="training-form-error">{error}</p>}

          <div className="training-form-actions">
            <button className="account-button" type="submit">
              Создать тренировку
            </button>
            <Link className="account-link" href={`/manager/dealers/${encodeURIComponent(selectedDealerId)}`}>
              Отмена
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}