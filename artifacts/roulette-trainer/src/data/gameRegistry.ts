export type GameType = "ROULETTE";

export type GameDefinition = {
  type: GameType;
  title: string;
  enabled: boolean;
};

export const GAME_REGISTRY: readonly GameDefinition[] = [
  {
    type: "ROULETTE",
    title: "Roulette",
    enabled: true,
  },
];

export function getGameDefinition(gameType: GameType): GameDefinition | undefined {
  return GAME_REGISTRY.find((game) => game.type === gameType);
}