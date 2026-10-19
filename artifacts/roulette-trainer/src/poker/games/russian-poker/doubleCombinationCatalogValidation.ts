export interface DoubleCombinationDeal {
  id: string;
  cards: string[];
  bonusCombinations: string[];
  resultCombination: string;
  sourceRow?: number;
  sourceOrdinal?: number;
}

export interface DoubleCombinationGroup {
  id: string;
  name: string;
  deals: DoubleCombinationDeal[];
  invalidDealCount: number;
}

export interface DoubleCombinationCatalog {
  groups: DoubleCombinationGroup[];
  errors: string[];
  fatalError: string | null;
}

const CARD_CODES = new Set(
  ["c", "d", "h", "s"].flatMap((suit) =>
    ["2", "3", "4", "5", "6", "7", "8", "9", "10", "j", "q", "k", "a"]
      .map((rank) => `${suit}${rank}`),
  ),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateDoubleCombinationData(raw: string): DoubleCombinationCatalog {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      groups: [],
      errors: [],
      fatalError: "Не удалось прочитать справочник двойных комбинаций: JSON содержит синтаксическую ошибку.",
    };
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.groups)) {
    return {
      groups: [],
      errors: [],
      fatalError: "Структура справочника двойных комбинаций некорректна: ожидается список groups.",
    };
  }

  const errors: string[] = [];
  const groups: DoubleCombinationGroup[] = [];
  const seenGroupIds = new Set<string>();

  parsed.groups.forEach((rawGroup, groupIndex) => {
    if (!isRecord(rawGroup) || !isNonEmptyString(rawGroup.id) || !isNonEmptyString(rawGroup.name)) {
      errors.push(`Группа №${groupIndex + 1} пропущена: отсутствует корректный ID или название.`);
      return;
    }

    if (seenGroupIds.has(rawGroup.id)) {
      errors.push(`ID группы «${rawGroup.id}» повторяется. Исправьте справочник перед запуском серии.`);
      return;
    }
    seenGroupIds.add(rawGroup.id);

    if (!Array.isArray(rawGroup.deals)) {
      errors.push(`Группа «${rawGroup.name}» пропущена: поле deals должно быть списком.`);
      return;
    }

    const deals: DoubleCombinationDeal[] = [];
    const seenDealIds = new Set<string>();
    let invalidDealCount = 0;

    rawGroup.deals.forEach((rawDeal, dealIndex) => {
      const fail = (reason: string) => {
        invalidDealCount++;
        errors.push(`Группа «${rawGroup.name}», раздача №${dealIndex + 1}: ${reason}`);
      };

      if (!isRecord(rawDeal) || !isNonEmptyString(rawDeal.id)) {
        fail("отсутствует корректный ID.");
        return;
      }

      if (seenDealIds.has(rawDeal.id)) {
        fail(`ID «${rawDeal.id}» повторяется.`);
        return;
      }
      seenDealIds.add(rawDeal.id);

      if (!Array.isArray(rawDeal.cards) || rawDeal.cards.length !== 6) {
        fail("нужно указать ровно шесть карт.");
        return;
      }
      if (!rawDeal.cards.every((card): card is string => typeof card === "string" && CARD_CODES.has(card))) {
        fail("указан неизвестный код карты.");
        return;
      }
      if (new Set(rawDeal.cards).size !== 6) {
        fail("карты внутри раздачи должны быть уникальными.");
        return;
      }
      if (
        !Array.isArray(rawDeal.bonusCombinations) ||
        !rawDeal.bonusCombinations.every((value) => typeof value === "string") ||
        typeof rawDeal.resultCombination !== "string"
      ) {
        fail("некорректно заполнены бонусные комбинации или результат.");
        return;
      }

      deals.push({
        id: rawDeal.id,
        cards: [...rawDeal.cards],
        bonusCombinations: [...rawDeal.bonusCombinations],
        resultCombination: rawDeal.resultCombination,
        ...(typeof rawDeal.sourceRow === "number" ? { sourceRow: rawDeal.sourceRow } : {}),
        ...(typeof rawDeal.sourceOrdinal === "number" ? { sourceOrdinal: rawDeal.sourceOrdinal } : {}),
      });
    });

    groups.push({
      id: rawGroup.id,
      name: rawGroup.name,
      deals,
      invalidDealCount,
    });
  });

  if (seenGroupIds.size !== parsed.groups.length) {
    errors.push("В справочнике есть группы с некорректными данными или повторяющимися ID.");
  }

  return { groups, errors, fatalError: null };
}

/** Treat card sets in different orders as the same six-card deal. */
export function getUniqueCardDeals(
  deals: readonly DoubleCombinationDeal[],
): DoubleCombinationDeal[] {
  const unique = new Map<string, DoubleCombinationDeal>();
  for (const deal of deals) {
    const key = [...deal.cards].sort().join("|");
    if (!unique.has(key)) unique.set(key, deal);
  }
  return [...unique.values()];
}
