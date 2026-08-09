import { useRoute, useLocation, Link } from "wouter";
import { getDealers } from "@/data/dealerStorage";
import { addTraining } from "@/data/trainingStorage";
import { DEFAULT_SETTINGS, type GameSettings } from "@/types/gameSettings";
import SettingsScreen from "@/pages/SettingsScreen";

export default function CreateTrainingPage() {
  const [, params] = useRoute("/manager/dealers/:dealerId/training/new");
  const [, navigate] = useLocation();
  const dealerId = params?.dealerId;

  if (!dealerId) {
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

  const dealer = getDealers().find((candidate) => candidate.id === dealerId);

  if (!dealer) {
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

  function handleCreate(settings: GameSettings) {
    if (!dealerId) return;
    addTraining(dealerId, settings);
    navigate(`/manager/dealers/${encodeURIComponent(dealerId)}`);
  }

  return (
    <SettingsScreen
      initialSettings={{ ...DEFAULT_SETTINGS, cashChipValues: [...DEFAULT_SETTINGS.cashChipValues] }}
      title="Новая тренировка"
      submitLabel="Создать тренировку"
      onStart={handleCreate}
      onCancel={() => navigate(`/manager/dealers/${encodeURIComponent(dealerId)}`)}
      header={
        <div className="training-summary">
          <p><strong>Дилер:</strong> {dealer.fullName}</p>
          <p><strong>Игра:</strong> Roulette</p>
        </div>
      }
    />
  );
}