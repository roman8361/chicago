import russianPokerCombinations from "@/poker/games/russian-poker/combinations.json";

export interface CombinationCatalog {
  gameId: string;
  combinations: readonly unknown[];
}

export interface CombinationGameDefinition {
  id: string;
  title: string;
  catalog: CombinationCatalog;
}

const gameRegistry = {
  "russian-poker": {
    id: "russian-poker",
    title: "Комбинации русского покера",
    catalog: russianPokerCombinations,
  },
} satisfies Record<string, CombinationGameDefinition>;

export type CombinationGameId = keyof typeof gameRegistry;

export function getCombinationGame(gameId: string): CombinationGameDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(gameRegistry, gameId)
    ? gameRegistry[gameId as CombinationGameId]
    : undefined;
}
