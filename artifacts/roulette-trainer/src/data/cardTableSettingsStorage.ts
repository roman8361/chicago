import {
  DEFAULT_CARD_TABLE_SETTINGS,
  type CardTableSettings,
} from "@/types/cardTableSettings";

export const CARD_TABLE_SETTINGS_STORAGE_KEY = "roulette-trainer-card-table-settings";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function loadCardTableSettings(): CardTableSettings {
  try {
    const raw = window.localStorage.getItem(CARD_TABLE_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_CARD_TABLE_SETTINGS;

    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed) || !isObject(parsed.pokerGames)) {
      return DEFAULT_CARD_TABLE_SETTINGS;
    }

    const russianPoker = isObject(parsed.pokerGames.russianPoker)
      ? parsed.pokerGames.russianPoker
      : {};

    return {
      ...DEFAULT_CARD_TABLE_SETTINGS,
      pokerGames: {
        ...DEFAULT_CARD_TABLE_SETTINGS.pokerGames,
        russianPoker: {
          ...DEFAULT_CARD_TABLE_SETTINGS.pokerGames.russianPoker,
          enabled: russianPoker.enabled === true,
        },
      },
    };
  } catch {
    return DEFAULT_CARD_TABLE_SETTINGS;
  }
}

export function saveCardTableSettings(settings: CardTableSettings): void {
  window.localStorage.setItem(CARD_TABLE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}