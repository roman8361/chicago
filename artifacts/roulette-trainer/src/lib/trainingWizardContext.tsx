import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_SETTINGS, type GameSettings } from "@/types/gameSettings";
import type { GameType } from "@/data/gameRegistry";

type TrainingWizardContextValue = {
  gameType: GameType | null;
  gameConfig: GameSettings;
  setGameType: (gameType: GameType | null) => void;
  setGameConfig: (settings: GameSettings) => void;
  reset: () => void;
};

const TrainingWizardContext = createContext<TrainingWizardContextValue | null>(null);

function createDefaultSettings(): GameSettings {
  return {
    ...DEFAULT_SETTINGS,
    cashChipValues: [...DEFAULT_SETTINGS.cashChipValues],
  };
}

export function TrainingWizardProvider({ children }: { children: ReactNode }) {
  const [gameType, setGameType] = useState<GameType | null>(null);
  const [gameConfig, setGameConfig] = useState<GameSettings>(createDefaultSettings);
  const reset = useCallback(() => {
    setGameType(null);
    setGameConfig(createDefaultSettings());
  }, []);

  const value = useMemo<TrainingWizardContextValue>(() => ({
    gameType,
    gameConfig,
    setGameType,
    setGameConfig,
    reset,
  }), [gameType, gameConfig, reset]);

  return (
    <TrainingWizardContext.Provider value={value}>
      {children}
    </TrainingWizardContext.Provider>
  );
}

export function useTrainingWizard() {
  const context = useContext(TrainingWizardContext);
  if (!context) {
    throw new Error("useTrainingWizard must be used inside TrainingWizardProvider");
  }
  return context;
}