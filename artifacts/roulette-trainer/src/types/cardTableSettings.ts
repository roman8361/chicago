export type PokerGameId = "russianPoker";

export interface RussianPokerSettings {
  enabled: boolean;
  dealCount: number;
  selectedGroupIds: string[];
}

export interface CardTableSettings {
  pokerGames: Record<PokerGameId, RussianPokerSettings>;
}

export const DEFAULT_CARD_TABLE_SETTINGS: CardTableSettings = {
  pokerGames: {
    russianPoker: {
      enabled: false,
      dealCount: 10,
      selectedGroupIds: [],
    },
  },
};