import { getCombinationGame } from "@/poker/combinationCatalog";

interface Props {
  gameId: string;
  onBack: () => void;
}

export default function CombinationReferencePage({ gameId, onBack }: Props) {
  const game = getCombinationGame(gameId);
  const emptyMessage = game
    ? game.catalog.combinations.length === 0
      ? "Справочник комбинаций пока не заполнен"
      : null
    : "Справочник для этой игры не найден";

  return (
    <main className="settings-page cards-combinations-page">
      <section
        className="settings-card cards-combinations-card"
        aria-labelledby="cards-combinations-title"
        data-testid={`page-combinations-${gameId}`}
      >
        <h1
          id="cards-combinations-title"
          className="settings-title cards-combinations-title"
          data-testid="heading-card-combinations"
        >
          {game?.title ?? "Справочник комбинаций"}
        </h1>

        <div className="settings-divider" />

        <div className="cards-combinations-empty" data-testid="status-combination-catalog">
          {emptyMessage && <p role="status">{emptyMessage}</p>}
        </div>

        <div className="settings-divider" />

        <div className="settings-footer">
          <button
            className="grid-toggle-btn"
            type="button"
            onClick={onBack}
            data-testid="button-back-to-card-settings"
          >
            Назад
          </button>
        </div>
      </section>
    </main>
  );
}
