import { useState } from "react";
import doubleCombinations from "@/poker/games/russian-poker/double-combinations.json";

export default function DoubleCombinationsTab() {
  const [selectedGroupId, setSelectedGroupId] = useState(
    () => doubleCombinations.groups[0]?.id ?? "",
  );
  const selectedGroup = doubleCombinations.groups.find(
    (group) => group.id === selectedGroupId,
  );

  return (
    <section className="cards-double-combinations" data-testid="double-combinations-panel">
      <h2 className="cards-double-combinations-heading">Двойные комбинации</h2>

      {doubleCombinations.groups.length > 0 ? (
        <div
          className="cards-double-group-tabs"
          role="tablist"
          aria-label="Группы двойных комбинаций"
          data-testid="double-combinations-groups"
        >
          {doubleCombinations.groups.map((group) => {
            const selected = group.id === selectedGroupId;
            return (
              <button
                key={group.id}
                id={`double-combination-group-${group.id}`}
                className={`cards-double-group-tab${selected ? " cards-double-group-tab--active" : ""}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="double-combination-deals"
                onClick={() => setSelectedGroupId(group.id)}
                data-testid={`button-double-group-${group.id}`}
              >
                {group.name}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="cards-double-combinations-empty" role="status">
          Справочник двойных комбинаций пока не заполнен
        </p>
      )}

      {selectedGroup && (
        <div
          id="double-combination-deals"
          role="tabpanel"
          aria-labelledby={`double-combination-group-${selectedGroup.id}`}
          className="cards-double-deal-list"
        >
          {selectedGroup.deals.map((deal) => (
            <article
              key={deal.id}
              className="cards-double-deal"
              data-testid={`double-combination-deal-${deal.id}`}
            >
              <header className="cards-double-deal-header">
                <span className="cards-double-deal-group">{selectedGroup.name}</span>
                <span className="cards-double-deal-id">ID: {deal.id}</span>
              </header>

              <div className="cards-double-deal-bonuses">
                <span className="cards-double-deal-label">Бонусные комбинации</span>
                <ul>
                  {deal.bonusCombinations.map((bonus) => (
                    <li key={bonus}>{bonus}</li>
                  ))}
                </ul>
              </div>

              <div className="cards-double-deal-cards" aria-label="Шесть карт раздачи">
                {deal.cards.map((code) => (
                  <img
                    key={code}
                    className="cards-double-deal-card"
                    src={`/assets/cards/${code}.png`}
                    alt={`Карта ${code}`}
                    draggable={false}
                  />
                ))}
              </div>

              <div className="cards-double-deal-result">
                Итоговая комбинация: <strong>{deal.resultCombination}</strong>
                <span>Строка Excel: {deal.sourceRow} · № {deal.sourceOrdinal}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
