import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_SETTINGS, type GameSettings } from "@/types/gameSettings";
import type { GameType } from "@/data/gameRegistry";

type TrainingWizardContextValue = {
  gameType: GameType | null;
  gameConfig: GameSettings;
  dealerIds: string[];
  sourceDealerId: string | null;
  setGameType: (gameType: GameType | null) => void;
  setGameConfig: (settings: GameSettings) => void;
  setDealerIds: (dealerIds: string[]) => void;
  startNew: (sourceDealerId?: string | null) => void;
  initializeDealerSelection: (dealerIds: string[]) => void;
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
  const [dealerIds, setDealerIds] = useState<string[]>([]);
  const [sourceDealerId, setSourceDealerId] = useState<string | null>(null);
  const dealerSelectionInitialized = useRef(false);
  const reset = useCallback(() => {
    setGameType(null);
    setGameConfig(createDefaultSettings());
    setDealerIds([]);
    setSourceDealerId(null);
    dealerSelectionInitialized.current = false;
  }, []);
  const startNew = useCallback((initialDealerId?: string | null) => {
    setGameType(null);
    setGameConfig(createDefaultSettings());
    setDealerIds([]);
    setSourceDealerId(initialDealerId ?? null);
    dealerSelectionInitialized.current = false;
  }, []);
  const initializeDealerSelection = useCallback((initialIds: string[]) => {
    if (dealerSelectionInitialized.current) return;
    dealerSelectionInitialized.current = true;
    setDealerIds(initialIds);
  }, []);

  const value = useMemo<TrainingWizardContextValue>(() => ({
    gameType,
    gameConfig,
    dealerIds,
    sourceDealerId,
    setGameType,
    setGameConfig,
    setDealerIds,
    startNew,
    initializeDealerSelection,
    reset,
  }), [
    gameType,
    gameConfig,
    dealerIds,
    sourceDealerId,
    startNew,
    initializeDealerSelection,
    reset,
  ]);

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