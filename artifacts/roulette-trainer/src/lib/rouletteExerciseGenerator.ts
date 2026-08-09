import type { GameState } from "@/lib/rouletteGame";
import type { GameSettings } from "@/types/gameSettings";

type RouletteExerciseGenerator = (settings: GameSettings) => GameState | undefined;

let registeredGenerator: RouletteExerciseGenerator | null = null;

export function registerRouletteExerciseGenerator(
  generator: RouletteExerciseGenerator,
): () => void {
  registeredGenerator = generator;
  return () => {
    if (registeredGenerator === generator) registeredGenerator = null;
  };
}

export function generateRouletteExercise(settings: GameSettings): GameState {
  if (!registeredGenerator) {
    throw new Error("Roulette exercise generator is not available.");
  }
  const game = registeredGenerator(settings);
  if (!game) {
    throw new Error("Roulette exercise generation did not produce a game.");
  }
  return game;
}