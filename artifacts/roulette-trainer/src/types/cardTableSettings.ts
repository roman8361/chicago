export type PokerGameId = "russianPoker";

export interface PokerGameSettings {
  enabled: boolean;
}

export interface CardTableSettings {
  pokerGames: Record<PokerGameId, PokerGameSettings>;
}

export const DEFAULT_CARD_TABLE_SETTINGS: CardTableSettings = {
  pokerGames: {
    russianPoker: {
      enabled: false,
    },
  },
};